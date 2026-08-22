import { applyPhraseExpansions, expandQueryTokens, fold, isZipToken, STOPWORDS } from './text'
import type { QueryInterpretation } from './types'

/**
 * Turns raw user input into the shape the scorer consumes.
 *
 * A ZIP is lifted out and handled as an exact-match field rather than as a
 * fuzzy token. A one-edit ZIP match is always wrong and always confusing —
 * 32801 and 32802 are different places, not a typo for each other.
 */
export function interpretQuery(raw: string): QueryInterpretation {
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  if (!trimmed) {
    return { kind: 'empty', raw: '', zip: null, tokens: [], phrase: '' }
  }

  const phrase = applyPhraseExpansions(fold(trimmed))
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

  return { kind, raw: trimmed, zip, tokens, phrase }
}
