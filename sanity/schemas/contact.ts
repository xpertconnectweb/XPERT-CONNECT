import { defineType, defineField } from 'sanity'

export default defineType({
  name: 'contact',
  title: 'Contact Section',
  type: 'document',
  fields: [
    defineField({ name: 'label', title: 'Section Label', type: 'string' }),
    defineField({ name: 'titleLine1', title: 'Title Line 1', type: 'string' }),
    defineField({ name: 'titleAccent', title: 'Title Accent (colored)', type: 'string' }),
    defineField({ name: 'description', title: 'Description', type: 'text', rows: 3 }),
    defineField({ name: 'disclaimer', title: 'Disclaimer', type: 'text', rows: 2 }),
    defineField({ name: 'formTitle', title: 'Form Title', type: 'string' }),
    defineField({ name: 'formDescription', title: 'Form Description', type: 'string' }),
    defineField({
      name: 'contactInfo',
      title: 'Contact Info Items',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({ name: 'label', title: 'Label', type: 'string' }),
            defineField({ name: 'value', title: 'Value', type: 'string' }),
            defineField({ name: 'href', title: 'Link (optional)', type: 'string' }),
            defineField({
              name: 'iconName',
              title: 'Icon Name (lucide)',
              type: 'string',
              description: 'e.g. Phone, Mail, Clock, MapPin',
            }),
          ],
        },
      ],
    }),
  ],
})
