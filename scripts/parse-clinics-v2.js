/**
 * Parse "Listado Clinicas Florida.md" (v2 – structured tables) → data/clinics.json
 *
 * The file has 3 aligned tables:
 *   Table 1: Region, County, Clinic Name
 *   Table 2: Address, City, ZIP, Phone, Website, Email
 *   Table 3: Tipo de atención, Notas
 *
 * Rows match 1:1 across all three tables.
 *
 * Uses Nominatim (free OpenStreetMap geocoding) for coordinates.
 * Caches results in data/geocode-cache.json for fast re-runs.
 *
 * Usage:  node scripts/parse-clinics-v2.js
 */

const fs = require('fs')
const path = require('path')
const https = require('https')

// ── Paths ──────────────────────────────────────────────
const INPUT = path.join(__dirname, '..', 'Listado Clinicas Florida.md')
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
    https.get(url, { headers: { 'User-Agent': 'XpertConnect-ClinicParser/2.0' } }, res => {
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

  // Fallback: try city + state + ZIP
  const zipMatch = address.match(/,\s*FL\s+(\d{5})/)
  if (zipMatch) {
    try {
      await sleep(1100)
      const q2 = encodeURIComponent(zipMatch[0])
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

  // Map the "tipo de atención"
  if (TYPE_MAP[typeLower]) {
    TYPE_MAP[typeLower].forEach(s => specs.add(s))
  }

  // Extract from notes
  const text = `${notes || ''} ${clinicName || ''}`
  for (const { pattern, label } of NOTE_KEYWORDS) {
    if (pattern.test(text)) specs.add(label)
  }

  if (specs.size === 0) specs.add('General Medicine')
  return [...specs]
}

// ── Table parsers ──────────────────────────────────────

function splitPipeRow(line) {
  // Remove leading/trailing pipes and split
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
}

function isDataRow(line) {
  // Not a separator (| - | ...) and not empty/header
  if (!line.startsWith('|')) return false
  if (line.match(/^\|\s*-\s*\|/)) return false
  return true
}

function isSectionSeparator(cells) {
  // All cells are empty
  return cells.every(c => c === '')
}

function isBoldHeader(text) {
  return text.startsWith('**') && text.endsWith('**')
}

function parseFile(content) {
  const lines = content.split('\n').map(l => l.trimEnd())

  // Find section boundaries
  let sec2Start = -1
  let sec3Start = -1

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('**Dirección**')) { sec2Start = i; continue }
    if (lines[i].includes('**Tipo de atención**')) { sec3Start = i; break }
  }

  if (sec2Start === -1 || sec3Start === -1) {
    throw new Error('Could not find section boundaries in the file')
  }

  console.log(`   Section 1 (Names):     lines 1-${sec2Start}`)
  console.log(`   Section 2 (Addresses): lines ${sec2Start + 1}-${sec3Start}`)
  console.log(`   Section 3 (Types):     lines ${sec3Start + 1}-${lines.length}`)

  // ── Parse Section 1: Names ──
  const nameRows = []
  for (let i = 0; i < sec2Start; i++) {
    const line = lines[i]
    if (!isDataRow(line)) continue
    const cells = splitPipeRow(line)
    // Expect: ['', Region, County, ClinicName, ''] (5+ cells)
    // Skip header rows (bold), separator rows, or empty rows
    if (cells.length < 4) continue
    const region = cells[1] || ''
    const county = cells[2] || ''
    const name = cells[3] || ''
    // Skip if any field is bold (it's a header) or all empty
    if (isBoldHeader(region) || isBoldHeader(county) || isBoldHeader(name)) continue
    if (!region && !county && !name) continue
    if (!name) continue
    nameRows.push({ region, county, name })
  }

  // ── Parse Section 2: Addresses ──
  const addressRows = []
  for (let i = sec2Start + 1; i < sec3Start; i++) {
    const line = lines[i]
    if (!isDataRow(line)) continue
    const cells = splitPipeRow(line)
    // Expect: [Address, City, ZIP, Phone, Website, Email, ''] (7+ cells)
    // Skip header row and all-empty separator rows
    if (cells.length < 5) continue
    if (isBoldHeader(cells[0])) continue

    const address = cells[0] || ''
    const city = cells[1] || ''
    const zip = cells[2] || ''
    const phone = cells[3] || ''
    const website = cells[4] || ''
    const email = cells[5] || ''

    // Skip empty separator rows
    if (!address && !city && !zip) continue

    addressRows.push({ address, city, zip, phone, website, email })
  }

  // ── Parse Section 3: Types ──
  const typeRows = []
  for (let i = sec3Start + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!isDataRow(line)) continue
    const cells = splitPipeRow(line)
    if (cells.length < 2) continue
    if (isBoldHeader(cells[0])) continue

    const type = cells[0] || ''
    const notes = cells[1] || ''

    if (!type && !notes) continue

    typeRows.push({ type, notes })
  }

  console.log(`   Parsed: ${nameRows.length} names, ${addressRows.length} addresses, ${typeRows.length} types`)

  // Validate alignment
  const count = Math.min(nameRows.length, addressRows.length, typeRows.length)
  if (nameRows.length !== addressRows.length || addressRows.length !== typeRows.length) {
    console.warn(`   WARNING: Row counts don't match! Using min(${nameRows.length}, ${addressRows.length}, ${typeRows.length}) = ${count}`)
  }

  // Merge
  const clinics = []
  for (let i = 0; i < count; i++) {
    const n = nameRows[i]
    const a = addressRows[i]
    const t = typeRows[i]

    const fullAddress = [a.address, a.city, `FL ${a.zip}`].filter(Boolean).join(', ')

    clinics.push({
      name: n.name,
      address: fullAddress,
      city: a.city,
      zip: a.zip,
      phone: a.phone,
      website: a.website,
      email: a.email,
      type: t.type,
      notes: t.notes,
      region: n.region,
      county: n.county,
    })
  }

  return clinics
}

