/**
 * The URL, if it is an absolute http(s) URL; otherwise `undefined`.
 *
 * For anything rendered as an `href` from stored data. React 18 still
 * renders `javascript:` URLs (it only warns), so a firm website saved as
 * `javascript:…` would run in a visitor's browser on click.
 */
export function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  try {
    const url = new URL(trimmed)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

/**
 * Normalise a website typed into an admin form.
 *
 * Bare domains ("czaialaw.com") are what people type, so https:// is
 * assumed — the same rule ProviderDetail already applies when it renders
 * one. Returns '' for empty input and `null` for something that is not a
 * web address at all, so the caller can reject it.
 */
export function normalizeWebsite(value: unknown): string | null {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return ''
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  return safeHttpUrl(withScheme) ?? null
}

/**
 * JSON for an inline `<script type="application/ld+json">`.
 *
 * `JSON.stringify` leaves `<` alone, so a string containing `</script>`
 * — a firm name, say — closes the tag and whatever follows runs as
 * script. The unicode escape of `<` is the same character to a JSON
 * parser and inert to the HTML one.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
