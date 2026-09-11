import { applyPhraseExpansions, expandQueryTokens, fold, isZipToken, STOPWORDS } from './text'
import type { QueryInterpretation } from './types'

/**
 * Turns raw user input into the shape the scorer consumes.
 *
 * A ZIP is lifted out and handled as an exact-match field rather than as a
 * fuzzy token. A one-edit ZIP match is always wrong and always confusing —
 * 32801 and 32802 are different places, not a typo for each other.
 */
/**
 * "near me" and its neighbours.
 *
 * Handled here as INTENT rather than in `text.ts` as vocabulary,
 * because `STOPWORDS` is consumed by `tokenize()` at index time: adding
 * "near" there would strip it out of street names too.
 *
 * Left in, these were four ordinary tokens that matched nothing, so the
 * AND gate dropped every document — "personal injury near me" returned
 * zero results and the spelling corrector helpfully offered "personal
 * injury real me". It is among the most common things anyone types into
 * a directory.
 */
const NEAR_ME_RE = /\b(?:near|nearby|close to|around|next to)\s+(?:me|here|my location)\b|\bnearby\b|\bnear me\b/g

export function interpretQuery(raw: string): QueryInterpretation {
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  if (!trimmed) {
    return { kind: 'empty', raw: '', zip: null, tokens: [], phrase: '', nearMe: false }
  }

  const folded = applyPhraseExpansions(fold(trimmed))
  const nearMe = NEAR_ME_RE.test(folded)
  // `g` flag: lastIndex survives a `test`, so reset before reusing.
  NEAR_ME_RE.lastIndex = 0
  const phrase = nearMe ? folded.replace(NEAR_ME_RE, ' ').replace(/\s+/g, ' ').trim() : folded

  const rawTokens = phrase
    .split(' ')
    .filter((t) => t.length > 0 && !STOPWORDS.has(t) && (t.length > 1 || /\d/.test(t)))

  let zip: string | null = null
  const textTokens: string[] = []
  for (const token of rawTokens) {
    if (!zip && isZipToken(token)) {
      zip = token.slice(0, 5)
      continue
    }
    textTokens.push(token)
  }

  const tokens = expandQueryTokens(textTokens)
  const kind =
    tokens.length === 0 && zip
      ? 'zip'
      : zip
        ? 'mixed'
        : tokens.length === 0
          ? 'empty'
          : 'text'

  return { kind, raw: trimmed, zip, tokens, phrase, nearMe }
}
