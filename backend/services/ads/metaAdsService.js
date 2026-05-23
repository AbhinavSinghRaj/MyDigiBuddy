// services/ads/metaAdsService.js
// Uses the facebook-nodejs-business-sdk to fetch Meta campaign data
// and upsert it into our PostgreSQL database.
//
// Assumption: we store a long-lived user access token (60-day expiry) per ConnectedAccount.
// A separate cron job (jobs/tokenRefresh.js) must refresh it before expiry.

const bizSdk = require('facebook-nodejs-business-sdk')
const prisma = require('../../lib/prismaClient')

const { Campaign, AdSet, Ad, AdAccount } = bizSdk

/**
 * Sync all Meta campaigns for a ConnectedAccount into the DB.
 *
 * @param {string} tenantId
 * @param {string} connectedAccountId
 */
async function syncMetaAds(tenantId, connectedAccountId) {
  const account = await prisma.connectedAccount.findUnique({
    where: { id: connectedAccountId },
  })

  if (!account || account.status !== 'connected') {
    console.warn(`[metaAdsService] Account ${connectedAccountId} not connected — skipping`)
    return
  }

  // Initialise the SDK with this account's access token
  const api = bizSdk.FacebookAdsApi.init(account.accessToken)
  const adAccount = new AdAccount(account.accountId)

  try {
    // ── Fetch campaigns ──────────────────────────────────────────────────────
    const campaigns = await adAccount.getCampaigns(
      [Campaign.Fields.id, Campaign.Fields.name, Campaign.Fields.status, Campaign.Fields.objective],
      { limit: 100 },
    )

    for (const campaign of campaigns) {
      const dbCampaign = await prisma.metaCampaign.upsert({
        where: { tenantId_externalCampaignId: { tenantId, externalCampaignId: campaign.id } },
        update: { name: campaign.name, status: campaign.status, objective: campaign.objective, lastSyncedAt: new Date() },
        create: {
          tenantId,
          connectedAccountId,
          externalCampaignId: campaign.id,
          name: campaign.name,
          status: campaign.status,
          objective: campaign.objective || 'UNKNOWN',
          currency: 'INR',
          lastSyncedAt: new Date(),
        },
      })

      // ── Fetch ad sets ────────────────────────────────────────────────────
      const adSets = await campaign.getAdSets(
        [AdSet.Fields.id, AdSet.Fields.name, AdSet.Fields.status, AdSet.Fields.targeting, AdSet.Fields.daily_budget],
        { limit: 100 },
      )

      for (const adSet of adSets) {
        const dbAdSet = await prisma.metaAdSet.upsert({
          where: { metaCampaignId_externalAdSetId: { metaCampaignId: dbCampaign.id, externalAdSetId: adSet.id } },
          update: { name: adSet.name, status: adSet.status, targetAudience: adSet.targeting ?? {}, dailyBudget: adSet.daily_budget ? adSet.daily_budget / 100 : null },
          create: { metaCampaignId: dbCampaign.id, externalAdSetId: adSet.id, name: adSet.name, status: adSet.status, targetAudience: adSet.targeting ?? {}, dailyBudget: adSet.daily_budget ? adSet.daily_budget / 100 : null },
        })

        // ── Fetch ads ──────────────────────────────────────────────────────
        const ads = await adSet.getAds(
          [Ad.Fields.id, Ad.Fields.name, Ad.Fields.status, Ad.Fields.creative],
          { limit: 100 },
        )

        for (const ad of ads) {
          // Creative details require a separate call
          let primaryText, headline, description, imageUrl, callToAction
          try {
            const creative = await ad.getCreative([
              'body', 'title', 'link_description', 'image_url', 'call_to_action_type',
            ])
            primaryText = creative.body
            headline = creative.title
            description = creative.link_description
            imageUrl = creative.image_url
            callToAction = creative.call_to_action_type
          } catch {
            // Creative fetch can fail for some ad types — continue gracefully
          }

          await prisma.metaAd.upsert({
            where: { metaAdSetId_externalAdId: { metaAdSetId: dbAdSet.id, externalAdId: ad.id } },
            update: { status: ad.status, primaryText, headline, description, imageUrl, callToAction },
            create: { metaAdSetId: dbAdSet.id, externalAdId: ad.id, status: ad.status, primaryText, headline, description, imageUrl, callToAction },
          }).catch(() => null)
        }
      }
    }

    console.log(`[metaAdsService] Synced ${campaigns.length} campaigns for tenant ${tenantId}`)
  } catch (err) {
    console.error(`[metaAdsService] Sync failed for account ${connectedAccountId}:`, err.message)
    await prisma.connectedAccount.update({
      where: { id: connectedAccountId },
      data: { status: 'error' },
    })
    throw err
  }
}

module.exports = { syncMetaAds }
