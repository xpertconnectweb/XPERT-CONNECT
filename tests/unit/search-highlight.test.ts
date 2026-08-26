import { describe, expect, it } from 'vitest'
import { splitOnMatch } from '@/lib/search/highlight'

/**
 * The one invariant that matters more than any matching rule: whatever this
 * returns must reassemble to the string it was given. A highlighter that
 * quietly drops an ampersand or a hyphen is worse than no highlighter, because
 * the reader has no way to know the name they are looking at is not the name.
 */
const rebuild = (label: string, query: string) =>
  splitOnMatch(label, query).map((s) => s.text).join('')

const hits = (label: string, query: string) =>
  splitOnMatch(label, query).filter((s) => s.hit).map((s) => s.text)

describe('splitOnMatch', () => {
  it('always reassembles to the original', () => {
    const labels = [
      'Orthopaedic & Fracture Clinic – Physical Therapy',
      "St. Cloud Orthopedics Physical Therapy",
      'Twin Cities Orthopedics — Eagan',
      "O'Brien Chiropractic",
      'Clínica Ortopédica',
      '862 62nd Street Cir E, Bradenton, FL 34208',
    ]
    for (const label of labels) {
      for (const query of ['ortho', 'clinic', 'st cloud', '', 'zzz', '62']) {
        expect(rebuild(label, query)).toBe(label)
      }
    }
  })

  it('marks the word the query starts', () => {
    expect(hits('Northern Orthopedics Physical Therapy', 'ortho')).toEqual(['Orthopedics'])
  })

  it('marks every word a multi-word query reaches', () => {
    expect(hits('St. Cloud Orthopedics Physical Therapy', 'st cloud')).toEqual(['St', 'Cloud'])
  })

  /**
   * The case that rules out folding the label and slicing by index: `fold`
   * expands `&` to ` and `, so every index after it shifts by four and a
   * highlight computed in folded space lands on the wrong word.
   */
  it('is not confused by an ampersand', () => {
    expect(hits('Orthopaedic & Fracture Clinic', 'fracture')).toEqual(['Fracture'])
    expect(rebuild('Orthopaedic & Fracture Clinic', 'fracture')).toBe('Orthopaedic & Fracture Clinic')
  })

  it('matches through accents and apostrophes, which fold removes', () => {
    expect(hits('Clínica Ortopédica', 'ortopedica')).toEqual(['Ortopédica'])
    expect(hits("O'Brien Chiropractic", 'obrien')).toEqual(["O'Brien"])
  })

  /**
   * Prefix, not substring -- the same rule `fuzzy.ts` scores by, so what is
   * emphasised agrees with what was ranked instead of telling another story.
   */
  it('does not mark a word the query merely appears inside', () => {
    expect(hits('Reorthodontics', 'ortho')).toEqual([])
  })

  it('marks nothing for an empty or unmatched query', () => {
    expect(splitOnMatch('Newlin Chiropractic', '')).toEqual([
      { text: 'Newlin Chiropractic', hit: false },
    ])
    expect(hits('Newlin Chiropractic', 'zzzz')).toEqual([])
  })

  it('handles an empty label without inventing a segment', () => {
    expect(splitOnMatch('', 'ortho')).toEqual([])
  })

  it('is not left stateful by a previous call', () => {
    // The word regex is module-level and global; forgetting `lastIndex` makes
    // every second call skip the start of the string.
    const once = hits('Orthopedic Center', 'ortho')
    const twice = hits('Orthopedic Center', 'ortho')
    expect(twice).toEqual(once)
  })
})
