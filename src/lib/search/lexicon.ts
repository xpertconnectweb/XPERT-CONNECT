import { damerauLevenshtein, maxEditsFor } from './fuzzy'
import type { QueryInterpretation, SearchDoc } from './types'

/**
 * Vocabulary of every token that appears in the indexed corpus, used to
 * propose a correction when a search comes back empty.
 *
 * This module deliberately does NOT import the engine. Verifying that a
 * correction actually improves results requires re-running a search, which
 * would create an import cycle — so `suggestCorrection` proposes, and the
 * engine disposes.
 */
export interface Lexicon {
  /** Folded token -> display form and document frequency. */
  terms: ReadonlyMap<string, { display: string; df: number }>
  /** Token lists bucketed by length, for cheap candidate pruning. */
  byLength: ReadonlyMap<number, readonly string[]>
}

export function buildLexicon(docs: readonly SearchDoc[]): Lexicon {
  const terms = new Map<string, { display: string; df: number }>()

  for (const doc of docs) {
    // Count each token once per document, so document frequency means what it
    // says and a name that repeats a word is not over-weighted.
    const seen = new Set<string>()
    for (const field of Object.keys(doc.tokens) as (keyof typeof doc.tokens)[]) {
      const tokens = doc.tokens[field]
      if (!tokens) continue
      for (const token of tokens) {
        if (token.length < 3 || seen.has(token)) continue
        seen.add(token)
        const entry = terms.get(token)
        if (entry) entry.df += 1
        else terms.set(token, { display: token, df: 1 })
      }
    }
  }

  const byLength = new Map<number, string[]>()
  // forEach rather than for-of over keys(): the project compiles at the default
  // ES5 target, where iterating a Map needs --downlevelIteration.
  terms.forEach((_entry, token) => {
    const bucket = byLength.get(token.length)
    if (bucket) bucket.push(token)
    else byLength.set(token.length, [token])
  })

  return { terms, byLength }
}

/** Minimum document frequency for a term to be considered a correction target. */
const MIN_DF = 2

/**
 * Proposes a corrected query string, or null.
 *
 * Candidates are tokens that matched the corpus only weakly (or not at all),
 * and are long enough that a correction is meaningful. A term appearing in a
 * single document is more likely to be somebody's actual name than a word the
 * user misspelled, so `df` has to clear MIN_DF.
 *
 * The caller must verify the suggestion improves the result count before
 * showing it — "Did you mean X?" leading to zero results is worse than no
 * suggestion at all.
 */
export function suggestCorrection(
  lexicon: Lexicon,
  interpretation: QueryInterpretation,
  weakTokens: ReadonlySet<string>
): string | null {
  if (interpretation.tokens.length === 0) return null

  let changed = false
  const corrected = interpretation.tokens.map((token) => {
    if (!weakTokens.has(token.raw)) return token.raw
    if (token.raw.length < 4) return token.raw

    // One edit MORE generous than the matcher.
    //
    // The two budgets serve opposite goals. The matcher is conservative
    // because a false positive silently pollutes the ranking. The corrector
    // can afford to reach further because its output is verified by re-running
    // the search and discarded unless it genuinely helps. Sharing the matcher's
    // budget made this unreachable: any token close enough to correct was
    // already close enough to match, so no suggestion ever fired.
    const budget = maxEditsFor(token.raw.length) + 1

    let bestTerm: string | null = null
    let bestDistance = budget + 1
    let bestDf = 0

    for (let length = token.raw.length - 2; length <= token.raw.length + 2; length++) {
      const bucket = lexicon.byLength.get(length)
      if (!bucket) continue
      for (const candidate of bucket) {
        const entry = lexicon.terms.get(candidate)
        if (!entry || entry.df < MIN_DF) continue
        const distance = damerauLevenshtein(token.raw, candidate, budget)
        if (distance > budget) continue
        // Closer wins; among equals, the more common term wins.
        if (distance < bestDistance || (distance === bestDistance && entry.df > bestDf)) {
          bestTerm = candidate
          bestDistance = distance
          bestDf = entry.df
        }
      }
    }

    if (bestTerm && bestTerm !== token.raw) {
      changed = true
      return bestTerm
    }
    return token.raw
  })

  if (!changed) return null
  const suggestion = corrected.join(' ')
  // Keep the ZIP in the rebuilt query so the correction doesn't widen the search.
  return interpretation.zip ? `${suggestion} ${interpretation.zip}`.trim() : suggestion
}
