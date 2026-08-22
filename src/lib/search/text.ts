/**
 * Text normalization and query expansion for the search core.
 *
 * Everything here is pure and synchronous. The whole `src/lib/search` tree is
 * free of React, Leaflet and Supabase so it can be imported from API routes,
 * migration scripts and three different client surfaces alike.
 */

/**
 * Case-folds, strips diacritics and flattens punctuation to spaces.
 *
 * Diacritic stripping is what makes "jose" find "José" — the corpus has both
 * Spanish clinic names and Spanish prose that leaked into data fields.
 */
export function fold(raw: string): string {
  return raw
    .normalize('NFD')
    // The combining-diacritical-marks block, written as escapes: pure ASCII
    // source, and no `u` flag (unavailable at the project's ES5 target).
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Words carrying no discriminative power.
 *
 * Deliberately short. Domain words like `center`, `clinic`, `law`, `group` and
 * `associates` are NOT stopwords: 204 clinic names carry a location suffix
 * after an en-dash, and stripping the domain vocabulary from what remains
 * destroys the ability to tell two clinics apart.
 */
export const STOPWORDS: ReadonlySet<string> = new Set([
  'the', 'of', 'and', 'a', 'an', 'at', 'in', 'on', 'for', 'to',
])

/**
 * Corporate suffixes. Kept as tokens rather than dropped — "Smith PA" should
 * still outrank "Smith" on the exact query — but scored at reduced weight so
 * they never carry a match on their own.
 */
export const ENTITY_SUFFIXES: ReadonlySet<string> = new Set([
  'llc', 'pa', 'pllc', 'inc', 'pc', 'llp', 'ltd', 'co', 'corp',
])

export const SUFFIX_TOKEN_WEIGHT = 0.35

/** Folds, splits, and drops stopwords and meaningless single characters. */
export function tokenize(raw: string): string[] {
  const folded = fold(raw)
  if (!folded) return []
  return folded
    .split(' ')
    .filter((t) => t.length > 0 && !STOPWORDS.has(t) && (t.length > 1 || /\d/.test(t)))
}

/**
 * Multi-word forms resolved before tokenization, so a phrase can expand into
 * something with a different word count.
 */
export const PHRASE_EXPANSIONS: Readonly<Record<string, string>> = {
  'st pete': 'saint petersburg',
  'st petersburg': 'saint petersburg',
  'ft lauderdale': 'fort lauderdale',
  'fort laud': 'fort lauderdale',
  'ft myers': 'fort myers',
  'ft walton': 'fort walton beach',
  'st cloud': 'saint cloud',
  'st paul': 'saint paul',
  'pain mgmt': 'pain management',
  'workers comp': 'workers compensation',
  'auto accident': 'auto injuries',
  'car accident': 'auto injuries',
}

/**
 * Single-token alternatives.
 *
 * Applied to the QUERY only, never to the indexed document. One-directional
 * expansion keeps the index small and, more importantly, stops "Dr. Smith"
 * from matching a "Drive" in someone's address.
 *
 * Ambiguous abbreviations emit every reading (`st` -> street AND saint); the
 * scorer takes the best-matching variant, so extra readings cost nothing but a
 * comparison.
 */
export const TOKEN_EXPANSIONS: Readonly<Record<string, readonly string[]>> = {
  // Medical
  ortho: ['orthopedic', 'orthopedics', 'orthopedist', 'orthopaedic'],
  orthopedic: ['orthopedics', 'orthopedist'],
  chiro: ['chiropractic', 'chiropractor'],
  chiropractor: ['chiropractic'],
  pt: ['physical', 'therapy'],
  neuro: ['neurological', 'neurology', 'neurologist'],
  rehab: ['rehabilitation'],
  pip: ['personal', 'injury', 'protection'],
  mri: ['imaging', 'radiology'],
  mva: ['auto', 'injuries', 'motor', 'vehicle'],
  ent: ['otolaryngology'],
  ob: ['obstetrics'],
  gyn: ['gynecology'],

  // Legal
  pi: ['personal', 'injury'],
  wc: ['workers', 'compensation'],
  crim: ['criminal'],
  imm: ['immigration'],
  atty: ['attorney'],
  esq: ['attorney'],

  // Street suffixes and directionals
  st: ['street', 'saint'],
  ave: ['avenue'],
  av: ['avenue'],
  blvd: ['boulevard'],
  dr: ['drive', 'doctor'],
  rd: ['road'],
  hwy: ['highway'],
  pkwy: ['parkway'],
  ln: ['lane'],
  ct: ['court'],
  cir: ['circle'],
  ste: ['suite'],
  ft: ['fort'],
  n: ['north'],
  s: ['south'],
  e: ['east'],
  w: ['west'],
  ne: ['northeast'],
  nw: ['northwest'],
  se: ['southeast'],
  sw: ['southwest'],
}

/** Expanded variants match at a discount, so a literal hit always wins. */
export const EXPANSION_PENALTY = 0.9

export interface ExpandedToken {
  /** The folded query token exactly as typed. */
  raw: string
  /** `raw` first, then any expansions. */
  variants: readonly string[]
  /** Reduced for corporate suffixes so they cannot carry a match alone. */
  weight: number
}

/** Rewrites known multi-word phrases before tokenization. */
export function applyPhraseExpansions(folded: string): string {
  let out = folded
  for (const [phrase, replacement] of Object.entries(PHRASE_EXPANSIONS)) {
    if (out.includes(phrase)) {
      out = out.split(phrase).join(replacement)
    }
  }
  return out
}

/** Attaches expansion variants and per-token weights. */
export function expandQueryTokens(tokens: readonly string[]): ExpandedToken[] {
  return tokens.map((raw) => {
    const expansions = TOKEN_EXPANSIONS[raw]
    return {
      raw,
      variants: expansions ? [raw, ...expansions] : [raw],
      weight: ENTITY_SUFFIXES.has(raw) ? SUFFIX_TOKEN_WEIGHT : 1,
    }
  })
}

/** `fold` -> phrase expansion -> `tokenize` -> `expandQueryTokens`. */
export function prepareQuery(raw: string): ExpandedToken[] {
  const folded = applyPhraseExpansions(fold(raw))
  return expandQueryTokens(
    folded
      .split(' ')
      .filter((t) => t.length > 0 && !STOPWORDS.has(t) && (t.length > 1 || /\d/.test(t)))
  )
}

const ZIP_RE = /^\d{5}(?:-?\d{4})?$/
const ZIP_IN_TEXT_RE = /\b(\d{5})(?:-\d{4})?\b/

export function isZipToken(token: string): boolean {
  return ZIP_RE.test(token)
}

/**
 * Pulls a five-digit ZIP out of arbitrary text.
 *
 * Requires a word boundary on both sides so a phone number ("8449737866") or a
 * street number never reads as a ZIP.
 */
export function extractZip(raw: string): string | null {
  const match = raw.match(ZIP_IN_TEXT_RE)
  return match ? match[1] : null
}

/** Truncates ZIP+4 to the five-digit form used as the index key. */
export function normalizeZip(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const match = raw.trim().match(/^(\d{5})/)
  return match ? match[1] : null
}
