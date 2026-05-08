import { describe, expect, it } from 'vitest'
import { rowToModel, rowsToModels, modelToRow } from '@/lib/mappers'

interface SampleModel {
  id: string
  firstName: string
  lawyerId?: string
  createdAt?: string
}

describe('rowToModel', () => {
  it('converts snake_case row keys to camelCase', () => {
    const result = rowToModel<SampleModel>({
      id: 'a',
      first_name: 'John',
      lawyer_id: 'l-1',
      created_at: '2026-01-01',
    })
    expect(result).toEqual({
      id: 'a',
      firstName: 'John',
      lawyerId: 'l-1',
      createdAt: '2026-01-01',
    })
  })

  it('passes through values unchanged', () => {
    const result = rowToModel<{ count: number; active: boolean; tags: string[] }>(
      { count: 42, active: true, tags: ['a', 'b'] }
    )
    expect(result.count).toBe(42)
    expect(result.active).toBe(true)
    expect(result.tags).toEqual(['a', 'b'])
  })

  it('does NOT convert single-word keys', () => {
    const result = rowToModel<{ name: string }>({ name: 'x' })
    expect(result).toEqual({ name: 'x' })
  })

  it('handles null and undefined values', () => {
    const result = rowToModel<{ lawyerId: string | null }>({ lawyer_id: null })
    expect(result.lawyerId).toBeNull()
  })
})

describe('modelToRow', () => {
  it('converts camelCase keys to snake_case', () => {
    const result = modelToRow({ firstName: 'John', lawyerId: 'l-1' })
    expect(result).toEqual({ first_name: 'John', lawyer_id: 'l-1' })
  })

  it('round-trips with rowToModel', () => {
    const original = { id: 'a', firstName: 'John', lawyerId: 'l-1' }
    const round = rowToModel<typeof original>(modelToRow(original))
    expect(round).toEqual(original)
  })
})

describe('rowsToModels', () => {
  it('maps each row in the array', () => {
    const result = rowsToModels<SampleModel>([
      { id: '1', first_name: 'A', lawyer_id: 'l-1' },
      { id: '2', first_name: 'B', lawyer_id: 'l-2' },
    ])
    expect(result).toHaveLength(2)
    expect(result[0].firstName).toBe('A')
    expect(result[1].firstName).toBe('B')
  })

  it('returns empty array for empty input', () => {
    expect(rowsToModels([])).toEqual([])
  })
})
