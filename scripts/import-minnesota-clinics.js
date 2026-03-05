/**
 * Import Minnesota clinics from CSV → append to data/clinics.json
 *
 * Usage:  node scripts/import-minnesota-clinics.js
 */

const fs = require('fs')
const path = require('path')
const https = require('https')

// ── Paths ──────────────────────────────────────────────
const CSV_INPUT = path.join(__dirname, '..', 'Minnesota Clinics Final - Clinics.csv')
const OUTPUT = path.join(__dirname, '..', 'data', 'clinics.json')
const CACHE_FILE = path.join(__dirname, '..', 'data', 'geocode-cache.json')

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
    https.get(url, { headers: { 'User-Agent': 'XpertConnect-ClinicParser/3.0' } }, res => {
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

// ── Minnesota county → region mapping ──────────────────
const COUNTY_REGION_MAP = {
  // Twin Cities Metro
  'Hennepin': 'Twin Cities Metro',
  'Ramsey': 'Twin Cities Metro',
  'Dakota': 'Twin Cities Metro',
  'Scott': 'Twin Cities Metro',
  'Washington': 'Twin Cities Metro',
  'Anoka': 'Twin Cities Metro',
  'Carver': 'Twin Cities Metro',
  'Wright': 'Twin Cities Metro',
  'Sherburne': 'Twin Cities Metro',

  // Southeast Minnesota
  'Olmsted': 'Southeast Minnesota',
  'Winona': 'Southeast Minnesota',
  'Wabasha': 'Southeast Minnesota',
  'Fillmore': 'Southeast Minnesota',
  'Houston': 'Southeast Minnesota',
  'Goodhue': 'Southeast Minnesota',
  'Dodge': 'Southeast Minnesota',
  'Mower': 'Southeast Minnesota',
  'Freeborn': 'Southeast Minnesota',
  'Steele': 'Southeast Minnesota',
  'Rice': 'Southeast Minnesota',
  'Waseca': 'Southeast Minnesota',
  'Le Sueur': 'Southeast Minnesota',

  // South Central Minnesota
  'Blue Earth': 'South Central Minnesota',
  'Nicollet': 'South Central Minnesota',
  'Brown': 'South Central Minnesota',
  'Watonwan': 'South Central Minnesota',
  'Martin': 'South Central Minnesota',
  'Faribault': 'South Central Minnesota',
  'Jackson': 'South Central Minnesota',
  'Cottonwood': 'South Central Minnesota',
  'Murray': 'South Central Minnesota',

  // Southwest Minnesota
  'Lyon': 'Southwest Minnesota',
  'Redwood': 'Southwest Minnesota',
  'Yellow Medicine': 'Southwest Minnesota',
  'Lac qui Parle': 'Southwest Minnesota',
  'Lincoln': 'Southwest Minnesota',
  'Pipestone': 'Southwest Minnesota',
  'Rock': 'Southwest Minnesota',
  'Nobles': 'Southwest Minnesota',
  'Big Stone': 'Southwest Minnesota',
  'Chippewa': 'Southwest Minnesota',
  'Renville': 'Southwest Minnesota',
  'Swift': 'Southwest Minnesota',
  'Kandiyohi': 'Southwest Minnesota',
  'Traverse': 'Southwest Minnesota',

  // Central Minnesota
  'Stearns': 'Central Minnesota',
  'Benton': 'Central Minnesota',
  'Morrison': 'Central Minnesota',
  'Mille Lacs': 'Central Minnesota',
  'Kanabec': 'Central Minnesota',
  'Todd': 'Central Minnesota',

  // West Central Minnesota
  'Douglas': 'West Central Minnesota',
  'Otter Tail': 'West Central Minnesota',
  'Grant': 'West Central Minnesota',
  'Wilkin': 'West Central Minnesota',
  'Clay': 'West Central Minnesota',

  // Northwest Minnesota
  'Polk': 'Northwest Minnesota',
  'Norman': 'Northwest Minnesota',
  'Mahnomen': 'Northwest Minnesota',
  'Red Lake': 'Northwest Minnesota',
  'Pennington': 'Northwest Minnesota',
  'Marshall': 'Northwest Minnesota',
  'Kittson': 'Northwest Minnesota',
  'Roseau': 'Northwest Minnesota',
  'Lake of the Woods': 'Northwest Minnesota',

  // Northeast Minnesota
  'St. Louis': 'Northeast Minnesota',
  'Lake': 'Northeast Minnesota',
  'Cook': 'Northeast Minnesota',
  'Itasca': 'Northeast Minnesota',
  'Koochiching': 'Northeast Minnesota',
  'Carlton': 'Northeast Minnesota',
  'Crow Wing': 'Northeast Minnesota',
  'Cass': 'Northeast Minnesota',
  'Hubbard': 'Northeast Minnesota',
  'Beltrami': 'Northeast Minnesota',
  'Aitkin': 'Northeast Minnesota',
  'Clearwater': 'Northeast Minnesota',
  'Becker': 'Northeast Minnesota',
}

// ── Service type → specialties mapping ─────────────────
const SERVICE_KEYWORDS = [
  { pattern: /hospital\s+rehab/i, labels: ['Rehabilitation', 'Hospital Services'] },
  { pattern: /hospital.*therapy/i, labels: ['Physical Therapy', 'Hospital Services'] },
  { pattern: /hospital.*PT/i, labels: ['Physical Therapy', 'Hospital Services'] },
  { pattern: /outpatient\s+rehab/i, labels: ['Rehabilitation', 'Outpatient Therapy'] },
  { pattern: /outpatient.*therapy/i, labels: ['Physical Therapy', 'Outpatient Therapy'] },
  { pattern: /orthopedic/i, labels: ['Orthopedic Rehabilitation', 'Physical Therapy'] },
  { pattern: /sports?\s+medicine/i, labels: ['Sports Medicine'] },
  { pattern: /sports?\s+injur/i, labels: ['Sports Medicine', 'Rehabilitation'] },
  { pattern: /chiropract/i, labels: ['Chiropractic'] },
  { pattern: /massage/i, labels: ['Massage Therapy'] },
  { pattern: /physical\s+therap|PT\s+clinic/i, labels: ['Physical Therapy'] },
  { pattern: /rehab/i, labels: ['Rehabilitation'] },
  { pattern: /manual\s+therapy/i, labels: ['Manual Therapy', 'Physical Therapy'] },
  { pattern: /dry\s+needling/i, labels: ['Dry Needling'] },
  { pattern: /neuro/i, labels: ['Neurological Rehabilitation'] },
  { pattern: /work.?related/i, labels: ['Work Injury Rehabilitation'] },
  { pattern: /accident/i, labels: ['Auto Injuries'] },
  { pattern: /injury/i, labels: ['Injury Clinic'] },
]

function extractSpecialties(serviceType, clinicName) {
  const specs = new Set()
  const text = `${serviceType || ''} ${clinicName || ''}`

  for (const { pattern, labels } of SERVICE_KEYWORDS) {
    if (pattern.test(text)) {
      labels.forEach(l => specs.add(l))
    }
  }

  if (specs.size === 0) specs.add('General Medicine')
  return [...specs]
}

// ── CSV parser ─────────────────────────────────────────
function parseCSV(content) {
  const lines = content.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim())
  const records = []

  for (let i = 1; i < lines.length; i++) {
    // Handle fields that might contain commas (though this CSV seems clean)
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

// ── Main ───────────────────────────────────────────────
async function main() {
  console.log('📄 Reading Minnesota clinics CSV...')
  let csvContent = fs.readFileSync(CSV_INPUT, 'utf-8')
  if (csvContent.charCodeAt(0) === 0xFEFF) csvContent = csvContent.slice(1)

  const records = parseCSV(csvContent)
  console.log(`  Found ${records.length} records in CSV\n`)

  // Read existing clinics
  console.log('📋 Reading existing clinics.json...')
  const existingClinics = JSON.parse(fs.readFileSync(OUTPUT, 'utf-8'))
  console.log(`  Found ${existingClinics.length} existing clinics`)

  // Find the highest existing ID number
  let maxId = 0
  for (const c of existingClinics) {
    const match = c.id.match(/c-(\d+)/)
    if (match) maxId = Math.max(maxId, parseInt(match[1]))
  }
  console.log(`  Highest existing ID: c-${String(maxId).padStart(3, '0')}\n`)

  // Deduplicate Minnesota records by name + address + county
  const seen = new Set()
  const unique = []
  for (const r of records) {
    const streetAddr = r['Address'] || ''
    const city = r['City'] || ''
    const zip = r['ZIP'] || ''
    const county = r['County'] || ''

    // Build full address
    const addrParts = [streetAddr, city, `MN ${zip}`].filter(Boolean)
    const fullAddress = addrParts.join(', ').replace(/,\s*,/g, ',').replace(/,\s*$/, '')

    const key = `${(r['Clinic Name'] || '').toLowerCase().replace(/\s+/g, ' ')}|${fullAddress.toLowerCase().replace(/\s+/g, ' ')}|${county.toLowerCase()}`

    if (!seen.has(key)) {
      seen.add(key)
      unique.push({ ...r, fullAddress })
    }
  }
  console.log(`  ${unique.length} unique Minnesota clinics after dedup (removed ${records.length - unique.length} duplicates)\n`)

  // Also check for duplicates against existing clinics
  const existingKeys = new Set(
    existingClinics.map(c =>
      `${c.name.toLowerCase().replace(/\s+/g, ' ')}|${c.address.toLowerCase().replace(/\s+/g, ' ')}|${(c.county || '').toLowerCase()}`
    )
  )

  const newClinics = unique.filter(r => {
    const key = `${(r['Clinic Name'] || '').toLowerCase().replace(/\s+/g, ' ')}|${r.fullAddress.toLowerCase().replace(/\s+/g, ' ')}|${(r['County'] || '').toLowerCase()}`
    return !existingKeys.has(key)
  })

  if (newClinics.length < unique.length) {
    console.log(`  ⚠️  ${unique.length - newClinics.length} clinics already exist in clinics.json, skipping them`)
  }
  console.log(`  ${newClinics.length} new clinics to add\n`)

  // Geocode and build clinic objects
  console.log('🌍 Geocoding addresses...')
  const results = []
  let geocoded = 0, failed = 0, cached = 0

  for (let i = 0; i < newClinics.length; i++) {
    const r = newClinics[i]
    const clinicName = r['Clinic Name'] || ''
    const county = r['County'] || ''
    const serviceType = r['Service Type'] || ''
    const phone = r['Phone'] || ''

    const wasCached = !!geocodeCache[r.fullAddress]
    const coords = await geocode(r.fullAddress)

    if (wasCached) cached++
    else await sleep(1100) // Nominatim rate limit

    const specialties = extractSpecialties(serviceType, clinicName)
    const region = COUNTY_REGION_MAP[county] || 'Minnesota'

    if (coords) {
      geocoded++
    } else {
      failed++
      console.error(`  FAILED: "${clinicName}" @ "${r.fullAddress}"`)
    }

    const newId = maxId + i + 1

    results.push({
      id: `c-${String(newId).padStart(3, '0')}`,
      name: clinicName,
      address: r.fullAddress,
      lat: coords ? coords.lat : 0,
      lng: coords ? coords.lng : 0,
      phone: phone,
      specialties,
      email: '',
      website: '',
      region,
      county,
      available: true,
    })

    const pct = Math.round(((i + 1) / newClinics.length) * 100)
    process.stdout.write(`\r  Progress: ${i + 1}/${newClinics.length} (${pct}%) | OK: ${geocoded} | FAIL: ${failed} | cached: ${cached}`)
  }

  console.log('\n')
  console.log(`Done geocoding! ${geocoded} geocoded, ${failed} failed, ${cached} from cache\n`)

  // Combine existing + new clinics
  const allClinics = [...existingClinics, ...results]
  fs.writeFileSync(OUTPUT, JSON.stringify(allClinics, null, 2), 'utf-8')
  console.log(`✅ Written ${allClinics.length} total clinics to ${OUTPUT}`)
  console.log(`   (${existingClinics.length} existing + ${results.length} new Minnesota clinics)\n`)

  // Print Minnesota region summary
  console.log('📍 Minnesota clinics by region:')
  const regionCounts = results.reduce((acc, clinic) => {
    const region = clinic.region || 'Unknown'
    acc[region] = (acc[region] || 0) + 1
    return acc
  }, {})

  Object.entries(regionCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([region, count]) => {
      console.log(`  • ${region}: ${count} clinics`)
    })

  // Print failures summary
  const failures = results.filter(c => c.lat === 0 && c.lng === 0)
  if (failures.length > 0) {
    console.log(`\n⚠️  ${failures.length} clinics with no coordinates (will not appear on map):`)
    failures.forEach(c => console.log(`  - ${c.name} (${c.address})`))
  }

  console.log('\n🎉 Minnesota clinics import complete!')
  console.log('   Next step: run "npx ts-node scripts/restore-clinics.ts" to push to Supabase')
}

main().catch(console.error)
