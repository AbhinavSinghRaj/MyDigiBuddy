// prisma/seed.js
// Seeds the Plan table with Starter and Pro plans.
// Run with: node prisma/seed.js

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  await prisma.plan.upsert({
    where: { name: 'starter' },
    update: {},
    create: {
      name: 'starter',
      monthlyPriceINR: 999,
      maxGoogleAdsAccounts: 1,
      maxMetaAdsAccounts: 1,
      maxAiCallsPerMonth: 50,
    },
  })

  await prisma.plan.upsert({
    where: { name: 'pro' },
    update: {},
    create: {
      name: 'pro',
      monthlyPriceINR: 2999,
      maxGoogleAdsAccounts: 3,
      maxMetaAdsAccounts: 3,
      maxAiCallsPerMonth: 500,
    },
  })

  console.log('✅  Plans seeded')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
