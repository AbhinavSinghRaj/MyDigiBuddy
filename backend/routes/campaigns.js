// routes/campaigns.js
// All campaign list/detail endpoints.
// Multitenancy is enforced by always filtering by req.user.tenantId.

const express = require('express')
const router = express.Router()
const prisma = require('../lib/prismaClient')
const { requireAuth } = require('../middleware/auth')

// ─── Google Ads ──────────────────────────────────────────────────────────────

// GET /campaigns/google
// Lists all Google campaigns for the current tenant, with high-level metrics.
router.get('/google', requireAuth, async (req, res) => {
  try {
    const campaigns = await prisma.googleCampaign.findMany({
      where: { tenantId: req.user.tenantId },
      include: {
        _count: { select: { adGroups: true } },
        connectedAccount: { select: { accountName: true, accountId: true, status: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })
    res.json(campaigns)
  } catch (err) {
    console.error('[campaigns/google]', err)
    res.status(500).json({ error: 'Failed to fetch campaigns' })
  }
})

// GET /campaigns/google/:id
// Full campaign detail: ad groups + ads.
router.get('/google/:id', requireAuth, async (req, res) => {
  try {
    const campaign = await prisma.googleCampaign.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId },
      include: {
        adGroups: {
          include: { ads: true },
        },
        connectedAccount: { select: { accountName: true, accountId: true } },
      },
    })

    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })
    res.json(campaign)
  } catch (err) {
    console.error('[campaigns/google/:id]', err)
    res.status(500).json({ error: 'Failed to fetch campaign' })
  }
})

// ─── Meta Ads ────────────────────────────────────────────────────────────────

// GET /campaigns/meta
router.get('/meta', requireAuth, async (req, res) => {
  try {
    const campaigns = await prisma.metaCampaign.findMany({
      where: { tenantId: req.user.tenantId },
      include: {
        _count: { select: { adSets: true } },
        connectedAccount: { select: { accountName: true, accountId: true, status: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })
    res.json(campaigns)
  } catch (err) {
    console.error('[campaigns/meta]', err)
    res.status(500).json({ error: 'Failed to fetch campaigns' })
  }
})

// GET /campaigns/meta/:id
router.get('/meta/:id', requireAuth, async (req, res) => {
  try {
    const campaign = await prisma.metaCampaign.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId },
      include: {
        adSets: {
          include: { ads: true },
        },
        connectedAccount: { select: { accountName: true, accountId: true } },
      },
    })

    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })
    res.json(campaign)
  } catch (err) {
    console.error('[campaigns/meta/:id]', err)
    res.status(500).json({ error: 'Failed to fetch campaign' })
  }
})

module.exports = router
