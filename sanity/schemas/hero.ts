import { defineType, defineField } from 'sanity'

export default defineType({
  name: 'hero',
  title: 'Hero Section',
  type: 'document',
  fields: [
    defineField({ name: 'badge', title: 'Badge Text', type: 'string' }),
    defineField({ name: 'headlineLine1', title: 'Headline Line 1', type: 'string' }),
    defineField({ name: 'headlineAccent', title: 'Headline Accent (colored)', type: 'string' }),
    defineField({ name: 'headlineLine3', title: 'Headline Line 3', type: 'string' }),
    defineField({ name: 'subtitle', title: 'Subtitle', type: 'text', rows: 2 }),
    defineField({ name: 'disclaimer', title: 'Disclaimer', type: 'text', rows: 2 }),
    defineField({ name: 'ctaPrimaryText', title: 'Primary CTA Text', type: 'string' }),
    defineField({ name: 'ctaPrimaryHref', title: 'Primary CTA Link', type: 'string' }),
    defineField({ name: 'ctaSecondaryText', title: 'Secondary CTA Text', type: 'string' }),
    defineField({ name: 'ctaSecondaryHref', title: 'Secondary CTA Link', type: 'string' }),
    defineField({
      name: 'backgroundImage',
      title: 'Background Image',
      type: 'image',
      options: { hotspot: true },
    }),
    defineField({
      name: 'trustBadges',
      title: 'Trust Badges',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [defineField({ name: 'text', title: 'Text', type: 'string' })],
        },
      ],
    }),
  ],
})
