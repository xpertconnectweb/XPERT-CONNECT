/**
 * Reads each listed shop's own website and records the phone numbers on it.
 *
 *   npx tsx scripts/bodyshops/sitecheck.ts [--all]
 *
 * A review-site listing (Birdeye, Yahoo Local) shows a shop existed; it does
 * not show the phone still rings there. The shop's own site printing the same
 * number does. build.ts treats a match here as the shop's own confirmation.
 *
 * Only shops whose evidence is a directory listing are checked, unless --all.
 * Answers are cached in `data/bodyshops/sitecheck.json` by URL.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Shop } from './build'

const DIR = join(process.cwd(), 'data', 'bodyshops')
const CACHE = join(DIR, 'sitecheck.json')
const all = process.argv.includes('--all')

export interface SiteCheck {
  checkedAt: string
  status: number | 'error'
  /** Every ten-digit US number on the home page and, failing a match, the contact page. */
  phones: string[]
  /** Street numbers that appear next to a street word, for an address match. */
  text: string
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const DIRECTORY = /birdeye|yahoo|yelp|facebook|mapquest|google\.|bbb\.org|yellowpages|superpages/i

function phonesIn(html: string): string[] {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
  const found = new Set<string>()
  for (const m of Array.from(text.matchAll(/(?:tel:)?\+?1?[\s.(-]*(\d{3})[\s.)-]*(\d{3})[\s.-]*(\d{4})\b/g))) found.add(m[1] + m[2] + m[3])
  return Array.from(found)
}

async function get(url: string): Promise<{ status: number; html: string }> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(20000) })
  return { status: res.status, html: await res.text() }
}

async function check(url: string, want: string): Promise<SiteCheck> {
  try {
    const home = await get(url)
    let phones = phonesIn(home.html)
    let html = home.html
    if (!phones.includes(want)) {
      for (const path of ['/contact', '/contact-us', '/contact-us/', '/about']) {
        try {
          const page = await get(new URL(path, url).toString())
          if (page.status !== 200) continue
          phones = Array.from(new Set([...phones, ...phonesIn(page.html)]))
          html += ' ' + page.html
          if (phones.includes(want)) break
        } catch {
          // A missing contact page is normal.
        }
      }
    }
    const text = html
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 20000)
    return { checkedAt: new Date().toISOString(), status: home.status, phones, text }
  } catch {
    return { checkedAt: new Date().toISOString(), status: 'error', phones: [], text: '' }
  }
}

async function main(): Promise<void> {
  const shops = JSON.parse(readFileSync(join(DIR, 'bodyshops.json'), 'utf8')) as (Shop & { evidence?: string })[]
  const cache: Record<string, SiteCheck> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {}
  const todo = shops.filter(
    (s) =>
      s.website &&
      !DIRECTORY.test(s.website) &&
      !(s.website in cache) &&
      (all || (!s.sources.includes('chain') && !s.sources.includes('fdacs')))
  )
  console.log(`${todo.length} websites to read (${Object.keys(cache).length} cached).`)
  let done = 0
  const queue = [...todo]
  const worker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      cache[s.website] = await check(s.website, s.phone.replace(/\D/g, ''))
      if (++done % 25 === 0) {
        writeFileSync(CACHE, JSON.stringify(cache))
        console.log(`  ${done}/${todo.length}`)
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker))
  writeFileSync(CACHE, JSON.stringify(cache))
  const matched = todo.filter((s) => cache[s.website].phones.includes(s.phone.replace(/\D/g, ''))).length
  console.log(`Done: ${matched} of ${todo.length} sites print the listed phone.`)
}

main()
