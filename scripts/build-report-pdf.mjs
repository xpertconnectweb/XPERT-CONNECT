/**
 * Renders an HTML report to a real PDF, beside it.
 *
 *   npm run report:pdf docs/mi-informe.html
 *   node scripts/build-report-pdf.mjs docs/mi-informe.html
 *
 * The path is REQUIRED. It used to default to
 * `docs/informe-buscador-direcciones.html`, which was deleted: the deliverable
 * for these reports is the PDF, and that file was only ever the print template
 * behind one of them. A default pointing at a file that no longer exists would
 * turn a forgotten argument into a confusing "Not found".
 *
 * The HTML is a source, not an output. Write it self-contained — its own
 * `@page` rules, its own page-break hints, no external assets — so it prints
 * identically wherever it is opened.
 *
 * Uses the Chromium that Playwright already manages, so there is no new
 * dependency — but the browser binary is downloaded separately from the npm
 * package, and on a machine that has only ever run E2E in CI it will be
 * missing. If this fails with "Executable doesn't exist", run:
 *
 *   npx playwright install chromium
 *
 * There is also a zero-dependency route that needs none of this: open the HTML
 * in any browser and print to PDF. Same output, given the rules above.
 */
import { chromium } from 'playwright-core'
import { pathToFileURL } from 'node:url'
import { resolve, dirname, basename, join } from 'node:path'
import { existsSync } from 'node:fs'

if (!process.argv[2]) {
  console.error('Usage: npm run report:pdf <ruta/al/informe.html>')
  process.exit(1)
}

const input = resolve(process.argv[2])

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
