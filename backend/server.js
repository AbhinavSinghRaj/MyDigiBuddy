// server.js
// Main entry point for the Node.js backend.
// Run with: node server.js   (or: nodemon server.js in development)
//
// Architecture notes:
//  - All routes are prefixed with /api/v1
//  - The /billing/webhook route uses raw body parsing (must be before express.json)
//  - Multitenancy is enforced in every route via the requireAuth middleware
//  - LLM API keys are loaded from .env and NEVER forwarded to the frontend

require('dotenv').config()

const express = require('express')
const cors = require('cors')
const rateLimit = require('express-rate-limit')

// Routes
const authRouter = require('./routes/auth')
const connectionsRouter = require('./routes/connections')
const campaignsRouter = require('./routes/campaigns')
const aiRouter = require('./routes/ai')
const billingRouter = require('./routes/billing')

// Background jobs
const { syncWorker } = require('./jobs/syncQueue')      // starts the BullMQ worker
const { startCronScheduler } = require('./jobs/cronScheduler')

const app = express()
const PORT = process.env.PORT || 4000

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}))

// ─── Stripe webhook (raw body — MUST come before express.json) ────────────────
app.use('/api/v1/billing/webhook', express.raw({ type: 'application/json' }))

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json())

// ─── Global rate limit ────────────────────────────────────────────────────────
// 200 requests per 15 min per IP. AI endpoints have their own stricter limit.
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
}))

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/v1/auth',        authRouter)
app.use('/api/v1/connections', connectionsRouter)
app.use('/api/v1/campaigns',   campaignsRouter)
app.use('/api/v1/ai',          aiRouter)
app.use('/api/v1/billing',     billingRouter)

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }))

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[server]', err)
  res.status(500).json({ error: 'Internal server error' })
})

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅  Backend running on http://localhost:${PORT}`)
  startCronScheduler()
  console.log('✅  BullMQ sync worker started')
})
