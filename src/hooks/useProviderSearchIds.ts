'use client'

import { useMemo } from 'react'
import {
  buildSearchIndex,
  search,
  toSearchDocs,
  type ClinicLike,
  type DocOptions,
  type LawyerLike,
} from '@/lib/search'

/**
 * `requireCoordinates: false` — the admin is the one person who must be able to
 * find a row that has no location yet, which is exactly the row every map
 * deliberately hides.
 *
 * `includeKindWords: false` — the page already decides the type, so matching
 * "clinic" against every clinic would select the whole table.
 */
const ADMIN_DOC_OPTIONS: DocOptions = {
  requireCoordinates: false,
  includeKindWords: false,
}

/**
 * The shared search core, shaped for the admin tables.
 *
 * Those tables already own their filtering: each one chains a handful of
 * dropdown filters and a free-text box inside one `Array.filter`. Returning the
 * matching ids rather than the matching rows lets the text box join that chain
 * as one more condition, which matters for two reasons:
 *
 *  - the table keeps the order the API sent, instead of being resorted by
 *    relevance every keystroke. An admin scanning an alphabetical list does not
 *    want it reshuffling underneath them.
 *  - the dropdown filters keep working exactly as before, because nothing about
 *    how they are applied changes.
 *
 * Returns `null` for a blank query, meaning "do not filter at all", which is
 * distinct from an empty Set, meaning "nothing matched".
 */
export function useProviderSearchIds(
  items: readonly ClinicLike[] | readonly LawyerLike[],
  query: string,
  type: 'clinic' | 'lawyer'
): Set<string> | null {
  const index = useMemo(() => {
    const docs =
      type === 'clinic'
        ? toSearchDocs(items as readonly ClinicLike[], [], ADMIN_DOC_OPTIONS)
        : toSearchDocs([], items as readonly LawyerLike[], ADMIN_DOC_OPTIONS)
    return buildSearchIndex(docs)
  }, [items, type])

  return useMemo(() => {
    if (!query.trim()) return null
    const ids = new Set<string>()
    search(index, query).hits.forEach((hit) => ids.add(hit.doc.id))
    return ids
  }, [index, query])
}
