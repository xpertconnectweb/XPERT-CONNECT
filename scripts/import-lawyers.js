/**
 * Import Florida lawyers from BD Abogados CSVs → data/lawyers.json
 *
 * Reads ALL 7 CSVs, merges practiceAreas across specialty files,
 * geocodes addresses, and outputs the consolidated list.
 *
 * Usage:  node scripts/import-lawyers.js
 */

const fs = require('fs')
const path = require('path')
const https = require('https')

// ── Paths ──────────────────────────────────────────────
const BD_DIR = path.join(__dirname, '..', 'BD Abogados')
const OUTPUT = path.join(__dirname, '..', 'data', 'lawyers.json')
const CACHE_FILE = path.join(__dirname, '..', 'data', 'geocode-cache.json')

// ── CSV files and their specialty category ─────────────
const CSV_FILES = [
  { file: 'BASE DE DATOS ABOGADOS  FLORIDA - Consolidado Florida.csv', category: null },
  { file: 'BASE DE DATOS ABOGADOS  FLORIDA - BUSINESS LAW .csv', category: 'Business Law' },
  { file: 'BASE DE DATOS ABOGADOS  FLORIDA - CRIMINAL DEFENSE.csv', category: 'Criminal Defense' },
  { file: 'BASE DE DATOS ABOGADOS  FLORIDA - Estate Planning.csv', category: 'Estate Planning' },
  { file: 'BASE DE DATOS ABOGADOS  FLORIDA - FAMILY LAW .csv', category: 'Family Law' },
  { file: 'BASE DE DATOS ABOGADOS  FLORIDA - iMMIGRATION .csv', category: 'Immigration' },
  { file: 'BASE DE DATOS ABOGADOS  FLORIDA - PERSONAL INJURY.csv', category: 'Personal Injury' },
]

// ── Geocode cache ──────────────────────────────────────
let geocodeCache = {}
if (fs.existsSync(CACHE_FILE)) {
  try { geocodeCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')) } catch { /* fresh */ }
}
function saveCache() {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(geocodeCache, null, 2), 'utf-8')
}

// ── Helpers ────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'XpertConnect-LawyerParser/1.0' } }, res => {
      let data = ''
      res.on('data', chunk => (data += chunk))
      res.on('end', () => resolve(data))
      res.on('error', reject)
    }).on('error', reject)
  })
}

async function geocode(address) {
  if (geocodeCache[address]) return geocodeCache[address]

  const q = encodeURIComponent(address)
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=1&countrycodes=us`

  try {
    const raw = await fetchUrl(url)
    const results = JSON.parse(raw)
    if (results.length > 0) {
      const coords = { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) }
      geocodeCache[address] = coords
      saveCache()
      return coords
    }
  } catch (err) {
    console.error(`  Warning: geocode error for "${address}": ${err.message}`)
  }

  // Fallback: try city + state + ZIP only
  const parts = address.split(',').map(p => p.trim())
  if (parts.length > 1) {
    try {
      await sleep(1100)
      const fallback = parts.slice(1).join(', ')
      const q2 = encodeURIComponent(fallback)
      const raw2 = await fetchUrl(`https://nominatim.openstreetmap.org/search?format=json&q=${q2}&limit=1&countrycodes=us`)
      const r2 = JSON.parse(raw2)
      if (r2.length > 0) {
        const coords = { lat: parseFloat(r2[0].lat), lng: parseFloat(r2[0].lon) }
        geocodeCache[address] = coords
        saveCache()
        return coords
      }
    } catch { /* ignore */ }
  }

  geocodeCache[address] = null
  saveCache()
  return null
}

// ── CSV parser ─────────────────────────────────────────
function parseCSV(content) {
  const lines = content.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim())
  const records = []

  for (let i = 1; i < lines.length; i++) {
    const values = []
    let current = ''
    let inQuotes = false

    for (const char of lines[i]) {
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    values.push(current.trim())

    if (values.length >= headers.length) {
      const record = {}
      headers.forEach((h, idx) => { record[h] = values[idx] || '' })
      records.push(record)
    }
  }

  return records
}

