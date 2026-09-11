/**
 * Text normalization and query expansion for the search core.
 *
 * Everything here is pure and synchronous. The whole `src/lib/search` tree is
 * free of React, Leaflet and Supabase so it can be imported from API routes,
 * migration scripts and three different client surfaces alike.
 *
 * Domain vocabulary is allowed in: `documents.ts` already reads
 * `@/lib/counties` and `@/lib/address`, and the rule this tree keeps is
 * "no React, Leaflet or Supabase", not "no knowledge of the subject".
 */
import { US_STATE_NAMES } from '@/lib/address'
import { LEGAL_PHRASE_EXPANSIONS, LEGAL_TOKEN_EXPANSIONS } from './domain-expansions'

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

/**
 * Words that qualify a place rather than name one.
 *
 * Same mechanism as `ENTITY_SUFFIXES`, same reason: kept as tokens so
 * they can still add precision, but at reduced weight so the AND gate
 * exempts them and they can never carry a match alone.
 *
 * This existed as a bug with a UI in front of it. `lawyers.county`
 * stores the bare form ("Manatee") because that is the storage
 * convention, while `countyLabel()` renders "Manatee County" — which is
 * what the county dropdown on /directory shows a visitor. Copy what is
 * on screen into the box next to it and you got nothing at all: the
 * token "county" matched no field, and the AND gate then dropped all
 * seventeen Manatee firms.
 *
 * `fl` and `florida` are here and the other forty-nine states are not,
 * deliberately. Every row in this corpus is Florida, so the state is
 * always a qualifier and never the thing being looked for. Elsewhere
 * that would not hold.
 */
export const GEO_SUFFIXES: ReadonlySet<string> = new Set([
  'county', 'parish', 'borough', 'fl', 'florida',
])

/** Same value as the corporate suffixes, named separately so they can diverge. */
export const GEO_TOKEN_WEIGHT = 0.35

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
  /**
   * Collapsed to one token on purpose.
   *
   * These used to rewrite to "auto injuries", which is a CLINIC
   * specialty — on the mixed index that meant "car accident Orlando"
   * found chiropractors and not one personal-injury attorney, and on
   * the lawyer-only public directory it found nothing at all.
   *
   * The honest semantics are "Auto Injuries OR Personal Injury", and a
   * phrase rewrite cannot express an OR: adding both inflates the token
   * count, and every extra token dilutes coverage in every field. So
   * the phrase becomes the single token `accident`, whose merged
   * variants (auto, injuries, personal, injury) carry the OR through
   * the scorer, which already takes the best-matching variant.
   *
   * Cost to the clinic map, stated plainly: an Auto Injuries clinic now
   * matches through a variant rather than literally, so its specialty
   * field scores 2.2 x 0.9 instead of 2.2. Every such clinic moves by
   * the same factor, so their order relative to each other is
   * unchanged — and attorneys now appear alongside them.
   */
  'auto accident': 'accident',
  'car accident': 'accident',
  'car crash': 'accident',
  'car wreck': 'accident',
  'spine surgeon': 'spine neurosurgery orthopedics',
  'back surgeon': 'spine neurosurgery',
  'brain surgeon': 'neurosurgery',
  'bone doctor': 'orthopedics',
  'cirujano ortopedico': 'orthopedics',
  'cirugia de columna': 'spine neurosurgery',
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
  ortho: ['orthopedic', 'orthopedics', 'orthopedist', 'orthopaedic', 'orthopaedics'],
  orthopedic: ['orthopedics', 'orthopedist'],
  orthopaedic: ['orthopedic', 'orthopedics', 'orthopedist'],
  orthopedist: ['orthopedic', 'orthopedics'],
  chiro: ['chiropractic', 'chiropractor'],
  chiropractor: ['chiropractic'],
  pt: ['physical', 'therapy'],
  // Three letters that now mean two different things. The DATA alias in
  // clinic-specialties.ts keeps 'neuro' pointed at rehab, so this is where a
  // person typing it still reaches the surgeons.
  neuro: ['neurological', 'neurology', 'neurologist', 'neurosurgery', 'neurosurgeon'],
  neurosurgeon: ['neurosurgery', 'neurological', 'surgery'],
  neurosurgery: ['neurosurgeon', 'neurological'],
  surgeon: ['surgery', 'surgical'],
  surgery: ['surgeon'],
  spine: ['spinal'],
  spinal: ['spine'],
  rehab: ['rehabilitation'],
  pip: ['personal', 'injury', 'protection'],
  mri: ['imaging', 'radiology'],
  mva: ['auto', 'injuries', 'motor', 'vehicle'],
  // Half of the OR that the 'car accident' phrase now routes through.
  // The other half — personal, injury — is derived from the practice-area
  // aliases and unioned in by `mergeTokenExpansions`.
  accident: ['auto', 'injuries'],
  ent: ['otolaryngology'],
  ob: ['obstetrics'],
  gyn: ['gynecology'],

  // Spanish. fold() in this module already strips accents, so 'traumatólogo'
  // and 'traumatologo' arrive at the same key.
  neurocirujano: ['neurosurgery', 'neurosurgeon', 'neurological'],
  neurocirugia: ['neurosurgery', 'neurosurgeon'],
  ortopedista: ['orthopedics', 'orthopedic', 'orthopedist'],
  ortopedico: ['orthopedics', 'orthopedic'],
  ortopedia: ['orthopedics', 'orthopedic'],
  traumatologo: ['orthopedics', 'orthopedic'],
  columna: ['spine', 'spinal'],

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

