// routes/ai.js
// AI-powered endpoints. All LLM calls happen here (server-side only).
// Rate-limited per tenant via express-rate-limit.
// Multitenancy: campaignIds are validated against req.user.tenantId before use.

const express = require('express')
const router = express.Router()
const rateLimit = require('express-rate-limit')
const prisma = require('../lib/prismaClient')
const { requireAuth } = require('../middleware/auth')
const { callLLM, parseLLMJson } = require('../lib/llm/client')
const { optimizationPrompt, adCopyPrompt, weeklySummaryPrompt } = require('../lib/llm/prompts')

// Per-tenant: max 30 AI calls per 15 minutes.
// In production, key this on req.user.tenantId instead of IP.
const aiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user?.tenantId || req.ip,
  message: { error: 'Too many AI requests. Please wait a few minutes.' },
})

router.use(requireAuth, aiRateLimit)

// POST /ai/optimize/google
// Accepts an array of campaign IDs (must belong to the current tenant).
// Returns structured optimization suggestions from the LLM.
router.post('/optimize/google', async (req, res) => {
  const { campaignIds } = req.body
  if (!Array.isArray(campaignIds) || campaignIds.length === 0) {
    return res.status(400).json({ error: 'campaignIds must be a non-empty array' })
  }

  try {
    // Security: only fetch campaigns belonging to this tenant
    const campaigns = await prisma.googleCampaign.findMany({
      where: { id: { in: campaignIds }, tenantId: req.user.tenantId },
      select: { name: true, status: true, budget: true, dailyBudget: true, currency: true, campaignType: true },
    })

    if (campaigns.length === 0) return res.status(404).json({ error: 'No matching campaigns found' })

    const prompt = optimizationPrompt('google', campaigns)
    const raw = await callLLM(prompt, req.user.tenantId, 'optimize_google')
    const suggestions = parseLLMJson(raw)

    res.json({ suggestions })
  } catch (err) {
    console.error('[ai/optimize/google]', err)
    res.status(500).json({ error: 'AI optimization failed' })
  }
})

// POST /ai/optimize/meta
router.post('/optimize/meta', async (req, res) => {
  const { campaignIds } = req.body
  if (!Array.isArray(campaignIds) || campaignIds.length === 0) {
    return res.status(400).json({ error: 'campaignIds must be a non-empty array' })
  }

  try {
    const campaigns = await prisma.metaCampaign.findMany({
      where: { id: { in: campaignIds }, tenantId: req.user.tenantId },
      select: { name: true, status: true, objective: true, currency: true },
    })

    if (campaigns.length === 0) return res.status(404).json({ error: 'No matching campaigns found' })

    const prompt = optimizationPrompt('meta', campaigns)
    const raw = await callLLM(prompt, req.user.tenantId, 'optimize_meta')
    const suggestions = parseLLMJson(raw)

    res.json({ suggestions })
  } catch (err) {
    console.error('[ai/optimize/meta]', err)
    res.status(500).json({ error: 'AI optimization failed' })
  }
})

// POST /ai/generate/ad-copy
// Generates headlines + descriptions for Google or Meta.
router.post('/generate/ad-copy', async (req, res) => {
  const { channel, product, keywords } = req.body

  if (!channel || !product) {
    return res.status(400).json({ error: 'channel and product are required' })
  }
  if (!['google', 'meta'].includes(channel)) {
    return res.status(400).json({ error: 'channel must be "google" or "meta"' })
  }

  const kw = Array.isArray(keywords) ? keywords : (keywords || '').split(',').map((k) => k.trim())
  const prompt = adCopyPrompt(channel, product, kw)

  try {
    const raw = await callLLM(prompt, req.user.tenantId, 'ad_copy')
    const copy = parseLLMJson(raw)
    res.json(copy)
  } catch (err) {
    console.error('[ai/generate/ad-copy]', err)
    res.status(500).json({ error: 'Ad copy generation failed' })
  }
})

// POST /ai/weekly-summary
// Returns a plain-English weekly performance summary for the dashboard.
router.post('/weekly-summary', async (req, res) => {
  try {
    const { googleSpend, metaSpend, totalConversions, topCampaign } = req.body
    const prompt = weeklySummaryPrompt({ googleSpend, metaSpend, totalConversions, topCampaign })
    const summary = await callLLM(prompt, req.user.tenantId, 'weekly_summary')
    res.json({ summary })
  } catch (err) {
    console.error('[ai/weekly-summary]', err)
    res.status(500).json({ error: 'Summary generation failed' })
  }
})

module.exports = router
