import { createClient } from '@sanity/client'
import { createImageUrlBuilder } from '@sanity/image-url'
type SanityImageSource = Parameters<ReturnType<typeof createImageUrlBuilder>['image']>[0]

export const sanityClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || 'production',
  apiVersion: '2024-01-01',
  useCdn: true,
})

const builder = createImageUrlBuilder(sanityClient)

export function urlFor(source: SanityImageSource) {
  return builder.image(source)
}
