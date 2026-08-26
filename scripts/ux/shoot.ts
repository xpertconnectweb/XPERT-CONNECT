/**
 * Photographs the map, so a redesign can be judged instead of described.
 *
 *   npx tsx scripts/ux/shoot.ts --tag=before
 *   npx tsx scripts/ux/shoot.ts --tag=after --base=http://localhost:3000
 *   npx tsx scripts/ux/shoot.ts --tag=after --only=search,detail
 *
 * -- Why this exists ---------------------------------------------------------
 *
 * The Playwright suite runs with `reducedMotion: 'reduce'` and asserts roles
 * and testids. It is very good at "did this still work" and structurally blind
 * to "does this look finished" -- which is the entire question a visual
 * upgrade has to answer.
 *
 * This is not visual regression testing. There is no baseline and nothing
 * fails. It produces EVIDENCE: the same scripted set of states, at the same
 * two widths, before and after, so the two can be put side by side and
 * argued about.
 *
 * Motion is deliberately NOT reduced here, unlike the test suite: a transition
 * that only exists for sighted users is exactly the thing this is for.
 *
 * -- Sessions ----------------------------------------------------------------
 *
 * Reuses the role storage states the E2E setup bakes into `.auth/`. Those
 * cookies are issued for whatever host they were created against, so `--base`
 * must match the host of the auth file. Against a local server, re-bake first:
 *
 *   E2E_BASE_URL=http://localhost:3000 npx dotenv -e .env.test -- \
 *     npx playwright test --project=setup
 */
import { chromium, type Browser, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]

const BASE = (arg('base') ?? 'https://www.844xpert.com').replace(/\/$/, '')
const TAG = arg('tag') ?? 'shot'
const ROLE = arg('role') ?? 'lawyer'
const OUT = arg('out') ?? `docs/ux-shots/${TAG}`

/** The two widths the plan commits to supporting equally. */
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
] as const

type Shot = {
  name: string
  /** What a reviewer should be looking at. Printed, and worth writing well. */
  looking_for: string
  run: (page: Page, viewport: string) => Promise<void>
}

/** The map is dynamically imported and Leaflet paints late. */
async function waitForMap(page: Page) {
  await page.waitForSelector('[data-testid="map-shell"]', { timeout: 30_000 })
  await page.waitForSelector('.leaflet-tile-loaded', { timeout: 30_000 }).catch(() => {})
  // Tiles stream in; a short settle beats racing them.
  await page.waitForTimeout(1500)
}

const SHOTS: Shot[] = [
  {
    name: 'map',
    looking_for: 'First impression. Chrome density, where the eye lands, whether the controls feel placed or piled.',
    run: async () => {},
  },
  {
    name: 'search',
    looking_for: 'The dropdown with real suggestions: grouping, match highlighting, iconography, whether it reads as one list or three.',
    run: async (page) => {
      await page.getByTestId('map-search-input').click()
      await page.getByTestId('map-search-input').fill('ortho')
      await page.waitForTimeout(1200)
    },
  },
  {
    name: 'results',
    looking_for: 'The results panel at rest. Row rhythm, hierarchy, how much of a row is chrome versus content.',
    run: async (page, viewport) => {
      if (viewport === 'phone') {
        await page.getByTestId('map-panel-toggle').click().catch(() => {})
        await page.waitForTimeout(600)
      }
      await page.waitForSelector('[data-testid="map-panel-row"]', { timeout: 15_000 }).catch(() => {})
      await page.waitForTimeout(400)
    },
  },
  {
    name: 'selected',
    looking_for: 'A row selected and its marker highlighted. Whether the link between list and map is obvious without being told.',
    run: async (page, viewport) => {
      if (viewport === 'phone') {
        await page.getByTestId('map-panel-toggle').click().catch(() => {})
        await page.waitForTimeout(600)
      }
      const row = page.getByTestId('map-panel-row-focus').first()
      await row.click({ timeout: 10_000 }).catch(() => {})
      await page.waitForTimeout(900)
    },
  },
  {
    name: 'filters',
    looking_for: 'Every filter open at once. Whether the control stack still reads as one object at this height.',
    run: async (page, viewport) => {
      if (viewport === 'phone') {
        await page.getByTestId('map-filters-toggle').click().catch(() => {})
        await page.waitForTimeout(500)
      }
      await page.getByTestId('map-more-tags').click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(500)
    },
  },
  {
    name: 'empty',
    looking_for: 'The dead end. Whether it offers a way out or just says no.',
    run: async (page) => {
      await page.getByTestId('map-search-input').fill('qqqqzzzz')
      await page.waitForTimeout(1500)
    },
  },
]

async function shoot(browser: Browser, viewport: (typeof VIEWPORTS)[number]) {
  const context = await browser.newContext({
    storageState: `.auth/${ROLE}.json`,
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
    // NOT reduced, unlike the test suite. See the header.
    reducedMotion: 'no-preference',
  })

  const only = arg('only')?.split(',').map((s) => s.trim())

  for (const shot of SHOTS) {
    if (only && !only.includes(shot.name)) continue

    const page = await context.newPage()
    try {
      await page.goto(`${BASE}/professionals/map`, { waitUntil: 'domcontentloaded' })
      await waitForMap(page)
      await shot.run(page, viewport.name)

      const file = `${OUT}/${viewport.name}-${shot.name}.png`
      await page.screenshot({ path: file })
      console.log(`  ${`${viewport.name}/${shot.name}`.padEnd(20)} ${file}`)
    } catch (err) {
      console.log(
        `  ${`${viewport.name}/${shot.name}`.padEnd(20)} failed: ` +
          `${err instanceof Error ? err.message.split('\n')[0] : err}`
      )
    } finally {
      await page.close()
    }
  }

  await context.close()
}

async function main() {
  if (!existsSync(`.auth/${ROLE}.json`)) {
    console.error(
      `\n  No session at .auth/${ROLE}.json. Bake one:\n` +
        `    E2E_BASE_URL=${BASE} npx dotenv -e .env.test -- npx playwright test --project=setup\n`
    )
    process.exit(1)
  }

  await mkdir(OUT, { recursive: true })
  console.log(`\n  ${BASE}  as ${ROLE}  ->  ${OUT}\n`)

  const browser = await chromium.launch()
  try {
    for (const viewport of VIEWPORTS) await shoot(browser, viewport)
  } finally {
    await browser.close()
  }

  console.log('\n  What to look at in each:\n')
  for (const shot of SHOTS) console.log(`    ${shot.name.padEnd(10)} ${shot.looking_for}`)
  console.log('')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