// Normalize name for dedup key
function normalizeName(name) {
  return (name || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// Normalize address for dedup key
function normalizeAddr(addr) {
  return (addr || '').toLowerCase().replace(/\s+/g, ' ').replace(/[,.\-#]/g, '').trim()
}

// Check if a row is a section header (e.g. "ORANGE COUNTY — ZIP: ...", or emoji rows)
function isSectionRow(record) {
  const county = (record['Condado'] || '').trim()
  const name = (record['Abogado/firma'] || record['Abogado/firma '] || '').trim()
  const address = (record['Dirección'] || record['Dirección '] || '').trim()

  // No name = section row
  if (!name) return true
  // No address = section row
  if (!address) return true
  // Starts with emoji or special marker
  if (/^[\u{1F000}-\u{1FFFF}]/u.test(county)) return true
  // Contains "—" in county field (like "ORANGE COUNTY — ZIP: ...")
  if (county.includes('—')) return true

  return false
}

// Get value from record with flexible header names (handles trailing spaces)
function getField(record, ...keys) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== '') return record[key].trim()
    // Try with trailing space
    if (record[key + ' '] !== undefined && record[key + ' '] !== '') return record[key + ' '].trim()
  }
  return ''
}

// ── Main ───────────────────────────────────────────────
async function main() {
  console.log('⚖️  Importing Florida lawyers from BD Abogados CSVs...\n')

  // Map to collect all lawyers: key → { ...data, practiceAreas: Set }
  const lawyerMap = new Map()

  for (const { file, category } of CSV_FILES) {
    const csvPath = path.join(BD_DIR, file)
    if (!fs.existsSync(csvPath)) {
      console.warn(`  ⚠️  File not found: ${file}`)
      continue
    }

    let content = fs.readFileSync(csvPath, 'utf-8')
    if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1)

    const records = parseCSV(content)
    let validCount = 0

    for (const record of records) {
      if (isSectionRow(record)) continue

      const name = getField(record, 'Abogado/firma')
      const address = getField(record, 'Dirección')
      const county = getField(record, 'Condado')
      const zip = getField(record, 'ZIP Code')
      const phone = getField(record, 'Telefono')
      const specialty = getField(record, 'Especialidad')
      const region = getField(record, 'Region')

      if (!name || !address) continue

      // Build full address: if no "FL" in address, append it with ZIP
      let fullAddress = address
      if (!fullAddress.includes(', FL')) {
        fullAddress = `${address}, FL`
      }
      if (zip && !fullAddress.includes(zip)) {
        fullAddress = `${fullAddress} ${zip}`
      }

      const key = `${normalizeName(name)}|${normalizeAddr(fullAddress)}`

      if (lawyerMap.has(key)) {
        // Merge practice areas
        const existing = lawyerMap.get(key)
        const area = category || specialty
        if (area) existing.practiceAreas.add(area)
      } else {
        const practiceAreas = new Set()
        const area = category || specialty
        if (area) practiceAreas.add(area)

        lawyerMap.set(key, {
          name,
          address: fullAddress,
          county,
          zip,
          phone,
          region,
          practiceAreas,
        })
        validCount++
      }
    }

    console.log(`  ${file.replace('BASE DE DATOS ABOGADOS  FLORIDA - ', '')}`)
    console.log(`    ${records.length} rows → ${validCount} new unique lawyers`)
  }

  const allLawyers = Array.from(lawyerMap.values())
  console.log(`\n📋 Total unique lawyers: ${allLawyers.length}\n`)

  // Geocode
  console.log('🌍 Geocoding addresses...')
  const results = []
  let geocodedOk = 0, failed = 0, cached = 0

  for (let i = 0; i < allLawyers.length; i++) {
    const l = allLawyers[i]

    const wasCached = !!geocodeCache[l.address]
    const coords = await geocode(l.address)

    if (wasCached) cached++
    else await sleep(1100) // Nominatim rate limit

    if (coords) {
      geocodedOk++
    } else {
      failed++
      console.error(`  FAILED: "${l.name}" @ "${l.address}"`)
    }

    const id = `l-${String(i + 1).padStart(3, '0')}`

    results.push({
      id,
      name: l.name,
      address: l.address,
      lat: coords ? coords.lat : 0,
      lng: coords ? coords.lng : 0,
      phone: l.phone,
      practiceAreas: Array.from(l.practiceAreas).sort(),
      email: '',
      website: '',
      region: l.region || '',
      county: l.county || '',
      zipCode: l.zip || '',
      available: true,
    })

    const pct = Math.round(((i + 1) / allLawyers.length) * 100)
    process.stdout.write(`\r  Progress: ${i + 1}/${allLawyers.length} (${pct}%) | OK: ${geocodedOk} | FAIL: ${failed} | cached: ${cached}`)
  }

  console.log('\n')
  console.log(`Done geocoding! ${geocodedOk} OK, ${failed} failed, ${cached} from cache\n`)

  // Write output
  fs.writeFileSync(OUTPUT, JSON.stringify(results, null, 2), 'utf-8')
  console.log(`✅ Written ${results.length} lawyers to ${OUTPUT}`)

  // Print region summary
  console.log('\n📍 Lawyers by region:')
  const regionCounts = results.reduce((acc, lawyer) => {
    const region = lawyer.region || 'Unknown'
    acc[region] = (acc[region] || 0) + 1
    return acc
  }, {})

  Object.entries(regionCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([region, count]) => {
      console.log(`  • ${region}: ${count}`)
    })

  // Print practice area summary
  console.log('\n⚖️  Lawyers by practice area:')
  const areaCounts = {}
  results.forEach(l => l.practiceAreas.forEach(a => { areaCounts[a] = (areaCounts[a] || 0) + 1 }))
  Object.entries(areaCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([area, count]) => {
      console.log(`  • ${area}: ${count}`)
    })

  // Failures
  const failures = results.filter(l => l.lat === 0 && l.lng === 0)
  if (failures.length > 0) {
    console.log(`\n⚠️  ${failures.length} lawyers with no coordinates:`)
    failures.forEach(l => console.log(`  - ${l.name} (${l.address})`))
  }

  console.log('\n🎉 Lawyer import complete!')
  console.log('   Next step: run "npx tsx scripts/restore-lawyers.ts" to push to Supabase')
}

main().catch(console.error)
