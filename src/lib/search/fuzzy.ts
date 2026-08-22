/**
 * Typo tolerance.
 *
 * Two complementary measures: bounded Damerau-Levenshtein for short edits
 * (including transpositions, the most common real typo), and trigram Jaccard
 * similarity as a looser net for longer words where an edit budget of 2 is not
 * enough but the words are still obviously related.
 *
 * Everything is bounded and early-aborting. The corpus is ~880 records of ~15
 * tokens each, so a full linear scan runs in single-digit milliseconds — but
 * only because no comparison is ever allowed to run to completion when it is
 * already too expensive to matter.
 */

/**
 * Damerau-Levenshtein distance with a hard ceiling.
 *
 * Returns `max + 1` as soon as the true distance is known to exceed `max`,
 * which lets callers treat "too far" as a single cheap check. The banded inner
 * loop means a bounded comparison costs O(len * (2*max + 1)), not O(len^2).
 */
export function damerauLevenshtein(a: string, b: string, max: number): number {
  if (a === b) return 0
  if (max < 0) return 1
  const aLen = a.length
  const bLen = b.length
  if (aLen === 0) return bLen <= max ? bLen : max + 1
  if (bLen === 0) return aLen <= max ? aLen : max + 1
  // A length gap alone already exceeds the budget.
  if (Math.abs(aLen - bLen) > max) return max + 1

  let prevPrev: number[] = []
  let prev: number[] = new Array(bLen + 1)
  let curr: number[] = new Array(bLen + 1)

  for (let j = 0; j <= bLen; j++) prev[j] = j

  for (let i = 1; i <= aLen; i++) {
    curr[0] = i
    // Only the diagonal band within `max` can produce a result <= max.
    const from = Math.max(1, i - max)
    const to = Math.min(bLen, i + max)
    // Cells outside the band are unreachable; mark them so the next row's
    // min() cannot read a stale value from a previous iteration.
    if (from > 1) curr[from - 1] = max + 1
    if (to < bLen) curr[to + 1] = max + 1

    let rowBest = max + 1
    for (let j = from; j <= to; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let value = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost // substitution
      )
      // Transposition: "ortho" -> "otrho" is one edit, not two.
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        value = Math.min(value, prevPrev[j - 2] + 1)
      }
      curr[j] = value
      if (value < rowBest) rowBest = value
    }

    // Every cell in the band is already over budget, so no completion can be.
    if (rowBest > max) return max + 1

    prevPrev = prev
    prev = curr
    curr = new Array(bLen + 1)
  }

  const result = prev[bLen]
  return result <= max ? result : max + 1
}

/**
 * Edit budget by token length.
 *
 * Short tokens get none: at three characters almost every word is one edit from
 * several others, and a false positive there is far more visible than a missed
 * correction.
 */
export function maxEditsFor(length: number): number {
  if (length <= 3) return 0
  // Two edits only from eight characters up. At seven, two edits is 29% of the
  // word — not a typo but a different word: it made "orlando" match "Armando"
  // and surface a Miami firm for a city search.
  if (length <= 7) return 1
  return 2
}

/** Padded character trigrams, so word starts and ends carry weight. */
export function trigrams(value: string): Set<string> {
  const padded = `  ${value} `
  const out = new Set<string>()
  for (let i = 0; i < padded.length - 2; i++) {
    out.add(padded.slice(i, i + 3))
  }
  return out
}

/** Jaccard similarity over trigram sets, 0..1. */
export function trigramSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (!a || !b) return 0
  const ta = trigrams(a)
  const tb = trigrams(b)
  let shared = 0
  // forEach rather than for-of: the project compiles at the default ES5 target,
  // where iterating a Set needs --downlevelIteration.
  ta.forEach((gram) => {
    if (tb.has(gram)) shared++
  })
  const union = ta.size + tb.size - shared
  return union === 0 ? 0 : shared / union
}

const PREFIX_MAX = 0.92
const PREFIX_MIN = 0.8
const TRIGRAM_FLOOR = 0.5

/**
 * How well a query token matches a document token, 0..1.
 *
 * The ladder is ordered so that autocomplete behaves: a prefix match scores
 * above any edit-distance match, because while someone is typing "ortho" the
 * right answer is *Orthopedic*, not *Other* — which is one edit away and would
 * otherwise win. That single ordering decision is what keeps as-you-type
 * results from flickering into nonsense.
 */
export function tokenSimilarity(query: string, doc: string): number {
  if (!query || !doc) return 0
  if (query === doc) return 1

  const qLen = query.length
  const dLen = doc.length

  if (doc.startsWith(query)) {
    // Longer completions are slightly weaker: "ortho" is a better match for
    // "orthopedic" than for "orthopedicrehabilitationcenter".
    const ratio = qLen / dLen
    const score = PREFIX_MAX - 0.12 * (1 - ratio)
    return Math.min(PREFIX_MAX, Math.max(PREFIX_MIN, score))
  }

  // The user typed more than the document holds ("orthopedics" vs "ortho").
  //
  // Scaled by how much of the query the document actually explains, and floored
  // at four characters. A flat score here was the single worst source of noise:
  // "chi" is a prefix of "chirpractic" and "new" of "newlin", so every "CHI St
  // Joseph's" and "New Port Richey" clinic scored as a strong match and buried
  // the real ones.
  if (dLen >= 4 && query.startsWith(doc)) return 0.78 * (dLen / qLen)

  // Interior substring ("pedic" inside "orthopedic").
  if (qLen >= 3 && doc.includes(query)) return 0.62

  const budget = maxEditsFor(qLen)
  if (budget > 0) {
    const distance = damerauLevenshtein(query, doc, budget)
    if (distance <= budget) return 0.85 - 0.22 * distance
  }

  // Last resort for longer words, where 2 edits is too tight a budget.
  if (qLen >= 5 && dLen >= 5) {
    const similarity = trigramSimilarity(query, doc)
    if (similarity >= TRIGRAM_FLOOR) return 0.35 + 0.3 * similarity
  }

  return 0
}
