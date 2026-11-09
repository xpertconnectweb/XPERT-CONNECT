'use client'

import { useSearchParams } from 'next/navigation'
import { parseDirectoryUrlState } from '@/lib/search/directory-url-state'
import { BodyShopDirectory, type BodyShopDirectoryProps } from './BodyShopDirectory'

/**
 * Reads the query string for `/body-shops`, and nothing else; the page wraps
 * it in a <Suspense> boundary so the rest still prerenders. Same reasoning as
 * `DirectoryClient`.
 */
export function BodyShopDirectoryClient(props: Omit<BodyShopDirectoryProps, 'initialState'>) {
  const params = useSearchParams()
  return <BodyShopDirectory {...props} initialState={parseDirectoryUrlState(params)} />
}
