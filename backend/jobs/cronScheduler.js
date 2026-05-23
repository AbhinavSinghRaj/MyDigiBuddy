// jobs/cronScheduler.js
// Schedules a periodic sync for every tenant that has connected ad accounts.
// Runs every 6 hours. Uses node-cron (no Redis needed for the scheduler itself).

const cron = require('node-cron')
const prisma = require('../lib/prismaClient')
const { syncQueue } = require('./syncQueue')

function startCronScheduler() {
  // Run at minute 0 of every 6th hour: 0:00, 6:00, 12:00, 18:00
  cron.schedule('0 */6 * * *', async () => {
    console.log('[cron] Starting scheduled sync for all tenants...')

    try {
      const accounts = await prisma.connectedAccount.findMany({
        where: { status: 'connected' },
        select: { tenantId: true, provider: true },
        distinct: ['tenantId', 'provider'],
      })

      for (const { tenantId, provider } of accounts) {
        await syncQueue.add(
          `scheduled_sync_${provider}`,
          { tenantId, provider },
          { priority: 10 }, // lower priority than immediate post-connect syncs
        )
      }

      console.log(`[cron] Enqueued sync jobs for ${accounts.length} account(s)`)
    } catch (err) {
      console.error('[cron] Scheduler error:', err.message)
    }
  })

  console.log('[cron] Scheduler started — syncing every 6 hours')
}

module.exports = { startCronScheduler }
