'use client'

import { useSearchParams } from 'next/navigation'
import { parseDirectoryUrlState } from '@/lib/search/directory-url-state'
import { PublicDirectory, type PublicDirectoryProps } from './PublicDirectory'

/**
 * Reads the query string for `/directory`, and nothing else.
 *
 * It exists to keep `useSearchParams` out of the page. Calling that in
 * the page — or in an unwrapped client child — opts the whole route out
 * of static rendering, which would cost `/directory` its `revalidate`
 * and its prerendered JSON-LD. Wrapped in a `<Suspense>` boundary by
 * the page, the banner, the server-rendered sample and the structured
 * data all still prerender; only this subtree waits.
 */
export function DirectoryClient(props: Omit<PublicDirectoryProps, 'initialState'>) {
  const params = useSearchParams()
  return <PublicDirectory {...props} initialState={parseDirectoryUrlState(params)} />
}
