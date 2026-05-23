// lib/llm/client.js
// Unified LLM caller. Tries providers in order: Anthropic → OpenAI → Groq.
// Caches responses in the AiUsageLog table by SHA-256 prompt hash to reduce cost.
// API keys are NEVER sent to the frontend — this file only runs on the backend.

const crypto = require('crypto')
const prisma = require('../prismaClient')

// Cache TTL: re-use a cached response for up to 6 hours for the same prompt.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

/**
 * Call the LLM with prompt caching.
 * @param {string} prompt
 * @param {string} tenantId  Used for usage logging and rate-limit tracking
 * @param {string} endpoint  e.g. "optimize_google" — stored in AiUsageLog
 * @returns {Promise<string>} Raw LLM response text
 */
async function callLLM(prompt, tenantId, endpoint) {
  const promptHash = crypto.createHash('sha256').update(prompt).digest('hex')

  // 1. Check cache
  const cached = await prisma.aiUsageLog.findFirst({
    where: {
      tenantId,
      promptHash,
      createdAt: { gte: new Date(Date.now() - CACHE_TTL_MS) },
    },
    orderBy: { createdAt: 'desc' },
  })
  if (cached) {
    console.log(`[llm] Cache hit for endpoint=${endpoint}`)
    return cached.response
  }

  // 2. Call provider (fallback chain)
  let responseText = null
  let tokensUsed = 0

  if (process.env.ANTHROPIC_API_KEY) {
    ;({ responseText, tokensUsed } = await callAnthropic(prompt))
  } else if (process.env.OPENAI_API_KEY) {
    ;({ responseText, tokensUsed } = await callOpenAI(prompt))
  } else if (process.env.GROQ_API_KEY) {
    ;({ responseText, tokensUsed } = await callGroq(prompt))
  } else {
    throw new Error('No LLM API key configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GROQ_API_KEY.')
  }

  // 3. Persist to cache
  await prisma.aiUsageLog.create({
    data: { tenantId, endpoint, promptHash, response: responseText, tokensUsed },
  })

  return responseText
}

async function callAnthropic(prompt) {
  const Anthropic = require('@anthropic-ai/sdk')
  const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  return {
    responseText: message.content[0].text,
    tokensUsed: message.usage.input_tokens + message.usage.output_tokens,
  }
}

async function callOpenAI(prompt) {
  const OpenAI = require('openai')
  const client = new OpenAI.default({ apiKey: process.env.OPENAI_API_KEY })

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1024,
  })

  return {
    responseText: completion.choices[0].message.content,
    tokensUsed: completion.usage.total_tokens,
  }
}

async function callGroq(prompt) {
  // Groq is OpenAI-compatible
  const OpenAI = require('openai')
  const client = new OpenAI.default({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  })

  const completion = await client.chat.completions.create({
    model: 'llama3-8b-8192',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1024,
  })

  return {
    responseText: completion.choices[0].message.content,
    tokensUsed: completion.usage?.total_tokens ?? 0,
  }
}

/**
 * Safely parse a JSON string returned by the LLM.
 * Strips markdown fences the model sometimes adds despite instructions.
 */
function parseLLMJson(text) {
  const clean = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
  return JSON.parse(clean)
}

module.exports = { callLLM, parseLLMJson }
