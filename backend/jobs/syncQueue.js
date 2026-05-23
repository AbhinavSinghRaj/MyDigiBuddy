// jobs/syncQueue.js
// BullMQ queue + worker for background ad data syncing.
// The worker processes jobs enqueued by:
//   - OAuth callbacks (immediate sync after connecting an account)
//   - The cron scheduler below (periodic sync every 6 hours)
//
// Redis connection is configured via REDIS_URL env var.

const { Queue, Worker } = require('bullmq')
const { syncGoogleAds } = require('../services/ads/googleAdsService')
const { syncMetaAds } = require('../services/ads/metaAdsService')
const prisma = require('../lib/prismaClient')

const connection = { url: process.env.REDIS_URL || 'redis://localhost:6379' }

// Queue — used by other modules to enqueue jobs
const syncQueue = new Queue('ad-sync', { connection })

// Worker — processes jobs from the queue
const syncWorker = new Worker(
  'ad-sync',
  async (job) => {
    const { tenantId, provider } = job.data
    console.log(`[syncWorker] Processing job ${job.name} for tenant ${tenantId}`)

    // Find all ConnectedAccounts for this tenant + provider
    const accounts = await prisma.connectedAccount.findMany({
      where: { tenantId, provider, status: 'connected' },
    })

    for (const account of accounts) {
      if (provider === 'google_ads') {
        await syncGoogleAds(tenantId, account.id)
      } else if (provider === 'meta_ads') {
        await syncMetaAds(tenantId, account.id)
      }
    }
  },
  {
    connection,
    concurrency: 3,
    // Retry failed jobs up to 3 times with exponential backoff
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
    },
  },
)

syncWorker.on('completed', (job) => {
  console.log(`[syncWorker] Job ${job.id} completed`)
})

syncWorker.on('failed', (job, err) => {
  console.error(`[syncWorker] Job ${job?.id} failed:`, err.message)
})

module.exports = { syncQueue, syncWorker }
