import { NextResponse } from 'next/server'

/** Comfortably above any form this app accepts; a referral is ~2 KB. */
const DEFAULT_MAX_BYTES = 64 * 1024

export type JsonBodyResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: NextResponse }

/**
 * Parse a JSON object body, or produce the 400/413 to return instead.
 *
 * Several routes called `await request.json()` outside any try/catch, so
 * a malformed body, an array or `null` became an unhandled 500. This is
 * the one place that turns those into client errors.
 */
export async function readJsonBody(
  request: Request,
  maxBytes = DEFAULT_MAX_BYTES
): Promise<JsonBodyResult> {
  const declared = Number(request.headers?.get?.('content-length') ?? 0)
  if (declared > maxBytes) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Request body too large.' }, { status: 413 }),
    }
  }

  let parsed: unknown
  try {
    parsed = await request.json()
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }),
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Expected a JSON object.' }, { status: 400 }),
    }
  }

  return { ok: true, body: parsed as Record<string, unknown> }
}

/** A trimmed string, or '' for anything that is not a string. */
export function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
