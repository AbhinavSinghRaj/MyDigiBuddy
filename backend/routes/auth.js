// routes/auth.js
// POST /api/v1/auth/login   — upsert user, return JWT
// GET  /api/v1/auth/me      — current user + tenant + subscription
// The Google/Meta OAuth for user sign-in is handled by NextAuth on the frontend.
// These endpoints are called BY NextAuth (server-side) after it verifies the OAuth token.

const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const prisma = require('../lib/prismaClient')
const { requireAuth } = require('../middleware/auth')

function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  })
}

// POST /auth/login
// Called by NextAuth's signIn callback after successful OAuth.
// Upserts the user and creates a default Tenant if first login.
router.post('/login', async (req, res) => {
  const { email, name, provider, providerAccountId } = req.body

  if (!email) return res.status(400).json({ error: 'email is required' })

  try {
    // Upsert user
    const user = await prisma.user.upsert({
      where: { email },
      update: { name: name || undefined },
      create: { email, name },
    })

    // Create a default tenant for brand-new users
    const existingMember = await prisma.tenantMember.findFirst({ where: { userId: user.id } })
    if (!existingMember) {
      const tenant = await prisma.tenant.create({
        data: {
          name: name ? `${name}'s workspace` : email.split('@')[0],
          ownerId: user.id,
          members: { create: { userId: user.id, role: 'owner' } },
        },
      })

      // Assign the free Starter plan
      const starterPlan = await prisma.plan.findUnique({ where: { name: 'starter' } })
      if (starterPlan) {
        await prisma.subscription.create({
          data: {
            userId: user.id,
            tenantId: tenant.id,
            planId: starterPlan.id,
            status: 'active',
          },
        })
      }
    }

    const token = signToken(user.id)
    res.json({ token, userId: user.id })
  } catch (err) {
    console.error('[auth/login]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /auth/me
// Returns the current user, their active tenant, plan and subscription status.
router.get('/me', requireAuth, async (req, res) => {
  try {
    const member = await prisma.tenantMember.findFirst({
      where: { userId: req.user.id },
      include: {
        user: true,
        tenant: {
          include: {
            subscriptions: {
              where: { status: { in: ['active', 'past_due'] } },
              include: { plan: true },
              take: 1,
              orderBy: { createdAt: 'desc' },
            },
            connectedAccounts: true,
          },
        },
      },
    })

    if (!member) return res.status(404).json({ error: 'User not found' })

    res.json({
      user: { id: member.user.id, email: member.user.email, name: member.user.name },
      tenant: {
        id: member.tenant.id,
        name: member.tenant.name,
        subscription: member.tenant.subscriptions[0] || null,
        connectedAccounts: member.tenant.connectedAccounts,
      },
    })
  } catch (err) {
    console.error('[auth/me]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router
