/**
 * Renders `docs/informe-buscador-direcciones.html` to a real PDF.
 *
 * Uses the Chromium that Playwright already manages, so there is no new
 * dependency — but the browser binary is downloaded separately from the npm
 * package, and on a machine that has only ever run E2E in CI it will be
 * missing. If this fails with "Executable doesn't exist", run:
 *
 *   npx playwright install chromium
 *
 * There is also a zero-dependency route that needs none of this: open the HTML
 * file in any browser and print to PDF. The page carries its own `@page` rules
 * and page-break hints, so the output is the same.
 *
 *   npm run report:pdf
 *   node scripts/build-report-pdf.mjs docs/otro-informe.html
 */
import { chromium } from 'playwright-core'
import { pathToFileURL } from 'node:url'
import { resolve, dirname, basename, join } from 'node:path'
import { existsSync } from 'node:fs'

const input = resolve(process.argv[2] ?? 'docs/informe-buscador-direcciones.html')

if (!existsSync(input)) {
  console.error(`Not found: ${input}`)
  process.exit(1)
}

const output = join(dirname(input), `${basename(input, '.html')}.pdf`)

const browser = await chromium.launch()
try {
  const page = await browser.newPage()

  // `file://` rather than a served URL: the report is deliberately
  // self-contained — no external stylesheet, no web font, no image host — so it
  // renders identically offline and cannot break because a CDN moved.
  await page.goto(pathToFileURL(input).href, { waitUntil: 'load' })

  await page.pdf({
    path: output,
    // Letter, matching "Xpert Connect - Avisos por SMS". `preferCSSPageSize`
    // means the stylesheet's `@page` wins anyway; this is the fallback and the
    // statement of intent.
    format: 'Letter',
    // The page defines its own @page margins; overriding them here would double
    // up and reflow every page break the document places by hand.
    preferCSSPageSize: true,
    // Without this the navy rules, the gold accent bar and the KPI card
    // backgrounds all print white — Chromium drops backgrounds by default.
    printBackground: true,
  })

  console.log(`✓ ${output}`)
} finally {
  await browser.close()
}
