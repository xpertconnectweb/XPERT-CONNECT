/**
 * Decomposes a typed US address into the pieces the index is keyed on.
 *
 * `parseAddress` in `src/lib/address.ts` already handles the tail -- city,
 * state, postcode -- and does it well, against real rows with parentheticals
 * and prose in them. What it does not do is take the head apart: it returns the
 * street as one string, and its only heuristic for a house number is whether
 * the string starts with a digit. A geocoder needs the number separated from
 * the street, the unit separated from both, and the street written the way the
 * county register writes it.
 *
 * So this file wraps that one rather than replacing it, and adds the head.
 *
 * ── The rule that governs everything here ───────────────────────────────────
 *
 * Abbreviate in position, never by token. USPS abbreviates a suffix only where
 * a suffix belongs, and counties store what USPS produces. "Green Bay Rd" keeps
 * its GREEN because the word is part of the name; abbreviating every token that
 * appears in the suffix table would turn it into "GRN BAY RD" and match
 * nothing. The same trap sits in Mill Creek, Park Place, Forest Hills and a few
 * hundred other ordinary Florida street names.
 */
import { parseAddress } from '../address'
import { fold } from '../search/text'
import {
  canonicalDirectional,
  canonicalSuffix,
  canonicalDesignator,
  expandDirectional,
  expandSuffix,
  STANDALONE_DESIGNATORS,
} from './usps'

export interface ParsedUnit {
  /** USPS designator: APT, STE, UNIT, RM... */
  designator: string
  /** "101", "101/102", "B". Empty for a designator that stands alone. */
  value: string
}

export interface ParsedUsAddress {
  /** The leading integer of the house number. */
  number: number | null
  /** What followed it: "A" in 123A, "1/2", "-125" in 123-125. */
  numberSuffix: string | null
  preDirectional: string | null
  /** The name with its directionals and suffix removed: "62ND ST" of "62ND ST CIR E". */
  streetName: string
  suffix: string | null
  postDirectional: string | null
  /**
   * The street exactly as the index stores it, e.g. "SE 17TH ST".
   * This is what the trigram search is run against.
   */
  street: string
  /**
   * `street` first, then any alternative spelling worth a second attempt.
   * Never empty when `street` is non-empty, and de-duplicated.
   */
  variants: string[]
  unit: ParsedUnit | null
  city: string | null
  state: string | null
  zip: string | null
  /**
   * True when a house number and a street name were both found. It does not
   * promise the address exists -- only that the string was shaped like one.
   */
  confident: boolean
}

const EMPTY: ParsedUsAddress = {
  number: null,
  numberSuffix: null,
  preDirectional: null,
  streetName: '',
  suffix: null,
  postDirectional: null,
  street: '',
  variants: [],
  unit: null,
  city: null,
  state: null,
  zip: null,
  confident: false,
}

/** "862" -> [862, null].  "123A" -> [123, "A"].  "123 1/2" -> [123, "1/2"]. */
function splitHouseNumber(token: string): [number, string | null] | null {
  const match = /^(\d{1,7})(.*)$/.exec(token)
  if (!match) return null

  /**
   * An ordinal is a street name, not a house number.
   *
   * "62nd St Cir E" with no house number in front of it parsed as house number
   * 62 with the suffix "nd", leaving the street as "ST CIR E" — which then
   * matched "17th Street Cir E", a different road. "1st Ave N" and "3rd St"
   * failed the same way, and both are ordinary street names in Saint Petersburg
   * and Minneapolis.
   *
   * The test is exact: a remainder of precisely st, nd, rd or th. "123A" keeps
   * its A, "123-125" keeps its range, and "100 1st St" is unaffected because
   * the house number there is its own token.
   */
  if (/^(st|nd|rd|th)$/i.test(match[2])) return null

  const value = Number(match[1])
  if (value <= 0) return null
  const rest = match[2].replace(/^[-\s]+/, '').trim()
  return [value, rest || null]
}

/**
 * Whether a token looks like a unit number rather than a word.
 *
 * Anything containing a digit qualifies -- "101", "3J", "12-B", "101/102" --
 * and so does a bare single letter, which is how a duplex is written. Two or
 * more letters with no digit is a word, and a word after a designator means
 * the designator was part of the street name all along.
 */
