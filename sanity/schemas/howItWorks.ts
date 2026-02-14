import { defineType, defineField } from 'sanity'

export default defineType({
  name: 'howItWorks',
  title: 'How It Works Section',
  type: 'document',
  fields: [
    defineField({ name: 'label', title: 'Section Label', type: 'string' }),
    defineField({ name: 'titleLine1', title: 'Title Line 1', type: 'string' }),
    defineField({ name: 'titleAccent', title: 'Title Accent (colored)', type: 'string' }),
    defineField({ name: 'description', title: 'Description', type: 'text', rows: 3 }),
    defineField({
      name: 'steps',
      title: 'Steps',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({ name: 'number', title: 'Step Number (01, 02, etc.)', type: 'string' }),
            defineField({ name: 'title', title: 'Title', type: 'string' }),
            defineField({ name: 'description', title: 'Description', type: 'text' }),
            defineField({
              name: 'iconName',
              title: 'Icon Name (lucide)',
              type: 'string',
              description: 'e.g. ShieldCheck, ClipboardList, UserCheck, Handshake',
            }),
          ],
        },
      ],
    }),
    defineField({ name: 'ctaText', title: 'CTA Text', type: 'string' }),
  ],
})
