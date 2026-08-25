/**
 * GSM-7 encoding guard.
 *
 * The trap this module exists for: a SINGLE character outside the
 * GSM-7 alphabet flips the whole message to UCS-2, and the segment
 * limit drops from 160 characters to 70. One curly apostrophe pasted
 * into a firm name — "O’Brien & Associates" — silently doubles the
 * cost of every alert and truncates the sign-in link.
 *
 * Nothing about that failure is visible in review or in staging. It
 * shows up as a bill.
 *
 * There is a second, smaller trap: the GSM-7 *extension* characters
 * (^ { } \ [ ] ~ | €) are legal but cost TWO septets each. We treat
 * them as non-GSM and transliterate them away, because a body that
 * counts 158 characters and bills as 165 is worse than one that
 * simply cannot contain a backslash.
 */

/** 3GPP 23.038 basic set, minus the extension characters. */
const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅå' +
  'Δ_ΦΓΛΩΠΨΣΘΞ' +
  'ÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§' +
  '¿abcdefghijklmnopqrstuvwxyzäöñüà'

const GSM7_SET = new Set(GSM7_BASIC.split(''))

/**
 * The characters that actually turn up in real firm names, pasted
 * from Word, Google Docs and websites. Smart quotes and dashes are
 * by far the most common.
 *
 * Written as escapes rather than literals: several of these are
 * invisible, and two invisible keys that look identical in an editor
 * would silently collide into one property.
 */
const TRANSLITERATE: Record<string, string> = {
  '‘': "'", '’': "'", '‚': "'", '′': "'",
  '“': '"', '”': '"', '„': '"', '″': '"',
  '–': '-', '—': '-', '−': '-', '‐': '-', '‑': '-',
  '…': '...',
  ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', '​': '',
  '•': '-', '·': '-',
  '®': '', '™': '', '©': '',
  // Extension characters: legal GSM-7, but two septets each.
  '^': '', '{': '(', '}': ')', '[': '(', ']': ')',
  '~': '-', '|': '/', '\\': '/', '€': 'EUR',
}

/** Combining diacritical marks, stripped after NFD decomposition. */
const COMBINING_MARKS = /[̀-ͯ]/g

/** True when every character is in the basic set (one septet each). */
export function isGsm7(text: string): boolean {
  for (const ch of text) {
    if (!GSM7_SET.has(ch)) return false
  }
  return true
}

/**
 * Force a string into the GSM-7 basic set.
 *
 * Transliterates what has an obvious equivalent, strips accents where
 * the base letter is in the set, and drops whatever is left. Dropping
 * is correct here: an emoji in a firm name carries no information the
 * recipient needs, and keeping it would cost 90 characters of budget.
 */
export function toGsm7(text: string): string {
  let out = ''

  for (const ch of text) {
    if (GSM7_SET.has(ch)) {
      out += ch
      continue
    }

    const mapped = TRANSLITERATE[ch]
    if (mapped !== undefined) {
      out += mapped
      continue
    }

    // 'ć' -> 'c'. Note 'ñ' and 'ö' never reach here; they are in the
    // basic set already and keep their accent.
    const stripped = ch.normalize('NFD').replace(COMBINING_MARKS, '')
    if (stripped.length > 0 && stripped.split('').every((c) => GSM7_SET.has(c))) {
      out += stripped
    }
  }

  return out
}

export const MAX_SEGMENT_CHARS = 160

/**
 * Guard for template authors, not for runtime input.
 *
 * Every body we send is built from a template plus at most one
 * bounded substitution, so exceeding one segment is a bug in the
 * template rather than a condition to handle. Throwing surfaces it in
 * the unit tests, which is the only place it can happen.
 */
export function assertSingleSegment(body: string): string {
  if (!isGsm7(body)) {
    throw new Error(
      `SMS body is not GSM-7, which would halve the segment to 70 chars: ${body}`
    )
  }
  if (body.length > MAX_SEGMENT_CHARS) {
    throw new Error(
      `SMS body is ${body.length} chars, over the ${MAX_SEGMENT_CHARS} single-segment limit: ${body}`
    )
  }
  return body
}