function isUnitValue(token: string): boolean {
  const value = token.replace(/^#/, '')
  if (!value) return false
  return /\d/.test(value) || /^[A-Za-z]$/.test(value)
}

/**
 * Pulls a secondary unit out of the token stream.
 *
 * This is `stripUnit`'s missing half. That function deletes the unit, which is
 * the right thing when the goal is a clean string to hand to a geocoder; here
 * the unit has to come back, because the referral form stores it and the
 * clinic's suite number is part of its address even though no register knows it.
 *
 * Runs before the suffix analysis for a reason: "1531 SE 17th St Unit 101/102"
 * has to lose its unit before anything decides what the trailing token means,
 * or the street comes out as "17TH ST UNIT 101/102" and misses entirely.
 */
function extractUnitTokens(tokens: readonly string[]): { rest: string[]; unit: ParsedUnit | null } {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]

    // "#101", "# 101", "#101/102" -- the form people actually type.
    if (token.charAt(0) === '#') {
      const inline = token.slice(1)
      const value = inline || (tokens[i + 1] ?? '')
      return {
        rest: tokens.slice(0, i),
        unit: { designator: 'UNIT', value: value.toUpperCase() },
      }
    }

    const designator = canonicalDesignator(token)
    // A designator in first position is the street's own name -- Key West's
    // "Key Plaza", Duval County's "Front St". Only a designator with something
    // before it is a unit.
    if (!designator || i === 0) continue

    if (STANDALONE_DESIGNATORS.has(designator)) {
      return { rest: tokens.slice(0, i), unit: { designator, value: '' } }
    }

    const next = tokens[i + 1]
    // "100 Main St Apt" with nothing after it is a truncated address, not a
    // unit. Leaving the word in place is less wrong than inventing an empty
    // unit and silently shortening the street.
    if (!next) continue

    // A unit number looks like one: "101", "3J", "B", "101/102". A word does
    // not. Without this check "Boca Key Dr" parses as the street "Boca" with
    // unit "KEY DR", because KEY is a USPS designator for a marina berth and
    // also half the place names in south Florida. The same trap is set by
    // Front, Side, Stop, Lot, Pier and Space.
    if (!isUnitValue(next)) continue

    return {
      rest: tokens.slice(0, i),
      unit: { designator, value: next.replace(/^#/, '').toUpperCase() },
    }
  }

  return { rest: tokens.slice(), unit: null }
}

/**
 * Splits the street tokens into pre-directional, name, suffix, post-directional.
 *
 * Order matters and each guard earns its place:
 *
 *  - The post-directional comes off first, because "62ND ST CIR E" ends with
 *    one and the suffix is behind it.
 *  - Nothing is ever popped down to an empty name. "N St" is a real street in
 *    Pensacola and "Park" is a real street name; a parser that pops until it
 *    runs out produces an address with no street in it.
 *  - The final token of what remains is abbreviated **in place** when it is a
 *    suffix spelling, never removed. This is what turns a typed "62nd Street
 *    Circle East" into the stored "62ND ST CIR E" -- CIRCLE became the suffix,
 *    and STREET is part of the name but still has to be written the county's
 *    way.
 */
function analyseStreet(tokens: readonly string[]) {
  const parts = tokens.slice()

  let postDirectional: string | null = null
  if (parts.length > 1) {
    const direction = canonicalDirectional(parts[parts.length - 1])
    if (direction) {
      postDirectional = direction
      parts.pop()
    }
  }

  let suffix: string | null = null
  if (parts.length > 1) {
    const abbreviation = canonicalSuffix(parts[parts.length - 1])
    if (abbreviation) {
      suffix = abbreviation
      parts.pop()
    }
  }

  let preDirectional: string | null = null
  if (parts.length > 1) {
    const direction = canonicalDirectional(parts[0])
    if (direction) {
      preDirectional = direction
      parts.shift()
    }
  }

  const typed = parts.map((t) => t.toUpperCase())
  const canonical = canonicalNameTokens(typed)

  // The same name with its last word spelled out in full. Kept for scoring,
  // not for lookup: candidate generation runs on the canonical form, and this
  // one lets the re-ranker recognise a county that wrote it the long way.
  const names: string[][] = [canonical]
  if (canonical.length > 1) {
    const last = canonical[canonical.length - 1]
    const expanded = expandSuffix(last)
    if (expanded && expanded !== last) {
      const variant = canonical.slice()
      variant[variant.length - 1] = expanded
      names.push(variant)
    }
  }

  return { preDirectional, suffix, postDirectional, typed: canonical, names }
}

/**
 * Abbreviates every token of a street name except the first.
 *
 * The first token is left alone because it is where the distinctive part of a
 * name lives, and abbreviating it is the "Green Bay Rd" -> "Grn Bay Rd"
 * mistake. Everything after it is fair game: "Mill Creek Rd" and "Mill Crk Rd"
 * are one street written two ways, and one of the hundred and forty-four
 * registers uses each.
 *
 * The output can look strange -- "Little Pine Ave" becomes "LITTLE PNE AVE" --
 * and that is fine. This value is never shown to anyone. Its entire job is to
 * be the *same* strange string on both sides, so that whichever spelling the
 * county published and whichever spelling the user typed, the two meet. The
 * name a person reads comes from `name_display`, which is left as published.
 */
export function canonicalNameTokens(tokens: readonly string[]): string[] {
  const out = new Array<string>(tokens.length)
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i].toUpperCase()
    out[i] = i === 0 ? token : canonicalSuffix(token) ?? token
  }
  return out
}

