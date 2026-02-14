import { defineType, defineField } from 'sanity'

export default defineType({
  name: 'about',
  title: 'About Section',
  type: 'document',
  fields: [
    defineField({ name: 'label', title: 'Section Label', type: 'string' }),
    defineField({ name: 'titleLine1', title: 'Title Line 1', type: 'string' }),
    defineField({ name: 'titleAccent', title: 'Title Accent (colored)', type: 'string' }),
    defineField({ name: 'paragraph1', title: 'Paragraph 1', type: 'text', rows: 4 }),
    defineField({ name: 'paragraph2', title: 'Paragraph 2', type: 'text', rows: 4 }),
    defineField({
      name: 'highlights',
      title: 'Highlights',
      type: 'array',
      of: [{ type: 'string' }],
    }),
    defineField({ name: 'disclaimer', title: 'Disclaimer', type: 'text', rows: 2 }),
    defineField({
      name: 'image',
      title: 'Image',
      type: 'image',
      options: { hotspot: true },
    }),
    defineField({
      name: 'stats',
      title: 'Statistics',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({ name: 'value', title: 'Value', type: 'number' }),
            defineField({ name: 'suffix', title: 'Suffix (+, %, etc.)', type: 'string' }),
            defineField({ name: 'label', title: 'Label', type: 'string' }),
            defineField({ name: 'abbreviateThousands', title: 'Abbreviate Thousands', type: 'boolean' }),
          ],
        },
      ],
    }),
  ],
})
