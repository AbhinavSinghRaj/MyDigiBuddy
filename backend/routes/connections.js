// routes/connections.js
// Handles the OAuth flow for connecting ad accounts (separate from user sign-in).
//
// Flow:
//   1. Frontend calls POST /connections/google/start
//   2. Backend returns a Google OAuth URL
//   3. User is redirected there, approves, Google sends back ?code=...
//   4. GET /connections/google/callback exchanges code for refresh_token
//   5. ConnectedAccount is created/updated in DB
//   6. A background sync job is enqueued

const express = require('express')
const router = express.Router()
const axios = require('axios')
const prisma = require('../lib/prismaClient')
const { requireAuth } = require('../middleware/auth')
const { syncQueue } = require('../jobs/syncQueue')

// ─── Google Ads ──────────────────────────────────────────────────────────────

// POST /connections/google/start
// Returns the Google OAuth authorization URL.
router.post('/google/start', requireAuth, (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_ADS_REDIRECT_URI,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/adwords',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent', // always get refresh_token
    state: req.user.tenantId, // passed back in callback to identify the tenant
  })

  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` })
})

// GET /connections/google/callback
// Exchanges the OAuth code for tokens and stores them.
router.get('/google/callback', async (req, res) => {
  const { code, state: tenantId, error } = req.query

  if (error) return res.redirect(`${process.env.FRONTEND_URL}/dashboard/onboarding?error=google_denied`)
  if (!code || !tenantId) return res.status(400).send('Missing code or state')

  try {
    // Exchange authorization code for tokens
    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: process.env.GOOGLE_ADS_CLIENT_ID,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_ADS_REDIRECT_URI,
      grant_type: 'authorization_code',
    })

    const { access_token, refresh_token, expires_in } = tokenRes.data

    // Assumption: we use the access_token to fetch the Google Ads customer ID
    // via the Google Ads API listAccessibleCustomers endpoint.
    const customersRes = await axios.get(
      'https://googleads.googleapis.com/v17/customers:listAccessibleCustomers',
      { headers: { Authorization: `Bearer ${access_token}`, 'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN } },
    )

    const accountId = customersRes.data.resourceNames?.[0]?.split('/')[1] || 'unknown'

    // Upsert ConnectedAccount
    await prisma.connectedAccount.upsert({
      where: { tenantId_provider_accountId: { tenantId, provider: 'google_ads', accountId } },
      update: { accessToken: access_token, refreshToken: refresh_token, expiresAt: new Date(Date.now() + expires_in * 1000), status: 'connected' },
      create: { tenantId, provider: 'google_ads', accountId, accessToken: access_token, refreshToken: refresh_token, expiresAt: new Date(Date.now() + expires_in * 1000), status: 'connected' },
    })

    // Enqueue an immediate sync job
    await syncQueue.add('sync_google', { tenantId, provider: 'google_ads' }, { priority: 1 })

    res.redirect(`${process.env.FRONTEND_URL}/dashboard/google?connected=true`)
  } catch (err) {
    console.error('[connections/google/callback]', err.response?.data || err.message)
    res.redirect(`${process.env.FRONTEND_URL}/dashboard/onboarding?error=google_callback_failed`)
  }
})

// ─── Meta Ads ────────────────────────────────────────────────────────────────

// POST /connections/meta/start
router.post('/meta/start', requireAuth, (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID,
    redirect_uri: process.env.META_REDIRECT_URI,
    scope: 'ads_management,ads_read,business_management',
    response_type: 'code',
    state: req.user.tenantId,
  })

  res.json({ url: `https://www.facebook.com/v20.0/dialog/oauth?${params}` })
})

// GET /connections/meta/callback
router.get('/meta/callback', async (req, res) => {
  const { code, state: tenantId, error } = req.query

  if (error) return res.redirect(`${process.env.FRONTEND_URL}/dashboard/onboarding?error=meta_denied`)
  if (!code || !tenantId) return res.status(400).send('Missing code or state')

  try {
    // Exchange code for a long-lived access token
    const tokenRes = await axios.get('https://graph.facebook.com/v20.0/oauth/access_token', {
      params: {
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        redirect_uri: process.env.META_REDIRECT_URI,
        code,
      },
    })

    const { access_token, expires_in } = tokenRes.data

    // Exchange for a long-lived user token (60-day expiry)
    const longLivedRes = await axios.get('https://graph.facebook.com/v20.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        fb_exchange_token: access_token,
      },
    })

    const longLivedToken = longLivedRes.data.access_token

    // Fetch the Ad Account ID
    const meRes = await axios.get('https://graph.facebook.com/v20.0/me/adaccounts', {
      params: { access_token: longLivedToken, fields: 'id,name' },
    })

    const adAccount = meRes.data.data?.[0]
    const accountId = adAccount?.id || 'unknown'
    const accountName = adAccount?.name

    await prisma.connectedAccount.upsert({
      where: { tenantId_provider_accountId: { tenantId, provider: 'meta_ads', accountId } },
      update: { accessToken: longLivedToken, expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), status: 'connected', accountName },
      create: { tenantId, provider: 'meta_ads', accountId, accountName, accessToken: longLivedToken, expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), status: 'connected' },
    })

    await syncQueue.add('sync_meta', { tenantId, provider: 'meta_ads' }, { priority: 1 })

    res.redirect(`${process.env.FRONTEND_URL}/dashboard/meta?connected=true`)
  } catch (err) {
    console.error('[connections/meta/callback]', err.response?.data || err.message)
    res.redirect(`${process.env.FRONTEND_URL}/dashboard/onboarding?error=meta_callback_failed`)
  }
})

// GET /connections — list all connected accounts for current tenant
router.get('/', requireAuth, async (req, res) => {
  const accounts = await prisma.connectedAccount.findMany({
    where: { tenantId: req.user.tenantId },
    select: { id: true, provider: true, accountId: true, accountName: true, status: true, expiresAt: true },
  })
  res.json(accounts)
})

// DELETE /connections/:id — disconnect an account
router.delete('/:id', requireAuth, async (req, res) => {
  await prisma.connectedAccount.updateMany({
    where: { id: req.params.id, tenantId: req.user.tenantId },
    data: { status: 'disconnected' },
  })
  res.json({ ok: true })
})

module.exports = router