const assemble = (
  pre: string | null,
  name: readonly string[],
  suffix: string | null,
  post: string | null
): string => [pre, name.join(' '), suffix, post].filter(Boolean).join(' ')

/**
 * Every spelling of the street worth matching against, best guess first.
 *
 * The registers disagree with each other, so this hedges rather than picks:
 * Manatee stores `62ND STREET CIR E`, some Duval rows store `62ND STREET
 * NORTHEAST`, and USPS itself would write `62ND ST CIR E`. All three come out
 * of here, at most six in total.
 *
 * They are not six database queries. Candidate generation runs on the first
 * one and leans on trigram similarity to be tolerant -- "62nd st cir e" and
 * "62nd street cir e" share most of their trigrams. The rest exist so the
 * re-ranker can score a candidate against the spelling the county actually
 * used instead of penalising it for a convention the user never chose.
 */
function buildVariants(
  pre: string | null,
  names: readonly string[][],
  suffix: string | null,
  post: string | null
): string[] {
  const out: string[] = []

  // Abbreviated first, then spelled out. Whichever convention a register
  // follows it applies to the suffix and the direction together, so these move
  // as a pair rather than multiplying out.
  const longSuffix = suffix ? expandSuffix(suffix) : null
  const longPost = post ? expandDirectional(post) : null
  const longPre = pre ? expandDirectional(pre) : null

  const styles: Array<[string | null, string | null, string | null]> = [[pre, suffix, post]]
  if (longSuffix !== suffix || longPost !== post || longPre !== pre) {
    styles.push([longPre ?? pre, longSuffix ?? suffix, longPost ?? post])
  }

  for (let s = 0; s < styles.length; s++) {
    for (let n = 0; n < names.length; n++) {
      const value = assemble(styles[s][0], names[n], styles[s][1], styles[s][2])
      if (value && out.indexOf(value) === -1) out.push(value)
    }
  }

  return out
}

/**
 * The head of an address, once the city/state/postcode tail has been removed.
 *
 * `parseAddress` returns null for the street when it had to fall back to its
 * loose scan, so the first comma-separated segment is the fallback: in
 * "862 62nd St Cir E, Bradenton, Florida" it is exactly the head, and in a
 * string with no commas at all it is the whole thing, which is the best guess
 * available.
 */
function headOf(raw: string, street: string | null): string {
  if (street) return street
  const comma = raw.indexOf(',')
  return (comma === -1 ? raw : raw.slice(0, comma)).trim()
}

/**
 * Punctuation goes, except the "#" that marks a unit and the "/" that joins two
 * of them. The full stops in "St." and "N.E." are noise and must not become
 * token boundaries.
 */
