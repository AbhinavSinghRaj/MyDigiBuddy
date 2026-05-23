// services/billing/stripeService.js
// Handles Stripe subscription creation and webhook processing.
// Webhook events keep our DB in sync with Stripe's subscription state.

const Stripe = require('stripe')
const prisma = require('../../lib/prismaClient')

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })

/**
 * Create or retrieve a Stripe Customer for a user, then create a subscription.
 * Called when the user selects a plan on the billing page.
 *
 * @param {string} userId
 * @param {string} tenantId
 * @param {'starter'|'pro'} planName
 * @param {string} paymentMethodId  From Stripe.js on the frontend
 */
async function createSubscription(userId, tenantId, planName, paymentMethodId) {
  const user = await prisma.user.findUnique({ where: { id: userId } })

  // Get or create Stripe customer
  let customerId = user.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name ?? undefined,
      payment_method: paymentMethodId,
      invoice_settings: { default_payment_method: paymentMethodId },
    })
    customerId = customer.id
    await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } })
  }

  // Look up the Stripe Price ID for the plan (store these in your dashboard)
  const planPriceMap = {
    starter: process.env.STRIPE_PRICE_STARTER,
    pro: process.env.STRIPE_PRICE_PRO,
  }
  const priceId = planPriceMap[planName]
  if (!priceId) throw new Error(`Unknown plan: ${planName}`)

  const stripeSubscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    payment_behavior: 'default_incomplete',
    expand: ['latest_invoice.payment_intent'],
  })

  const plan = await prisma.plan.findUnique({ where: { name: planName } })

  await prisma.subscription.upsert({
    where: { userId_tenantId: { userId, tenantId } },
    update: {
      planId: plan.id,
      stripeSubscriptionId: stripeSubscription.id,
      stripeCustomerId: customerId,
      status: stripeSubscription.status,
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
    },
    create: {
      userId,
      tenantId,
      planId: plan.id,
      stripeSubscriptionId: stripeSubscription.id,
      stripeCustomerId: customerId,
      status: stripeSubscription.status,
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
    },
  })

  // Return the client_secret so the frontend can confirm the payment
  return {
    subscriptionId: stripeSubscription.id,
    clientSecret: stripeSubscription.latest_invoice?.payment_intent?.client_secret,
  }
}

/**
 * Handle Stripe webhook events to keep DB in sync.
 * Mount this as a raw-body Express route (see server.js).
 */
async function handleWebhook(rawBody, signature) {
  const event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET)

  switch (event.type) {
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: sub.id },
        data: {
          status: sub.status,
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
        },
      })
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: invoice.subscription },
        data: { status: 'past_due' },
      })
      break
    }

    default:
      break
  }

  return { received: true }
}

module.exports = { createSubscription, handleWebhook, stripe }
