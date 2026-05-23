// middleware/auth.js
// Verifies the Bearer JWT issued at login.
// Attaches req.user = { id, email, tenantId } for downstream route handlers.
// Enforces multitenancy: every DB query in routes must filter by req.user.tenantId.

const jwt = require('jsonwebtoken')
const prisma = require('../lib/prismaClient')

async function requireAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' })
  }

  const token = header.slice(7)
  let payload
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET)
  } catch {
    return res.status(401).json({ error: 'Token expired or invalid' })
  }

  // Fetch the user and their active tenant from DB on each request.
  // In production you may cache this in Redis for performance.
  const member = await prisma.tenantMember.findFirst({
    where: { userId: payload.sub },
    include: { user: true, tenant: true },
  })

  if (!member) {
    return res.status(403).json({ error: 'User has no associated tenant' })
  }

  req.user = {
    id: member.user.id,
    email: member.user.email,
    tenantId: member.tenantId,
    role: member.role,
  }

  next()
}

module.exports = { requireAuth }
