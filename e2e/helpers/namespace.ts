import type { TestInfo } from '@playwright/test'

export function basePrefix(): string {
  return process.env.E2E_NAMESPACE_PREFIX ?? `e2e-${Date.now()}-`
}

export function makeNamespace(testInfo: TestInfo): string {
  const slug = testInfo.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return `${basePrefix()}${slug}-`
}

export function rand(len = 6): string {
  return Math.random().toString(36).slice(2, 2 + len)
}
