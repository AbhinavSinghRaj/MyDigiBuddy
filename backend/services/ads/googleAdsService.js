// services/ads/googleAdsService.js
// Uses the google-ads-api Node.js client to fetch campaign data
// and upsert it into our PostgreSQL database.
//
// Assumption: we store a single refresh_token per ConnectedAccount.
// The service exchanges it for a fresh access_token on each sync run.

const { GoogleAdsApi } = require('google-ads-api')
const prisma = require('../../lib/prismaClient')

const client = new GoogleAdsApi({
  client_id: process.env.GOOGLE_ADS_CLIENT_ID,
  client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
  developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
})

/**
 * Sync all campaigns (+ ad groups + ads) for a ConnectedAccount into the DB.
 * Called by the BullMQ sync worker.
 *
 * @param {string} tenantId
 * @param {string} connectedAccountId  Internal DB ID of the ConnectedAccount row
 */
async function syncGoogleAds(tenantId, connectedAccountId) {
  const account = await prisma.connectedAccount.findUnique({
    where: { id: connectedAccountId },
  })

  if (!account || account.status !== 'connected') {
    console.warn(`[googleAdsService] Account ${connectedAccountId} not connected — skipping sync`)
    return
  }

  // Build a customer client using the stored refresh_token
  const customer = client.Customer({
    customer_id: account.accountId,
    refresh_token: account.refreshToken,
  })

  try {
    // ── Fetch campaigns ──────────────────────────────────────────────────────
    const campaigns = await customer.query(`
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign_budget.amount_micros
      FROM campaign
      WHERE campaign.status != 'REMOVED'
    `)

    for (const row of campaigns) {
      const c = row.campaign
      const budgetMicros = row.campaign_budget?.amount_micros ?? 0
      const dailyBudget = budgetMicros / 1_000_000

      const dbCampaign = await prisma.googleCampaign.upsert({
        where: { tenantId_externalCampaignId: { tenantId, externalCampaignId: String(c.id) } },
        update: { name: c.name, status: c.status, campaignType: c.advertising_channel_type, dailyBudget, lastSyncedAt: new Date() },
        create: {
          tenantId,
          connectedAccountId,
          externalCampaignId: String(c.id),
          name: c.name,
          status: c.status,
          campaignType: c.advertising_channel_type,
          dailyBudget,
          currency: 'INR', // Assumption: INR — read from customer in production
          lastSyncedAt: new Date(),
        },
      })

      // ── Fetch ad groups for this campaign ────────────────────────────────
      const adGroups = await customer.query(`
        SELECT
          ad_group.id,
          ad_group.name,
          ad_group.status
        FROM ad_group
        WHERE ad_group.campaign = 'customers/${account.accountId}/campaigns/${c.id}'
          AND ad_group.status != 'REMOVED'
      `)

      for (const agRow of adGroups) {
        const ag = agRow.ad_group

        const dbAdGroup = await prisma.googleAdGroup.upsert({
          where: { googleCampaignId_externalAdGroupId: { googleCampaignId: dbCampaign.id, externalAdGroupId: String(ag.id) } },
          update: { name: ag.name, status: ag.status },
          create: { googleCampaignId: dbCampaign.id, externalAdGroupId: String(ag.id), name: ag.name, status: ag.status },
        }).catch(() => prisma.googleAdGroup.findFirst({ where: { googleCampaignId: dbCampaign.id, externalAdGroupId: String(ag.id) } }))

        // ── Fetch ads for this ad group ────────────────────────────────────
        const ads = await customer.query(`
          SELECT
            ad_group_ad.ad.id,
            ad_group_ad.status,
            ad_group_ad.ad.responsive_search_ad.headlines,
            ad_group_ad.ad.responsive_search_ad.descriptions
          FROM ad_group_ad
          WHERE ad_group_ad.ad_group = 'customers/${account.accountId}/adGroups/${ag.id}'
            AND ad_group_ad.status != 'REMOVED'
        `)

        for (const adRow of ads) {
          const ad = adRow.ad_group_ad
          const headlines = ad.ad.responsive_search_ad?.headlines?.map((h) => h.text) ?? []
          const descriptions = ad.ad.responsive_search_ad?.descriptions?.map((d) => d.text) ?? []

          await prisma.googleAd.upsert({
            where: { googleAdGroupId_externalAdId: { googleAdGroupId: dbAdGroup.id, externalAdId: String(ad.ad.id) } },
            update: { headline1: headlines[0], headline2: headlines[1], headline3: headlines[2], description1: descriptions[0], description2: descriptions[1], status: ad.status },
            create: { googleAdGroupId: dbAdGroup.id, externalAdId: String(ad.ad.id), headline1: headlines[0], headline2: headlines[1], headline3: headlines[2], description1: descriptions[0], description2: descriptions[1], status: ad.status },
          }).catch(() => null) // ignore unique constraint race conditions
        }
      }
    }

    console.log(`[googleAdsService] Synced ${campaigns.length} campaigns for tenant ${tenantId}`)
  } catch (err) {
    console.error(`[googleAdsService] Sync failed for account ${connectedAccountId}:`, err.message)
    await prisma.connectedAccount.update({
      where: { id: connectedAccountId },
      data: { status: 'error' },
    })
    throw err
  }
}

module.exports = { syncGoogleAds }
