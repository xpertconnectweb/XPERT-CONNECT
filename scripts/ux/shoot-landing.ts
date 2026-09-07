/**
 * Photographs the public landing page, so a redesign can be judged instead of
 * described.
 *
 *   npx tsx scripts/ux/shoot-landing.ts --tag=landing-antes --base=http://localhost:3000
 *   npx tsx scripts/ux/shoot-landing.ts --tag=landing-despues
 *   npx tsx scripts/ux/shoot-landing.ts --tag=x --only=hero,services
 *
 * -- Why this is a sibling of shoot.ts, not a mode inside it -----------------
 *
 * That script is the same idea for the authenticated map, and it is welded to
 * it: it gates on a baked session in `.auth/`, always navigates to
 * /professionals/map, and waits on Leaflet tiles. None of that applies here —
 * the landing page is public, so the honest version of this tool carries no
 * session at all, which is also the only way to photograph what a stranger
 * actually sees.
 *
 * Everything else is deliberately identical: the same two committed viewports,
 * the same `--tag` output convention under docs/ux-shots/, the same
 * `looking_for` rubric printed at the end, and motion left ON — a transition
 * that only exists for sighted users is exactly the thing this is for.
 *
 * This is not visual regression testing. Nothing fails. It produces EVIDENCE:
 * the same scripted states, at the same widths, before and after.
 */
import { chromium, type Browser, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]

const BASE = (arg('base') ?? 'http://localhost:3000').replace(/\/$/, '')
const TAG = arg('tag') ?? 'landing'
const OUT = arg('out') ?? `docs/ux-shots/${TAG}`

/** The two widths the plan commits to supporting equally. Same as shoot.ts. */
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
] as const

type Shot = {
  name: string
  /** What a reviewer should be looking at. Printed, and worth writing well. */
  looking_for: string
  /** The section to frame. Omit for a whole-page shot. */
  anchor?: string
  path?: string
  fullPage?: boolean
  run?: (page: Page, viewport: string) => Promise<void>
}

const SHOTS: Shot[] = [
  {
    name: 'rhythm',
    looking_for:
      'The whole page at once, which is the only way to see the real problem: whether every band is the same height and weight, or whether the page has a pulse. Look at it squinting.',
    fullPage: true,
  },
  {
    name: 'hero',
    looking_for:
      'First impression, above the fold. Where the eye lands first, whether the headline has one voice or three, and whether the photograph is doing any work at all.',
    anchor: '#hero',
  },
  {
    name: 'header-scrolled',
    looking_for:
      'The sticky bar once it turns solid. Logo legibility at its real size, nav contrast, and whether the gold call-to-actions compete with each other.',
    anchor: '#about',
    run: async (page) => {
      await page.evaluate(() => window.scrollBy({ top: 40 }))
      await page.waitForTimeout(600)
    },
  },
  {
    name: 'directory',
    looking_for:
      'The lawyers directory block. It is the only section anybody designed on purpose — afterwards it should read as the same family as everything above and below it, not as the exception.',
    anchor: '#directory',
  },
  {
    name: 'about',
    looking_for:
      'The two-column split. Whether the columns share a baseline or float as two boxes on a shelf, and whether the imagery says anything true about the business.',
    anchor: '#about',
  },
  {
    name: 'services',
    looking_for:
      'Three services. Whether they read as a hierarchy — legal is the lead business — or as three interchangeable cards of identical mass.',
    anchor: '#services',
  },
  {
    name: 'how-it-works',
    looking_for:
      'The four-step process on navy. Whether the steps read as a sequence you can follow, and whether the numbers are structure or decoration.',
    anchor: '#how-it-works',
  },
  {
    name: 'benefits',
    looking_for:
      'Two audiences side by side. Whether this is an editorial spread or a Rorschach blot — two mirrored cards with only the hue swapped.',
    anchor: '#benefits',
  },
  {
    name: 'contact',
    looking_for:
      'The form, which is the conversion. Whether it carries more weight than the four info boxes beside it, and whether the heading still repeats the hero.',
    anchor: '#contact',
  },
  {
    name: 'directory-page',
    looking_for:
      'The standalone /directory page. Density of a real data surface: row rhythm, and how much of a row is chrome rather than content.',
    path: '/directory',
    run: async (page) => {
      await page.waitForTimeout(2500)
      await page.evaluate(() => window.scrollBy({ top: 560 }))
      await page.waitForTimeout(1200)
    },
  },
]

/**
 * Fonts and the hero image paint late, and a screenshot that catches a
 * fallback face is worse than useless for judging typography.
 */
async function settle(page: Page) {
  await page.waitForLoadState('domcontentloaded')
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {})
  await page.waitForTimeout(2500)
}

async function frame(page: Page, anchor: string) {
  const el = await page.$(anchor)
  if (!el) return false
  await page.evaluate((sel) => {
    const node = document.querySelector(sel)
    if (!node) return
    // Land just above the section rather than on it: the fixed header would
    // otherwise sit on top of the first thing worth looking at.
    const top = node.getBoundingClientRect().top + window.scrollY - 64
    window.scrollTo(0, top)
  }, anchor)
  await page.waitForTimeout(1200)
  return true
}

async function shoot(browser: Browser, viewport: (typeof VIEWPORTS)[number]) {
  const only = arg('only')?.split(',').map((s) => s.trim())

  for (const shot of SHOTS) {
    if (only && !only.includes(shot.name)) continue

    // A full-page shot of a 10,000px page at 2x is a 30 MB file nobody opens.
    // The rhythm shot trades resolution for being openable; every other shot
    // keeps 2x, because the whole point of them is judging type.
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: shot.fullPage ? 1 : 2,
      reducedMotion: 'no-preference',
    })
    const page = await context.newPage()

    try {
      await page.goto(`${BASE}${shot.path ?? '/'}`, {
        waitUntil: 'domcontentloaded',
        timeout: 120_000,
      })
      await settle(page)

      if (shot.anchor) {
        const found = await frame(page, shot.anchor)
        if (!found) throw new Error(`no element matching ${shot.anchor}`)
      }
      if (shot.run) await shot.run(page, viewport.name)

      const file = `${OUT}/${viewport.name}-${shot.name}.png`
      await page.screenshot({ path: file, fullPage: shot.fullPage ?? false })
      console.log(`  ${`${viewport.name}/${shot.name}`.padEnd(24)} ${file}`)
    } catch (err) {
      console.log(
        `  ${`${viewport.name}/${shot.name}`.padEnd(24)} failed: ` +
          `${err instanceof Error ? err.message.split('\n')[0] : err}`
      )
    } finally {
      await page.close()
      await context.close()
    }
  }
}

async function main() {
  await mkdir(OUT, { recursive: true })
  console.log(`\n  ${BASE}  (no session, as a stranger sees it)  ->  ${OUT}\n`)

  const browser = await chromium.launch()
  try {
    for (const viewport of VIEWPORTS) await shoot(browser, viewport)
  } finally {
    await browser.close()
  }

  console.log('\n  What to look at in each:\n')
  for (const shot of SHOTS) console.log(`    ${shot.name.padEnd(16)} ${shot.looking_for}`)
  console.log('')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
