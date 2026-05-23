// lib/llm/prompts.js
// Central store for all LLM prompt templates.
// Keeping prompts here (not inline in routes) makes them easy to tune without
// touching business logic.

/**
 * Prompt for campaign optimization suggestions.
 * @param {'google'|'meta'} channel
 * @param {object[]} campaigns  Simplified campaign objects from the DB
 */
function optimizationPrompt(channel, campaigns) {
  const summary = campaigns
    .map(
      (c, i) =>
        `${i + 1}. "${c.name}" | status: ${c.status} | spend: ${c.currency} ${c.budget ?? 0} | ` +
        (channel === 'google' ? `type: ${c.campaignType ?? 'SEARCH'}` : `objective: ${c.objective ?? 'CONVERSIONS'}`),
    )
    .join('\n')

  return `You are an expert digital advertising strategist. Analyse these ${channel === 'google' ? 'Google Ads' : 'Meta Ads'} campaigns and provide concise, actionable optimization suggestions.

CAMPAIGNS:
${summary}

Instructions:
- Return a JSON array of suggestion objects with this shape:
  { "campaignName": string, "action": "increase_budget"|"decrease_budget"|"pause"|"resume"|"refresh_creative"|"update_audience", "reason": string, "estimatedImpact": string }
- Be specific: include concrete numbers (e.g. "increase budget by 20%") where possible.
- Limit to the top 3-5 highest-impact suggestions.
- Respond ONLY with the JSON array. No markdown, no explanation outside the array.`
}

/**
 * Prompt for ad copy generation.
 * @param {'google'|'meta'} channel
 * @param {string} product
 * @param {string[]} keywords
 */
function adCopyPrompt(channel, product, keywords) {
  const keywordList = keywords.join(', ')

  if (channel === 'google') {
    return `You are a Google Ads copywriter. Write compelling ad copy for the following product.

Product: ${product}
Keywords: ${keywordList}

Return a JSON object with:
{
  "headlines": [string, string, string],   // 3 headlines, max 30 chars each
  "descriptions": [string, string]         // 2 descriptions, max 90 chars each
}

Respond ONLY with the JSON object. No markdown.`
  }

  // Meta
  return `You are a Meta (Facebook/Instagram) Ads copywriter. Write compelling ad copy.

Product: ${product}
Keywords: ${keywordList}

Return a JSON object with:
{
  "primaryText": string,    // 1-2 engaging sentences, max 125 chars
  "headline": string,       // punchy headline, max 40 chars
  "description": string,    // supporting sentence, max 30 chars
  "callToAction": string    // e.g. "Learn More", "Shop Now", "Get Quote"
}

Respond ONLY with the JSON object. No markdown.`
}

/**
 * Prompt for the weekly AI summary shown on the dashboard.
 * @param {object} stats  { googleSpend, metaSpend, totalConversions, topCampaign }
 */
function weeklySummaryPrompt(stats) {
  return `You are a digital marketing advisor. Write a 2-3 sentence plain-English weekly summary for a small business owner based on their ad performance.

Stats (last 7 days):
- Google Ads spend: ${stats.googleSpend}
- Meta Ads spend: ${stats.metaSpend}
- Total conversions: ${stats.totalConversions}
- Best performing campaign: "${stats.topCampaign}"

Be direct, specific, and end with one actionable recommendation. Respond in 2-3 sentences only.`
}

module.exports = { optimizationPrompt, adCopyPrompt, weeklySummaryPrompt }
