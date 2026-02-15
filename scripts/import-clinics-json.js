/**
 * Import clinics from Listado_Clinicas.md (JSON format) → data/clinics.json + Supabase
 *
 * Usage:  node scripts/import-clinics-json.js
 */

const fs = require('fs')
const path = require('path')
const https = require('https')

// ── Paths ──────────────────────────────────────────────
const INPUT = path.join(__dirname, '..', 'Listado_Clinicas.md')
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
  const zipMatch = address.match(/,\s*FL\s+(\d{5})/)
  if (zipMatch) {
    try {
      await sleep(1100)
      const fallback = address.split(',').slice(1).join(',').trim()
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

// ── Specialty mapping ──────────────────────────────────
const TYPE_MAP = {
  'quiropráctica': ['Chiropractic'],
  'quiropráctica + pt': ['Chiropractic', 'Physical Therapy'],
  'quiropráctica + rehab': ['Chiropractic', 'Rehabilitation'],
  'clínica de lesiones': ['Injury Clinic', 'Auto Injuries'],
  'clínica médica': ['Medical Clinic'],
  'terapia física': ['Physical Therapy'],
  'manejo del dolor': ['Pain Management'],
}

const NOTE_KEYWORDS = [
  { pattern: /auto.?accident|auto.?injur|accidente|car.?accident|choques|mva|motor vehicle/i, label: 'Auto Injuries' },
  { pattern: /whiplash|latigazo/i, label: 'Whiplash Treatment' },
  { pattern: /rehabilitaci[oó]n|rehab/i, label: 'Rehabilitation' },
  { pattern: /dolor|pain/i, label: 'Pain Management' },
  { pattern: /pip/i, label: 'PIP Claims' },
  { pattern: /spine|espinal|espalda|columna|cuello/i, label: 'Spine' },
  { pattern: /sport|deport/i, label: 'Sports Medicine' },
  { pattern: /abogado|attorney|seguro|insurance/i, label: 'Attorney Lien' },
]

function extractSpecialties(type, notes, clinicName) {
  const specs = new Set()
  const typeLower = (type || '').toLowerCase().trim()

  if (TYPE_MAP[typeLower]) {
    TYPE_MAP[typeLower].forEach(s => specs.add(s))
  }

  const text = `${notes || ''} ${clinicName || ''}`
  for (const { pattern, label } of NOTE_KEYWORDS) {
    if (pattern.test(text)) specs.add(label)
  }

  if (specs.size === 0) specs.add('General Medicine')
  return [...specs]
}

// ── Main ───────────────────────────────────────────────
async function main() {
  console.log('Reading Listado_Clinicas.md (JSON format)...')
  let raw = fs.readFileSync(INPUT, 'utf-8')
  // Remove BOM if present
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1)

  const data = JSON.parse(raw)
  const records = data.records
  console.log(`  Found ${records.length} records`)

  // Deduplicate by name + address + county (keep cross-county listings)
  const seen = new Set()
  const unique = []
  for (const r of records) {
    const fullAddress = [r.address, r.city, `FL ${r.zip}`].filter(Boolean).join(', ')
    const key = `${r.clinic_name.toLowerCase()}|${fullAddress.toLowerCase().replace(/\s+/g, ' ')}|${(r.county || '').toLowerCase()}`
    if (!seen.has(key)) {
      seen.add(key)
      unique.push({ ...r, fullAddress })
    }
  }
  console.log(`  ${unique.length} unique clinics after dedup (removed ${records.length - unique.length} duplicates)`)

  // Geocode
  console.log('Geocoding addresses...')
  const results = []
  let geocoded = 0, failed = 0, cached = 0

  for (let i = 0; i < unique.length; i++) {
    const r = unique[i]
    const wasCached = !!geocodeCache[r.fullAddress]

    const coords = await geocode(r.fullAddress)

    if (wasCached) cached++
    else await sleep(1100) // Nominatim rate limit

    const specialties = extractSpecialties(r.care_type, r.notes, r.clinic_name)

    if (coords) {
      geocoded++
    } else {
      failed++
      console.error(`  FAILED: "${r.clinic_name}" @ "${r.fullAddress}"`)
    }

    results.push({
      id: `c-${String(i + 1).padStart(3, '0')}`,
      name: r.clinic_name,
      address: r.fullAddress,
      lat: coords ? coords.lat : 0,
      lng: coords ? coords.lng : 0,
      phone: r.phone || '',
      specialties,
      email: r.email || '',
      website: r.website || '',
      region: r.region || '',
      county: r.county || '',
      available: true,
    })

    const pct = Math.round(((i + 1) / unique.length) * 100)
    process.stdout.write(`\r  Progress: ${i + 1}/${unique.length} (${pct}%) | OK: ${geocoded} | FAIL: ${failed} | cached: ${cached}`)
  }

  console.log('\n')
  console.log(`Done! ${geocoded} geocoded, ${failed} failed, ${cached} from cache`)

  // Write clinics.json
  fs.writeFileSync(OUTPUT, JSON.stringify(results, null, 2), 'utf-8')
  console.log(`Written ${results.length} clinics to ${OUTPUT}`)
}

main().catch(console.error)
