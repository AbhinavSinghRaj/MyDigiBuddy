// lib/llm/client.ts
// This module only runs on the server (Next.js server components or API routes).
// It calls the Node.js backend's /ai/* endpoints — API keys are NEVER exposed here.
import axios from 'axios'

const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'

export async function optimizeCampaigns(
  channel: 'google' | 'meta',
  campaignIds: string[],
  authToken: string,
) {
  const res = await axios.post(
    `${backendUrl}/ai/optimize/${channel}`,
    { campaignIds },
    { headers: { Authorization: `Bearer ${authToken}` } },
  )
  return res.data // { suggestions: string[] }
}

export async function generateAdCopy(
  channel: 'google' | 'meta',
  product: string,
  keywords: string[],
  authToken: string,
) {
  const res = await axios.post(
    `${backendUrl}/ai/generate/ad-copy`,
    { channel, product, keywords },
    { headers: { Authorization: `Bearer ${authToken}` } },
  )
  return res.data // { headlines: string[], descriptions: string[], primaryText?: string }
}
