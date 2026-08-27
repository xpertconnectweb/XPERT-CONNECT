/**
 * Address keys for deduplication.
 *
 * These functions were written inside `compare-clinics.js` to catch clinics
 * that were the same building written two ways ("1234 Main St Ste 200" and
 * "1234 Main Street, Suite 200"). The NPPES import needs exactly the same
 * judgement — it has to recognise that a practice it just found is already in
 * the directory — and a second copy of these rules that drifted from the first
 * would quietly start creating twins.
 *
 * Extracted verbatim. `extractCore` is the one change: it used to split on a
 * literal `, fl`, which was fine for a Florida-only comparison and useless for
 * Minnesota. It now splits on any two-letter state, which behaves identically
 * on every Florida address it was originally written against.
 */

/** Expands the abbreviations that make one building look like two. */
function normalizeAddress(addr) {
  if (!addr) return ''
  return addr
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/,\s*/g, ', ')
    .replace(/\bste\b/g, 'suite')
    .replace(/\bunit\b/g, 'suite')
    .replace(/\bblvd\b/g, 'boulevard')
    .replace(/\bdr\b/g, 'drive')
    .replace(/\bst\b/g, 'street')
    .replace(/\bave\b/g, 'avenue')
    .replace(/\brd\b/g, 'road')
    .replace(/\bhwy\b/g, 'highway')
    .replace(/\bpkwy\b/g, 'parkway')
    .replace(/\bln\b/g, 'lane')
    .replace(/\bct\b/g, 'court')
    .replace(/\bpl\b/g, 'place')
    .replace(/\bcir\b/g, 'circle')
    .replace(/\bter\b/g, 'terrace')
    .replace(/[–—\-]+/g, '-')
    .replace(/suite\s*[#]?\s*/g, 'suite ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Common abbreviations inside the street name itself. */
function normalizeStreetName(s) {
  return s
    .replace(/\bmartin luther king jr\b/g, 'mlk jr')
    .replace(/\bmartin luther king\b/g, 'mlk')
    .replace(/\bn\.?\s*/g, 'n ')
    .replace(/\bs\.?\s*/g, 's ')
    .replace(/\be\.?\s*/g, 'e ')
    .replace(/\bw\.?\s*/g, 'w ')
    .replace(/\bnw\.?\s*/g, 'nw ')
    .replace(/\bne\.?\s*/g, 'ne ')
    .replace(/\bsw\.?\s*/g, 'sw ')
    .replace(/\bse\.?\s*/g, 'se ')
    .replace(/\bst\.\s/g, 'st ')
    .replace(/\bave\.\s/g, 'ave ')
    .replace(/\bblvd\.\s/g, 'blvd ')
    .replace(/\bdr\.\s/g, 'dr ')
    .replace(/\brd\.\s/g, 'rd ')
    .replace(/\bhwy\.\s/g, 'hwy ')
    .replace(/\bpkwy\.\s/g, 'pkwy ')
    .replace(/\(hq\)\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Drops the suite, unit, building and hash number.
 *
 * Two orthopedic groups on different floors of one medical building are two
 * practices, but the same practice written with and without its suite is one —
 * and the second mistake is far more common in this data than the first.
 */
function streetCore(line) {
  if (!line) return ''
  const core = line
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\bsuite\b\s*\S*/gi, '')
    .replace(/\bste\b\s*\S*/gi, '')
    .replace(/\bunit\b\s*\S*/gi, '')
    .replace(/\bbuilding\b\s*\S*/gi, '')
    .replace(/\bbldg\b\s*\S*/gi, '')
    .replace(/\bfloor\b\s*\S*/gi, '')
    .replace(/\b#\s*\S*/gi, '')
    .replace(/,\s*$/, '')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return normalizeStreetName(core)
}

/** Street number + street name + city, with the state and ZIP cut off. */
function extractCore(addr) {
  if (!addr) return ''
  const lower = addr.toLowerCase().trim().replace(/\s+/g, ' ')
  const parts = lower.split(/,\s*[a-z]{2}\b/)
  return streetCore(parts[0] ?? lower)
}

/**
 * The clustering key for a structured address.
 *
 * ZIP rather than city name, because NPPES writes "ST PAUL", "SAINT PAUL" and
 * "St. Paul" for one place but is disciplined about the postcode. City is kept
 * alongside it only to keep two identically-numbered streets in adjacent ZIPs
 * from colliding.
 */
function practiceKey({ line1, line2, city, zip5 }) {
  const street = streetCore([line1, line2].filter(Boolean).join(' '))
  return [street, (city || '').toLowerCase().trim(), (zip5 || '').slice(0, 5)].join('|')
}

/**
 * A postal-style canonical form of one street line.
 *
 * Separate from `streetCore` on purpose: `streetCore` is the clustering key
 * and changing it would orphan every key already written to disk. This is for
 * COMPARING two spellings of one street, which is a harder problem — NPPES
 * stores "4010 W 65TH ST" on one record and "4010 WEST 65TH STREET" on the
 * next, and treating those as different addresses is how a chiropractor ends
 * up named as the surgery centre next door.
 */
const DIRECTIONALS = {
  north: 'n', south: 's', east: 'e', west: 'w',
  northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw',
}
const SUFFIXES = {
  street: 'st', avenue: 'ave', av: 'ave', boulevard: 'blvd', drive: 'dr',
  road: 'rd', lane: 'ln', court: 'ct', place: 'pl', circle: 'cir',
  terrace: 'ter', parkway: 'pkwy', highway: 'hwy', trail: 'trl',
  square: 'sq', turnpike: 'tpke', expressway: 'expy', freeway: 'fwy',
}
const ORDINALS = {
  first: '1st', second: '2nd', third: '3rd', fourth: '4th', fifth: '5th',
  sixth: '6th', seventh: '7th', eighth: '8th', ninth: '9th', tenth: '10th',
}

function canonicalStreet(line) {
  if (!line) return ''
  return line
    .toLowerCase()
    .replace(
      /\b(?:suite|ste|unit|apt|bldg|building|floor|rm|room)\b\s*\S*|#\s*\S*/g,
      ' '
    )
    .replace(/[.,]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => DIRECTIONALS[w] ?? SUFFIXES[w] ?? ORDINALS[w] ?? w)
    .join(' ')
    .trim()
}

module.exports = {
  canonicalStreet,
  normalizeAddress,
  normalizeStreetName,
  streetCore,
  extractCore,
  practiceKey,
}
