/**
 * Legal vocabulary for query expansion, derived from the catalog.
 *
 * `src/lib/practice-areas.ts` has carried a synonym table since the
 * beginning — divorce means Family Law, probate means Estate Planning —
 * and until now only the admin form and the URL parser read it. The
 * search never did, so "divorce lawyer Tampa" matched nothing at all:
 * "divorce" is not one of the eight canonical area names, and the AND
 * gate dropped every Tampa family-law firm on that one token.
 *
 * Deriving rather than restating means the two cannot drift. Add an
 * alias for the admin form and the search learns it in the same commit.
 */
import { PRACTICE_AREA_ALIASES } from '@/lib/practice-areas'

/**
 * Words that appear in a canonical area name but say nothing about
 * which area it is.
 *
 * This guard is not optional. `business → Business Law` derives
 * naively to `business → ['business', 'law']`, and `law` is one of
 * `LAWYER_KIND_WORDS`, which every lawyer document carries. On the
 * portal's mixed index — clinics and attorneys together — typing
 * "business" would have matched the `kind` field of all 627 firms.
 */
const GENERIC_LEGAL_WORDS: ReadonlySet<string> = new Set(['law', 'legal'])

/** Lowercases and flattens punctuation, matching `fold` for these inputs. */
function words(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

function buildTokenExpansions(): Record<string, string[]> {
  const out: Record<string, string[]> = {}

  for (const [alias, area] of Object.entries(PRACTICE_AREA_ALIASES)) {
    const key = words(alias)
    // Multi-word aliases are phrases, not tokens; they are handled below.
    if (key.length !== 1) continue

    const target = words(area).filter((w) => !GENERIC_LEGAL_WORDS.has(w))

    /**
     * Nothing left but the word itself is a no-op, and shipping it as
     * one would be worse than useless: it is what `business → business`
     * and `civil → civil` reduce to once the generic words are gone.
     */
    const useful = target.filter((w) => w !== key[0])
    if (useful.length === 0) continue

    out[key[0]] = target
  }

  return out
}

function buildPhraseExpansions(): Record<string, string> {
  const out: Record<string, string> = {}

  for (const [alias, area] of Object.entries(PRACTICE_AREA_ALIASES)) {
    const key = words(alias)
    if (key.length < 2) continue

    const target = words(area).filter((w) => !GENERIC_LEGAL_WORDS.has(w))
    if (target.length === 0) continue

    const phrase = key.join(' ')
    const replacement = target.join(' ')
    if (phrase === replacement) continue
    out[phrase] = replacement
  }

  return out
}

export const LEGAL_TOKEN_EXPANSIONS: Readonly<Record<string, readonly string[]>> =
  buildTokenExpansions()

export const LEGAL_PHRASE_EXPANSIONS: Readonly<Record<string, string>> =
  buildPhraseExpansions()
