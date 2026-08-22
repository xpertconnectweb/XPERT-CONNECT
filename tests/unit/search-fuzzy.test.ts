import { describe, expect, it } from 'vitest'
import {
  damerauLevenshtein,
  maxEditsFor,
  tokenSimilarity,
  trigramSimilarity,
} from '@/lib/search/fuzzy'

/** Unbounded reference implementation, used to pin the banded version. */
function reference(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  )
  for (let i = 0; i <= a.length; i++) d[i][0] = i
  for (let j = 0; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[a.length][b.length]
}

describe('damerauLevenshtein', () => {
  it('counts a transposition as one edit', () => {
    expect(damerauLevenshtein('ortho', 'otrho', 2)).toBe(1)
  })

  it('returns 0 for identical strings', () => {
    expect(damerauLevenshtein('tampa', 'tampa', 2)).toBe(0)
  })

  it('handles empty strings', () => {
    expect(damerauLevenshtein('', '', 2)).toBe(0)
    expect(damerauLevenshtein('abc', '', 5)).toBe(3)
    expect(damerauLevenshtein('', 'abc', 2)).toBe(3)
  })

  it('reports max+1 once the budget is exceeded', () => {
    expect(damerauLevenshtein('tampa', 'orlando', 1)).toBe(2)
    expect(damerauLevenshtein('abcdefgh', 'zzzzzzzz', 2)).toBe(3)
  })

  it('short-circuits on a length gap alone', () => {
    expect(damerauLevenshtein('a', 'abcdefgh', 2)).toBe(3)
  })

  it('agrees with the unbounded reference across the whole small-string space', () => {
    // The banded inner loop is the easiest part of this to get subtly wrong,
    // so it is pinned exhaustively rather than by example.
    const alphabet = 'abc'
    const words: string[] = ['']
    for (let len = 1; len <= 4; len++) {
      const prev = words.filter((w) => w.length === len - 1)
      for (const w of prev) for (const ch of alphabet) words.push(w + ch)
    }
    // Mismatches are collected and asserted once. A per-iteration expect()
    // across ~58k combinations is slow enough to blow the test timeout.
    const mismatches: string[] = []
    for (const a of words) {
      for (const b of words) {
        const truth = reference(a, b)
        for (let max = 0; max <= 3; max++) {
          const expected = truth <= max ? truth : max + 1
          const actual = damerauLevenshtein(a, b, max)
          if (actual !== expected) {
            mismatches.push(`"${a}" vs "${b}" @max=${max}: got ${actual}, want ${expected}`)
          }
        }
      }
    }
    expect(mismatches.slice(0, 10)).toEqual([])
  })
})

describe('maxEditsFor', () => {
  it('gives short tokens no budget at all', () => {
    // At three characters almost every word is one edit from several others.
    expect(maxEditsFor(1)).toBe(0)
    expect(maxEditsFor(3)).toBe(0)
  })

  it('steps up at the documented boundaries', () => {
    expect(maxEditsFor(4)).toBe(1)
    expect(maxEditsFor(7)).toBe(1)
    expect(maxEditsFor(8)).toBe(2)
    expect(maxEditsFor(20)).toBe(2)
  })

  it('does not let two edits pass on a seven-letter word', () => {
    // "orlando" vs "Armando" is two substitutions. Allowing it surfaced a
    // Miami firm for a city search.
    expect(tokenSimilarity('orlando', 'armando')).toBe(0)
  })
})

describe('trigramSimilarity', () => {
  it('is 1 for identical strings and 0 for empty ones', () => {
    expect(trigramSimilarity('orthopedic', 'orthopedic')).toBe(1)
    expect(trigramSimilarity('', 'abc')).toBe(0)
  })

  it('scores related words above unrelated ones', () => {
    expect(trigramSimilarity('chiropractic', 'chiropractor')).toBeGreaterThan(
      trigramSimilarity('chiropractic', 'orthopedics')
    )
  })
})

describe('tokenSimilarity — the ranking ladder', () => {
  it('scores an exact match highest', () => {
    expect(tokenSimilarity('tampa', 'tampa')).toBe(1)
  })

  it('ranks a prefix above an edit-distance match', () => {
    // The decisive property for as-you-type: while someone types "ortho" the
    // right answer is "orthopedic", not "other" (one edit away).
    expect(tokenSimilarity('ortho', 'orthopedic')).toBeGreaterThan(
      tokenSimilarity('ortho', 'other')
    )
    expect(tokenSimilarity('ortho', 'other')).toBe(0)
  })

  it('catches a single-character typo in a long word', () => {
    expect(tokenSimilarity('chirpractic', 'chiropractic')).toBeGreaterThan(0.5)
    expect(tokenSimilarity('smith', 'smyth')).toBeGreaterThan(0.5)
  })

  it('gives short document fragments almost nothing', () => {
    // A flat score here made every "CHI St Joseph's" clinic a strong match for
    // "chirpractic", and every "New Port Richey" one for "newlin".
    expect(tokenSimilarity('chirpractic', 'chi')).toBe(0)
    expect(tokenSimilarity('newlin', 'new')).toBe(0)
  })

  it('still rewards a genuine over-typed query', () => {
    expect(tokenSimilarity('chiropractics', 'chiropractic')).toBeGreaterThan(0.6)
  })

  it('scores an interior substring below a prefix', () => {
    expect(tokenSimilarity('pedic', 'orthopedic')).toBeLessThan(
      tokenSimilarity('ortho', 'orthopedic')
    )
  })

  it('returns 0 for unrelated tokens and empty input', () => {
    expect(tokenSimilarity('tampa', 'orlando')).toBe(0)
    expect(tokenSimilarity('', 'tampa')).toBe(0)
    expect(tokenSimilarity('tampa', '')).toBe(0)
  })

  it('never exceeds 1', () => {
    const pairs: [string, string][] = [
      ['a', 'a'],
      ['ortho', 'orthopedic'],
      ['chiropractic', 'chiropractic'],
      ['x', 'xyz'],
    ]
    for (const [q, d] of pairs) {
      expect(tokenSimilarity(q, d)).toBeLessThanOrEqual(1)
    }
  })
})
