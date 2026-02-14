import { defineType, defineField } from 'sanity'

export default defineType({
  name: 'services',
  title: 'Services Section',
  type: 'document',
  fields: [
    defineField({ name: 'label', title: 'Section Label', type: 'string' }),
    defineField({ name: 'titleLine1', title: 'Title Line 1', type: 'string' }),
    defineField({ name: 'titleAccent', title: 'Title Accent (colored)', type: 'string' }),
    defineField({ name: 'description', title: 'Description', type: 'text', rows: 3 }),
    defineField({
      name: 'services',
      title: 'Services',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({ name: 'title', title: 'Title', type: 'string' }),
            defineField({ name: 'subtitle', title: 'Subtitle', type: 'string' }),
            defineField({ name: 'description', title: 'Description', type: 'text' }),
            defineField({
              name: 'features',
              title: 'Features',
              type: 'array',
              of: [{ type: 'string' }],
            }),
            defineField({ name: 'cta', title: 'CTA Text', type: 'string' }),
            defineField({
              name: 'color',
              title: 'Color',
              type: 'string',
              options: { list: ['navy', 'gold'] },
            }),
            defineField({ name: 'featured', title: 'Featured', type: 'boolean' }),
            defineField({
              name: 'iconName',
              title: 'Icon Name (lucide)',
              type: 'string',
              description: 'e.g. Scale, Hospital, Home',
            }),
          ],
        },
      ],
    }),
  ],
})
