import { createClient, type SanityClient } from '@sanity/client'
import { createImageUrlBuilder } from '@sanity/image-url'
type SanityImageSource = Parameters<ReturnType<typeof createImageUrlBuilder>['image']>[0]

let _sanityClient: SanityClient | null = null

export function getSanityClient(): SanityClient {
  if (!_sanityClient) {
    _sanityClient = createClient({
      projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
      dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || 'production',
      apiVersion: '2024-01-01',
      useCdn: true,
    })
  }
  return _sanityClient
}

// Keep backward-compatible export via proxy
export const sanityClient = new Proxy({} as SanityClient, {
  get(_target, prop) {
    return (getSanityClient() as any)[prop]
  },
})

export function urlFor(source: SanityImageSource) {
  const builder = createImageUrlBuilder(getSanityClient())
  return builder.image(source)
}