/**
 * State names and codes, both directions.
 *
 * Documents store the code — every `state` field in this corpus folds
 * to "fl" — and people type the word, so "Bradenton Florida" scored
 * zero on a query where "Bradenton" alone scored 0.67. Generated rather
 * than written out, so the two directions cannot drift apart.
 *
 * Two exclusions, both load-bearing:
 *
 *  - Codes that are also corporate suffixes: PA and CO. Expanding
 *    "pennsylvania" to "pa" would match the name of every "Smith &
 *    Jones, P.A." in Florida, at `name` weight 3.0. A Florida directory
 *    returning nothing for "pennsylvania" is the correct answer;
 *    returning half the state's law firms is not.
 *  - Multi-word names ("new york", "north carolina"). This table is
 *    consulted per token, so they cannot round-trip through it. They
 *    would need phrase entries, and nothing in this corpus needs them.
 */
function buildStateExpansions(): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [code, name] of Object.entries(US_STATE_NAMES)) {
    const lower = code.toLowerCase()
    if (ENTITY_SUFFIXES.has(lower)) continue
    if (name.includes(' ')) continue
    out[lower] = [name]
    out[name] = [lower]
  }
  return out
}

const STATE_EXPANSIONS = buildStateExpansions()

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

/**
 * Every token table, unioned.
 *
 * Union rather than overwrite, because the same key legitimately
 * appears in more than one: `accident` gets `auto`/`injuries` from the
 * hand-written medical table and `personal`/`injury` from the derived
 * legal one, and a query for it should reach both. Spreading the
 * objects would have silently kept only the last.
 *
 * Order is fixed — hand table, states, legal — so the variant list is
 * deterministic and `EXPANSION_PENALTY` applies to the same entries on
 * every run.
 */
function mergeTokenExpansions(): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  const tables: Readonly<Record<string, readonly string[]>>[] = [
    TOKEN_EXPANSIONS,
    STATE_EXPANSIONS,
    LEGAL_TOKEN_EXPANSIONS,
  ]

  for (const table of tables) {
    for (const [key, values] of Object.entries(table)) {
      const bucket = out[key] ?? (out[key] = [])
      for (const value of values) {
        // The key itself is already variant zero; a table that repeats
        // it would otherwise make it count twice at a discount.
        if (value !== key && !bucket.includes(value)) bucket.push(value)
      }
    }
  }

  return out
}

const ALL_TOKEN_EXPANSIONS = mergeTokenExpansions()

const ALL_PHRASE_EXPANSIONS: Record<string, string> = {
  ...LEGAL_PHRASE_EXPANSIONS,
  // The hand-written table wins on a collision: its entries were chosen
  // against this corpus, the derived ones are mechanical.
  ...PHRASE_EXPANSIONS,
}

/** Rewrites known multi-word phrases before tokenization. */
export function applyPhraseExpansions(folded: string): string {
  let out = folded
  for (const [phrase, replacement] of Object.entries(ALL_PHRASE_EXPANSIONS)) {
    if (out.includes(phrase)) {
      out = out.split(phrase).join(replacement)
    }
  }
  return out
}

/** Attaches expansion variants and per-token weights. */
export function expandQueryTokens(tokens: readonly string[]): ExpandedToken[] {
  return tokens.map((raw) => {
    const expansions = ALL_TOKEN_EXPANSIONS[raw]
    return {
      raw,
      variants: expansions ? [raw, ...expansions] : [raw],
      weight: ENTITY_SUFFIXES.has(raw)
        ? SUFFIX_TOKEN_WEIGHT
        : GEO_SUFFIXES.has(raw)
          ? GEO_TOKEN_WEIGHT
          : 1,
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
