import { fold } from './text'

/**
 * Marks the parts of a label the query is responsible for.
 *
 * A suggestion list without this makes the reader do the matching. In this
 * corpus that is real work: "Orthopedic Rehabilitation", "Orthopaedic &
 * Fracture Clinic Physical Therapy" and "Northern Orthopedics Physical
 * Therapy" are three rows that differ in the middle, and five near-identical
 * "... Chiropractic" names is the ordinary case rather than the awkward one.
 *
 * -- Whole words, and why -----------------------------------------------------
 *
 * The obvious implementation folds the label, finds the query inside it, and
 * slices the ORIGINAL at those indices. It is wrong, because `fold` does not
 * preserve length: it strips diacritics, drops apostrophes, and expands `&`
 * into ` and `. One `&` in "Orthopaedic & Fracture" shifts every index after it
 * by four, and the highlight lands mid-word on a different word.
 *
 * Mapping folded indices back to original ones is possible and is a fiddly
 * piece of bookkeeping that would be wrong in exactly the cases nobody tests.
 * So this matches whole words instead: a word is marked when its folded form
 * begins with one of the folded query tokens. Prefix, not substring, because
 * prefix is what the scorer itself rewards (`fuzzy.ts` ranks a prefix at
 * 0.80-0.92 and an interior substring at 0.62), so the highlight agrees with
 * the ranking rather than telling a different story.
 *
 * The returned segments always reassemble to the original string exactly.
 */

export interface HighlightSegment {
  text: string
  /** True when the query is why this segment is here. */
  hit: boolean
}

/** Word characters, matching `fold`'s idea of what separates words. */
const WORD = /[A-Za-z0-9\u00c0-\u024f'’]+/g

export function splitOnMatch(label: string, query: string): HighlightSegment[] {
  if (!label) return []

  const terms = fold(query).split(' ').filter(Boolean)
  if (terms.length === 0) return [{ text: label, hit: false }]

  const segments: HighlightSegment[] = []
  let at = 0

  // `exec` in a loop rather than `matchAll`, which needs a downlevelIteration
  // this project's tsconfig does not enable.
  WORD.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = WORD.exec(label)) !== null) {
    const word = match[0]
    const folded = fold(word)
    const hit = folded.length > 0 && terms.some((term) => folded.startsWith(term))
    if (!hit) continue

    if (match.index > at) segments.push({ text: label.slice(at, match.index), hit: false })
    segments.push({ text: word, hit: true })
    at = match.index + word.length
  }

  if (at < label.length) segments.push({ text: label.slice(at), hit: false })
  // Nothing matched: one plain segment, so callers never special-case it.
  return segments.length > 0 ? segments : [{ text: label, hit: false }]
}
