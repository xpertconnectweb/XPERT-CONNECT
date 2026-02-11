/** Strip HTML tags and trim whitespace from user input */
export function sanitize(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim()
}

/** Validate a basic phone format (digits, spaces, dashes, parens, plus) */
export function isValidPhone(phone: string): boolean {
  return /^[+\d\s().-]{7,20}$/.test(phone)
}
