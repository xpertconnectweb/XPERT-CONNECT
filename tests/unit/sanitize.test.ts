import { describe, expect, it } from 'vitest'
import { sanitize, isValidPhone } from '@/lib/sanitize'

describe('sanitize', () => {
  it('strips simple HTML tags', () => {
    expect(sanitize('<b>hello</b>')).toBe('hello')
    expect(sanitize('<script>alert(1)</script>')).toBe('alert(1)')
  })

  it('strips nested tags', () => {
    expect(sanitize('<div><span>x</span></div>')).toBe('x')
  })

  it('strips self-closing and attributes', () => {
    expect(sanitize('<img src="x" onerror="evil()">y')).toBe('y')
  })

  it('trims surrounding whitespace', () => {
    expect(sanitize('   hello   ')).toBe('hello')
  })

  it('preserves inner whitespace and unicode', () => {
    expect(sanitize('  José Pérez  ')).toBe('José Pérez')
  })

  it('returns empty string for tag-only input', () => {
    expect(sanitize('<br/>')).toBe('')
  })

  it('does not mutate plain text', () => {
    expect(sanitize('plain text 123')).toBe('plain text 123')
  })
})

describe('isValidPhone', () => {
  it.each([
    '+1 305 555 0000',
    '(305) 555-0000',
    '305.555.0000',
    '3055550000',
    '+1-305-555-0000',
    '305-555',
  ])('accepts %s', (value) => {
    expect(isValidPhone(value)).toBe(true)
  })

  it.each([
    '',
    '12345', // too short (<7)
    'abcdefg',
    '305 555 0000 ext 123 too long indeed', // >20
    '<script>',
  ])('rejects %s', (value) => {
    expect(isValidPhone(value)).toBe(false)
  })
})
