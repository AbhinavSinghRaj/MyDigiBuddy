// routes/billing.js
const express = require('express')
const router = express.Router()
const { createSubscription, handleWebhook } = require('../services/billing/stripeService')
const { requireAuth } = require('../middleware/auth')

// POST /billing/subscribe
router.post('/subscribe', requireAuth, async (req, res) => {
  const { planName, paymentMethodId } = req.body
  if (!planName || !paymentMethodId) {
    return res.status(400).json({ error: 'planName and paymentMethodId are required' })
  }
  try {
    const result = await createSubscription(req.user.id, req.user.tenantId, planName, paymentMethodId)
    res.json(result)
  } catch (err) {
    console.error('[billing/subscribe]', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /billing/webhook  (raw body — configured in server.js)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const sig = req.headers['stripe-signature']
    const result = await handleWebhook(req.body, sig)
    res.json(result)
  } catch (err) {
    console.error('[billing/webhook]', err.message)
    res.status(400).send(`Webhook error: ${err.message}`)
  }
})

module.exports = router