// ── Main ───────────────────────────────────────────────
async function main() {
  console.log('Reading clinic list (v2)...')
  const content = fs.readFileSync(INPUT, 'utf-8')

  console.log('Parsing tables...')
  const rawClinics = parseFile(content)
  console.log(`   Total: ${rawClinics.length} clinics parsed`)

  // Deduplicate by name+address
  const seen = new Set()
  const unique = []
  for (const c of rawClinics) {
    const key = `${c.name.toLowerCase()}|${c.address.toLowerCase().replace(/\s+/g, ' ')}`
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(c)
    }
  }
  console.log(`   ${unique.length} unique clinics after dedup`)

  // Geocode
  console.log('Geocoding addresses...')
  const results = []
  let geocoded = 0, failed = 0, cached = 0

  for (let i = 0; i < unique.length; i++) {
    const c = unique[i]
    const wasCached = !!geocodeCache[c.address]

    const coords = await geocode(c.address)

    if (wasCached) cached++
    else await sleep(1100) // Nominatim rate limit

    const specialties = extractSpecialties(c.type, c.notes, c.name)

    if (coords) {
      geocoded++
      results.push({
        id: `c-${String(i + 1).padStart(3, '0')}`,
        name: c.name,
        address: c.address,
        lat: coords.lat,
        lng: coords.lng,
        phone: c.phone,
        specialties,
        email: c.email,
        website: c.website,
        region: c.region,
        county: c.county,
        available: true,
      })
    } else {
      failed++
      console.error(`  FAILED: "${c.name}" @ "${c.address}"`)
      results.push({
        id: `c-${String(i + 1).padStart(3, '0')}`,
        name: c.name,
        address: c.address,
        lat: 0,
        lng: 0,
        phone: c.phone,
        specialties,
        email: c.email,
        website: c.website,
        region: c.region,
        county: c.county,
        available: true,
      })
    }

    const pct = Math.round(((i + 1) / unique.length) * 100)
    process.stdout.write(`\r   Progress: ${i + 1}/${unique.length} (${pct}%) | OK: ${geocoded} | FAIL: ${failed} | cached: ${cached}`)
  }

  console.log('\n')
  console.log(`Done! ${geocoded} geocoded, ${failed} failed, ${cached} from cache`)

  fs.writeFileSync(OUTPUT, JSON.stringify(results, null, 2), 'utf-8')
  console.log(`Written ${results.length} clinics to ${OUTPUT}`)
}

main().catch(console.error)
