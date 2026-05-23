# AdMind AI — Digital Marketing SaaS

AI-powered Google Ads + Meta Ads management for small businesses and freelancers.

## Monorepo structure

```
admind-saas/
├── frontend/   Next.js (App Router) — hosted on Vercel
└── backend/    Node.js + Express — hosted on Render / DigitalOcean
```

## Quick start

```bash
# 1. Clone & install
cd frontend && npm install
cd ../backend && npm install

# 2. Copy env files and fill in your keys
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env

# 3. Run DB migrations
cd backend && npx prisma migrate dev

# 4. Start both servers
cd frontend && npm run dev          # http://localhost:3000
cd backend  && node server.js       # http://localhost:4000
```

## Out-of-scope (MVP)
Email marketing, WhatsApp/SMS, e-commerce integrations, TikTok/LinkedIn Ads,
advanced automation workflows, white-label dashboards, team roles, support tickets.
