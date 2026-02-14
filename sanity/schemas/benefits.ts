import { defineType, defineField } from 'sanity'

const benefitFields = [
  defineField({ name: 'title', title: 'Title', type: 'string' }),
  defineField({ name: 'description', title: 'Description', type: 'text' }),
  defineField({
    name: 'iconName',
    title: 'Icon Name (lucide)',
    type: 'string',
    description: 'e.g. Shield, Zap, Star, User, TrendingUp, Briefcase, Award',
  }),
]

export default defineType({
  name: 'benefits',
  title: 'Benefits Section',
  type: 'document',
  fields: [
    defineField({ name: 'label', title: 'Section Label', type: 'string' }),
    defineField({ name: 'titleLine1', title: 'Title Line 1', type: 'string' }),
    defineField({ name: 'titleAccent', title: 'Title Accent (colored)', type: 'string' }),
    defineField({ name: 'description', title: 'Description', type: 'text', rows: 3 }),
    defineField({
      name: 'individualBenefits',
      title: 'Individual Benefits',
      type: 'array',
      of: [{ type: 'object', fields: benefitFields }],
    }),
    defineField({
      name: 'professionalBenefits',
      title: 'Professional Benefits',
      type: 'array',
      of: [{ type: 'object', fields: benefitFields }],
    }),
  ],
})