function tokenise(value: string): string[] {
  return value
    .replace(/\./g, '')
    .replace(/[^\w#/-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

export interface CanonicalStreet {
  /**
   * The index key, before folding: "62ND ST CIR E". Both the ETL and the query
   * derive this with the same code, which is the entire point -- it is the one
   * string on which the two sides have to agree.
   */
  norm: string
  /**
   * As published, with any unit removed. What the user is shown, so it keeps
   * the county's own spelling rather than the abbreviations above.
   */
  display: string
  unit: ParsedUnit | null
}

/**
 * Canonicalises a bare street name -- no house number, no city.
 *
 * Used by `scripts/geo/build-index.ts` on every one of the seventeen million
 * address points, and by `parseUsAddress` on every query. That shared use is
 * deliberate and load-bearing: a hundred and forty-four county registers
 * disagree with each other about whether to write ST or STREET, AV or AVE, N or
 * NORTH, and several of them put the flat number inside the street name
 * ("BERRYHILL RD APT 3J"). Running both sides through one function collapses
 * all of that instead of trying to anticipate it at query time.
 */
export function canonicalizeStreet(raw: string | null | undefined): CanonicalStreet {
  if (typeof raw !== 'string' || !raw.trim()) return { norm: '', display: '', unit: null }

  const tokens = tokenise(raw)
  if (tokens.length === 0) return { norm: '', display: '', unit: null }

  const { rest, unit } = extractUnitTokens(tokens)
  const usable = rest.length > 0 ? rest : tokens
  const { preDirectional, suffix, postDirectional, typed } = analyseStreet(usable)

  return {
    norm: assemble(preDirectional, typed, suffix, postDirectional),
    display: usable.join(' '),
    unit,
  }
}

export function parseUsAddress(raw: string | null | undefined): ParsedUsAddress {
  if (typeof raw !== 'string' || !raw.trim()) return EMPTY

  const tail = parseAddress(raw)
  const head = headOf(raw, tail.street)

  const tokens = tokenise(head)

  if (tokens.length === 0) {
    return { ...EMPTY, city: tail.city, state: tail.state, zip: tail.zip }
  }

  let number: number | null = null
  let numberSuffix: string | null = null
  let streetTokens = tokens

  const parsedNumber = splitHouseNumber(tokens[0])
  // A single token that is entirely a number is a house number only if a street
  // follows it. "34208" on its own is a postcode, and "5" is nothing.
  if (parsedNumber && tokens.length > 1) {
    number = parsedNumber[0]
    numberSuffix = parsedNumber[1]
    streetTokens = tokens.slice(1)

    // "123 1/2 Main St" -- the fraction is its own token and belongs to the
    // number, not to the street.
    if (numberSuffix === null && /^\d\/\d$/.test(streetTokens[0] ?? '')) {
      numberSuffix = streetTokens[0]
      streetTokens = streetTokens.slice(1)
    }
  }

  const { rest, unit } = extractUnitTokens(streetTokens)
  const usable = rest.length > 0 ? rest : streetTokens
  const { preDirectional, suffix, postDirectional, typed, names } = analyseStreet(usable)

  const spellings = buildVariants(preDirectional, names, suffix, postDirectional)

  /**
   * "Bradenton, FL" names a city, not a street.
   *
   * `parseAddress` has nothing else to do with a single-segment head, so it puts
   * the same word in both `street` and `city`. Left alone, the engine searched
   * for a street called Bradenton and answered with "Braden Run" — a road four
   * postcodes away that merely starts the same way.
   *
   * The comparison is against the WHOLE street, suffix included, and getting
   * that wrong is easy: an earlier version compared only the name part, so
   * "Miami St, Miami" reduced to "MIAMI" against "Miami" and a real street
   * stopped being searchable. "MIAMI ST" does not equal "miami" and is fine.
   *
   * Only with no house number, since "100 Bradenton, Bradenton" says a building
   * was meant.
   */
  const namesTheCityAndNothingElse =
    number === null && tail.city !== null && fold(spellings[0] ?? '') === fold(tail.city)

  const variants = namesTheCityAndNothingElse ? [] : spellings

  return {
    number,
    numberSuffix,
    preDirectional,
    streetName: typed.join(' '),
    suffix,
    postDirectional,
    street: variants[0] ?? '',
    variants,
    unit,
    city: tail.city,
    state: tail.state,
    zip: tail.zip,
    confident: number !== null && typed.length > 0,
  }
}

/**
 * The unit alone, for callers that only want that.
 *
 * The mirror of `stripUnit`, which returns everything except this.
 */
export function extractUnit(raw: string | null | undefined): ParsedUnit | null {
  return parseUsAddress(raw).unit
}
