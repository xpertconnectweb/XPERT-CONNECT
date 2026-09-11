import { describe, expect, it } from 'vitest'
import {
  EXPANSION_PENALTY,
  extractZip,
  fold,
  isZipToken,
  normalizeZip,
  prepareQuery,
  tokenize,
} from '@/lib/search/text'
import { interpretQuery } from '@/lib/search/query'

describe('fold', () => {
  it('strips diacritics so "jose" finds "José"', () => {
    expect(fold('José Martínez Clinic')).toBe('jose martinez clinic')
    expect(fold('Muñoz & Peña')).toBe('munoz and pena')
  })

  it('expands ampersand to a word', () => {
    expect(fold('Spine & Trauma')).toBe('spine and trauma')
  })

  it('removes apostrophes rather than splitting on them', () => {
    // "O'Brien" must stay one token, not become "o" + "brien".
    expect(fold("O'Brien Law")).toBe('obrien law')
    expect(fold('CHI St Joseph’s Health')).toBe('chi st josephs health')
  })

  it('flattens en-dashes, parentheses and punctuation', () => {
    expect(fold('Clearway Pain Solutions – Pensacola (Grande)')).toBe(
      'clearway pain solutions pensacola grande'
    )
  })

  it('collapses whitespace and trims', () => {
    expect(fold('  Two    Words  ')).toBe('two words')
  })

  it('handles empty input', () => {
    expect(fold('')).toBe('')
    expect(fold('   ')).toBe('')
    expect(fold('!!!')).toBe('')
  })
})

describe('tokenize', () => {
  it('drops stopwords', () => {
    expect(tokenize('The Center of Auto Injuries at Tampa')).toEqual([
      'center',
      'auto',
      'injuries',
      'tampa',
    ])
  })

  it('keeps domain words that carry meaning', () => {
    // `clinic`, `law` and `group` are deliberately NOT stopwords.
    expect(tokenize('Law Group')).toEqual(['law', 'group'])
  })

  it('drops single letters but keeps single digits', () => {
    expect(tokenize('a b 5')).toEqual(['5'])
  })
})

describe('prepareQuery — expansion', () => {
  it('expands medical abbreviations', () => {
    const [ortho] = prepareQuery('ortho')
    expect(ortho.raw).toBe('ortho')
    expect(ortho.variants).toContain('orthopedic')
    expect(ortho.variants).toContain('orthopedist')
    expect(ortho.variants[0]).toBe('ortho')
  })

  it('emits both readings of an ambiguous street abbreviation', () => {
    const [st] = prepareQuery('st')
    expect(st.variants).toContain('street')
    expect(st.variants).toContain('saint')
  })

  it('rewrites multi-word phrases before tokenizing', () => {
    expect(prepareQuery('st pete').map((t) => t.raw)).toEqual(['saint', 'petersburg'])
  })

  it('gives corporate suffixes reduced weight', () => {
    const tokens = prepareQuery('smith pa')
    expect(tokens.find((t) => t.raw === 'smith')?.weight).toBe(1)
    expect(tokens.find((t) => t.raw === 'pa')?.weight).toBeLessThan(1)
  })

  it('leaves unknown tokens alone', () => {
    expect(prepareQuery('newlin')[0].variants).toEqual(['newlin'])
  })

  it('penalises expanded variants below literal ones', () => {
    expect(EXPANSION_PENALTY).toBeLessThan(1)
  })
})

describe('ZIP handling', () => {
  it('recognises ZIP tokens', () => {
    expect(isZipToken('32801')).toBe(true)
    expect(isZipToken('32801-1234')).toBe(true)
    expect(isZipToken('3280')).toBe(false)
    expect(isZipToken('328011')).toBe(false)
  })

  it('extracts a ZIP from an address', () => {
    expect(extractZip('Ocala, FL 34471')).toBe('34471')
    expect(extractZip('Miami, FL 33130-1234')).toBe('33130')
  })

  it('never reads a phone number as a ZIP', () => {
    expect(extractZip('8449737866')).toBeNull()
    expect(extractZip('(844) 973-7866')).toBeNull()
  })

  it('normalizes ZIP+4 down to five digits', () => {
    expect(normalizeZip('32801-1234')).toBe('32801')
    expect(normalizeZip('32801')).toBe('32801')
    expect(normalizeZip(null)).toBeNull()
    expect(normalizeZip('abc')).toBeNull()
  })
})

describe('interpretQuery', () => {
  it('classifies an empty query', () => {
    expect(interpretQuery('').kind).toBe('empty')
    expect(interpretQuery('   ').kind).toBe('empty')
  })

  it('lifts a bare ZIP out of the token stream', () => {
    const q = interpretQuery('32801')
    expect(q.kind).toBe('zip')
    expect(q.zip).toBe('32801')
    expect(q.tokens).toHaveLength(0)
  })

  it('handles a ZIP mixed with text', () => {
    const q = interpretQuery('chiropractic 32801')
    expect(q.kind).toBe('mixed')
    expect(q.zip).toBe('32801')
    expect(q.tokens.map((t) => t.raw)).toEqual(['chiropractic'])
  })

  it('classifies plain text', () => {
    const q = interpretQuery('newlin chiropractic')
    expect(q.kind).toBe('text')
    expect(q.zip).toBeNull()
    expect(q.tokens).toHaveLength(2)
  })
})

