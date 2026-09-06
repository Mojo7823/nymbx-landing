import type { ToolCategory, ToolMeta } from '../tools/registry'

/**
 * Points awarded for the best match a single query token finds on a tool.
 * A tool's score is the sum of the per-token bests, so a two-token query that
 * hits the name twice always outranks one that only brushes a description.
 */
export const SCORES = {
  nameExact: 100,
  namePrefix: 80,
  nameWordPrefix: 60,
  keywordExact: 50,
  keywordPrefix: 40,
  category: 30,
  description: 20,
  slug: 15,
} as const

export function tokenize(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean)
}

/** Best score this token can earn on this tool, or 0 when it does not match. */
function scoreToken(tool: ToolMeta, token: string, categoryName: string): number {
  const name = tool.name.toLowerCase()
  if (name === token) return SCORES.nameExact
  if (name.startsWith(token)) return SCORES.namePrefix
  if (name.split(/[^a-z0-9]+/).some((word) => word && word.startsWith(token))) {
    return SCORES.nameWordPrefix
  }
  if (tool.keywords.includes(token)) return SCORES.keywordExact
  if (tool.keywords.some((k) => k.startsWith(token))) return SCORES.keywordPrefix
  if (categoryName.includes(token)) return SCORES.category
  if (tool.description.toLowerCase().includes(token)) return SCORES.description
  if (tool.slug.includes(token)) return SCORES.slug
  return 0
}

/**
 * Ranked search over the registry. Every query token must match somewhere
 * (AND); ties keep registry order, and an empty query is the registry itself.
 */
export function searchTools(
  tools: ToolMeta[],
  query: string,
  categories: ToolCategory[] = [],
): ToolMeta[] {
  const tokens = tokenize(query)
  if (tokens.length === 0) return tools

  const categoryNames = new Map(categories.map((c) => [c.id, c.name.toLowerCase()]))
  const scored: { tool: ToolMeta; score: number; order: number }[] = []

  tools.forEach((tool, order) => {
    const categoryName = categoryNames.get(tool.category) ?? ''
    let score = 0
    for (const token of tokens) {
      const best = scoreToken(tool, token, categoryName)
      if (best === 0) return // AND: one miss drops the tool
      score += best
    }
    scored.push({ tool, score, order })
  })

  return scored.sort((a, b) => b.score - a.score || a.order - b.order).map((s) => s.tool)
}