describe('prepareQuery — orthopedics and neurosurgery', () => {
  it('lets "neuro" reach the rehab and the surgical vocabulary at once', () => {
    // The DATA alias keeps 'neuro' pointed at Neurological Rehabilitation,
    // because that is what the stored rows mean. The ambiguity is paid for
    // here instead, where a wider reading costs one comparison.
    const [neuro] = prepareQuery('neuro')
    expect(neuro.variants).toContain('neurological')
    expect(neuro.variants).toContain('neurosurgery')
  })

  it('expands the Spanish a referrer would type', () => {
    expect(prepareQuery('neurocirujano')[0].variants).toContain('neurosurgery')
    expect(prepareQuery('ortopedista')[0].variants).toContain('orthopedics')
  })

  it('accepts the accented spelling too', () => {
    // fold() strips diacritics before the lookup, so both spellings of
    // "traumatólogo" arrive at one key.
    expect(prepareQuery('traumatólogo')[0].variants).toContain('orthopedics')
    expect(prepareQuery('traumatologo')[0].variants).toContain('orthopedics')
  })

  it('turns "spine surgeon" into the tags that can answer it', () => {
    const raw = prepareQuery('spine surgeon').map((t) => t.raw)
    expect(raw).toContain('neurosurgery')
    expect(raw).toContain('spine')
  })

  it('does not chain one phrase expansion into the next', () => {
    // applyPhraseExpansions is a substring replace over the already-rewritten
    // string, iterated in key order. A phrase whose output contains another
    // phrase key would expand twice.
    expect(prepareQuery('brain surgeon').map((t) => t.raw)).toEqual(['neurosurgery'])
    expect(prepareQuery('bone doctor').map((t) => t.raw)).toEqual(['orthopedics'])
  })

  it('keeps the ae spelling reachable from the abbreviation', () => {
    expect(prepareQuery('ortho')[0].variants).toContain('orthopaedic')
    expect(prepareQuery('ortho')[0].variants).toContain('orthopaedics')
  })
})

describe('geographic qualifiers', () => {
  const weightOf = (query: string, raw: string) =>
    prepareQuery(query).find((t) => t.raw === raw)?.weight

  it('gives place qualifiers reduced weight, like corporate suffixes', () => {
    // Below 1 is what exempts a token from the AND gate. "Manatee
    // County" returned nothing because "county" was a full-weight token
    // that no document could ever match.
    expect(weightOf('manatee county', 'county')).toBeLessThan(1)
    expect(weightOf('bradenton fl', 'fl')).toBeLessThan(1)
    expect(weightOf('bradenton florida', 'florida')).toBeLessThan(1)
  })

  it('leaves the place name itself at full weight', () => {
    expect(weightOf('manatee county', 'manatee')).toBe(1)
  })

  it('still gives corporate suffixes their own reduced weight', () => {
    expect(weightOf('smith llc', 'llc')).toBeLessThan(1)
  })
})

describe('state names', () => {
  const variants = (query: string) => prepareQuery(query)[0]?.variants ?? []

  it('expands the name to the code, and back', () => {
    expect(variants('florida')).toContain('fl')
    expect(variants('fl')).toContain('florida')
    expect(variants('texas')).toContain('tx')
  })

  /**
   * PA and CO are corporate suffixes before they are states. Expanding
   * "pennsylvania" to "pa" would match the NAME of every "Smith &
   * Jones, P.A." in Florida, at the highest field weight there is.
   */
  it('refuses the codes that are also corporate suffixes', () => {
    expect(variants('pennsylvania')).not.toContain('pa')
    expect(variants('colorado')).not.toContain('co')
  })
})

describe('practice-area intent', () => {
  const variants = (query: string) => prepareQuery(query)[0]?.variants ?? []

  it('derives expansions from the alias table the admin form already uses', () => {
    expect(variants('divorce')).toContain('family')
    expect(variants('probate')).toContain('estate')
    expect(variants('probate')).toContain('planning')
    expect(variants('property')).toContain('real')
  })

  /**
   * `business → Business Law` reduces to `business → business, law`,
   * and `law` is a kind word every lawyer document carries — so on the
   * portal's mixed index, typing "business" would have matched all 627
   * firms through the `kind` field.
   */
  it('drops an expansion that reduces to the word itself plus "law"', () => {
    expect(variants('business')).toEqual(['business'])
    expect(variants('family')).toEqual(['family'])
  })

  it('keeps one that adds a real word, even when the key survives it', () => {
    // `civil → Civil Litigation` still carries information: "litigation".
    // Only the entries that reduce to nothing but the key are dropped.
    expect(variants('civil')).toEqual(['civil', 'litigation'])
  })

  it('unions the hand-written and derived tables rather than overwriting', () => {
    // `accident` is in both: auto/injuries for clinics, personal/injury
    // for attorneys. A spread would have silently kept only one.
    const accident = variants('accident')
    expect(accident).toContain('injuries')
    expect(accident).toContain('personal')
    expect(new Set(accident).size).toBe(accident.length)
  })

  it('collapses the car-accident phrases to that one token', () => {
    expect(prepareQuery('car accident')).toHaveLength(1)
    expect(prepareQuery('car accident')[0].raw).toBe('accident')
    expect(prepareQuery('car wreck')[0].raw).toBe('accident')
  })
})

describe('near me', () => {
  it('lifts the words out and records the intent', () => {
    const q = interpretQuery('personal injury near me')
    expect(q.nearMe).toBe(true)
    expect(q.tokens.map((t) => t.raw)).toEqual(['personal', 'injury'])
    expect(q.phrase).toBe('personal injury')
  })

  it('recognises the common variants', () => {
    expect(interpretQuery('lawyers nearby').nearMe).toBe(true)
    expect(interpretQuery('attorney close to me').nearMe).toBe(true)
    expect(interpretQuery('clinics around me').nearMe).toBe(true)
  })

  it('leaves an ordinary query alone', () => {
    const q = interpretQuery('near north street')
    expect(q.nearMe).toBe(false)
    expect(q.tokens.map((t) => t.raw)).toContain('near')
  })
})
