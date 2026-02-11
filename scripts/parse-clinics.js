/**
 * Parse "Listado Mapa Clínicas FL.md" and generate data/clinics.json
 * Uses Nominatim (free OpenStreetMap geocoding) for coordinates.
 *
 * Usage:  node scripts/parse-clinics.js
 */

const fs = require('fs')
const path = require('path')
const https = require('https')

// ── Paths ──────────────────────────────────────────────
const INPUT = path.join(__dirname, '..', 'Listado Mapa Clínicas FL.md')
const OUTPUT = path.join(__dirname, '..', 'data', 'clinics.json')
const CACHE_FILE = path.join(__dirname, '..', 'data', 'geocode-cache.json')

// ── Geocode cache (saves progress so we can resume) ──
let geocodeCache = {}
if (fs.existsSync(CACHE_FILE)) {
  try {
    geocodeCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'))
  } catch { /* start fresh */ }
}

function saveCache() {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(geocodeCache, null, 2), 'utf-8')
}

// ── Helpers ────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** Fetch URL via HTTPS, returns a Promise<string> */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'XpertConnect-ClinicParser/1.0' } }, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => resolve(data))
      res.on('error', reject)
    }).on('error', reject)
  })
}

/** Geocode an address via Nominatim (1 req/sec rate limit) */
async function geocode(address) {
  // Check cache first
  if (geocodeCache[address]) return geocodeCache[address]

  const q = encodeURIComponent(address)
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=1&countrycodes=us`

  try {
    const raw = await fetchUrl(url)
    const results = JSON.parse(raw)
    if (results.length > 0) {
      const { lat, lon } = results[0]
      const coords = { lat: parseFloat(lat), lng: parseFloat(lon) }
      geocodeCache[address] = coords
      saveCache()
      return coords
    }
  } catch (err) {
    console.error(`  ⚠ Geocode error for "${address}": ${err.message}`)
  }

  // Fallback: try with just city + state + zip
  const zipMatch = address.match(/FL\s+(\d{5})/)
  if (zipMatch) {
    const fallback = `${zipMatch[0]}`
    const q2 = encodeURIComponent(fallback)
    const url2 = `https://nominatim.openstreetmap.org/search?format=json&q=${q2}&limit=1&countrycodes=us`
    try {
      await sleep(1100)
      const raw2 = await fetchUrl(url2)
      const results2 = JSON.parse(raw2)
      if (results2.length > 0) {
        const { lat, lon } = results2[0]
        const coords = { lat: parseFloat(lat), lng: parseFloat(lon) }
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

// ── Specialty extraction from description ──────────────

const SPECIALTY_KEYWORDS = [
  { pattern: /quiropr[aá]ctic|chiropractic|ajustes/i, label: 'Chiropractic' },
  { pattern: /auto.?accident|auto.?injur|accidente.?auto|lesion.+accidente|car.?accident|choques/i, label: 'Auto Injuries' },
  { pattern: /terapia\s*f[ií]sica|physical\s*therapy/i, label: 'Physical Therapy' },
  { pattern: /rehabilitaci[oó]n|rehab/i, label: 'Rehabilitation' },
  { pattern: /dolor|pain\s*management|manejo.+dolor/i, label: 'Pain Management' },
  { pattern: /spine|espinal|espalda|columna/i, label: 'Spine' },
  { pattern: /ortop[eé]dic|orthopedic/i, label: 'Orthopedics' },
  { pattern: /whiplash|latigazo/i, label: 'Whiplash Treatment' },
  { pattern: /sport|deport/i, label: 'Sports Medicine' },
  { pattern: /neurolog/i, label: 'Neurology' },
  { pattern: /cirug[ií]a|surgery/i, label: 'Surgery' },
  { pattern: /diagn[oó]stic/i, label: 'Diagnostics' },
  { pattern: /inyecci[oó]n|injection/i, label: 'Injections' },
]

function extractSpecialties(description, name) {
  const text = `${name} ${description}`
  const found = new Set()
  for (const { pattern, label } of SPECIALTY_KEYWORDS) {
    if (pattern.test(text)) found.add(label)
  }
  // Default if nothing matched
  if (found.size === 0) found.add('General Medicine')
  return [...found]
}

// ── Main parser ────────────────────────────────────────

function parseMarkdown(content) {
  const lines = content.split('\n')
  const clinics = []
  let currentRegion = ''
  let currentCounty = ''

  // State machine
  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()

    // Region headers
    const regionMatch = line.match(/^[🟦🟩🟨🟧🟪🟥]\s*(.+)$/u)
    if (regionMatch) {
      currentRegion = regionMatch[1].trim()
      i++
      continue
    }

    // County headers (line followed by ZIP line)
    if (line.match(/County$/i) && i + 2 < lines.length) {
      const nextNonEmpty = lines.slice(i + 1, i + 4).find(l => l.trim())
      if (nextNonEmpty && nextNonEmpty.includes('ZIP')) {
        currentCounty = line
        i++
        continue
      }
    }

    // Skip ZIP lines and empty lines
    if (line.startsWith('•') || line.startsWith('\t•') || line === '' || line === '⸻') {
      i++
      continue
    }

    // Detect clinic entry: starts with a number followed by . or ) or \.
    const clinicNameMatch = line.match(/^\d+[\.\\\)]+\s*(.+)$/)
    if (clinicNameMatch) {
      let clinicName = clinicNameMatch[1]
        .replace(/\\\./g, '.')
        .replace(/\\-/g, '-')
        .replace(/\s*\(verificar.*?\)/gi, '')
        .trim()

      // Collect all lines until next separator or next clinic number
      const entryLines = []
      i++
      while (i < lines.length) {
        const l = lines[i].trim()
        if (l === '⸻' || l.match(/^\d+[\.\\\)]+\s/)) break
        entryLines.push(l)
        i++
      }

      const entryText = entryLines.join('\n')

      // Check for multi-location (multiple 📍)
      const addressLines = entryLines.filter(l => l.startsWith('📍'))
      const phoneLines = entryLines.filter(l => l.startsWith('📞'))
      const websiteLines = entryLines.filter(l => l.match(/^🌐/))
      const emailLines = entryLines.filter(l => l.match(/^[✉️📧]/u))
      const descriptionLines = entryLines.filter(l => l.match(/^[📌💡]/u))

      const website = websiteLines.length > 0
        ? websiteLines[0].replace(/^🌐\s*/, '').replace(/\\-/g, '-').trim()
        : ''

      const description = descriptionLines.map(l =>
        l.replace(/^[📌💡]\s*/, '').replace(/\\\+/g, '+').replace(/\\-/g, '-').trim()
      ).join(' ')

      let email = ''
      for (const el of emailLines) {
        const cleaned = el.replace(/^[✉️📧]\s*/, '').replace(/\[email protected\\\]/g, '').trim()
        if (cleaned.includes('@') && !cleaned.includes('No público')) {
          // extract email
          const emailMatch = cleaned.match(/[\w.-]+@[\w.-]+\.\w+/)
          if (emailMatch) email = emailMatch[0]
        }
      }

      // Check for sub-locations (Sede X / location lines before 📍)
      // If multiple addresses, create multiple entries
      if (addressLines.length <= 1) {
        const address = addressLines.length > 0
          ? addressLines[0].replace(/^📍\s*/, '').trim()
          : ''
        const phone = phoneLines.length > 0
          ? phoneLines[0].replace(/^📞\s*/, '').replace(/\s*\/\s*.*/g, '').trim()
          : ''

        if (address) {
          clinics.push({
            name: clinicName,
            address,
            phone,
            website,
            email,
            description,
            region: currentRegion,
            county: currentCounty,
          })
        }
      } else {
        // Multi-location: pair addresses with phones
        // Try to group by looking at sequential 📍 then 📞
        let locIdx = 0
        for (let j = 0; j < entryLines.length; j++) {
          if (entryLines[j].startsWith('📍')) {
            const addr = entryLines[j].replace(/^📍\s*/, '').trim()
            // Look for phone in next few lines
            let phone = ''
            for (let k = j + 1; k < Math.min(j + 4, entryLines.length); k++) {
              if (entryLines[k].startsWith('📞')) {
                phone = entryLines[k].replace(/^📞\s*/, '').replace(/\s*\/\s*.*/g, '').trim()
                break
              }
              if (entryLines[k].startsWith('📍')) break
            }

            // Find sub-location label
            let locLabel = ''
            for (let k = j - 1; k >= Math.max(0, j - 3); k--) {
              const prev = entryLines[k].trim()
              if (prev.match(/^(Sede|Location)/i) || prev.match(/\(ZIP\s/)) {
                locLabel = prev.replace(/\(ZIP\s.*\)/i, '').replace(/Sede\s*/i, '').trim()
                break
              }
            }

            const suffix = locLabel ? ` - ${locLabel}` : (locIdx > 0 ? ` - Location ${locIdx + 1}` : '')

            clinics.push({
              name: clinicName + suffix,
              address: addr,
              phone: phone || (phoneLines.length > 0 ? phoneLines[0].replace(/^📞\s*/, '').replace(/\s*\/\s*.*/g, '').trim() : ''),
              website,
              email,
              description,
              region: currentRegion,
              county: currentCounty,
            })
            locIdx++
          }
        }
      }
      continue
    }

    i++
  }

  return clinics
}

// ── Main ───────────────────────────────────────────────

async function main() {
  console.log('📖 Reading clinic list...')
  const content = fs.readFileSync(INPUT, 'utf-8')

  console.log('🔍 Parsing clinics...')
  const rawClinics = parseMarkdown(content)
  console.log(`   Found ${rawClinics.length} clinic entries`)

  // Deduplicate by address
  const seen = new Set()
  const unique = []
  for (const c of rawClinics) {
    const key = c.address.toLowerCase().replace(/\s+/g, ' ')
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(c)
    }
  }
  console.log(`   ${unique.length} unique addresses after dedup`)

  // Geocode all
  console.log('🌍 Geocoding addresses (this may take several minutes)...')
  const results = []
  let geocoded = 0
  let failed = 0
  let cached = 0

  for (let i = 0; i < unique.length; i++) {
    const c = unique[i]
    const wasCached = !!geocodeCache[c.address]

    const coords = await geocode(c.address)

    if (wasCached) {
      cached++
    } else {
      // Rate limit: 1 req/sec for Nominatim
      await sleep(1100)
    }

    if (coords) {
      geocoded++
      const specialties = extractSpecialties(c.description, c.name)

      results.push({
        id: `c-${String(i + 1).padStart(3, '0')}`,
        name: c.name,
        address: c.address,
        lat: coords.lat,
        lng: coords.lng,
        phone: c.phone,
        specialties,
        email: c.email || '',
        website: c.website,
        region: c.region,
        county: c.county,
        available: true,
      })
    } else {
      failed++
      console.error(`  ✗ Could not geocode: "${c.name}" @ "${c.address}"`)
      // Still add but with 0,0 coords so we can fix later
      const specialties = extractSpecialties(c.description, c.name)
      results.push({
        id: `c-${String(i + 1).padStart(3, '0')}`,
        name: c.name,
        address: c.address,
        lat: 0,
        lng: 0,
        phone: c.phone,
        specialties,
        email: c.email || '',
        website: c.website,
        region: c.region,
        county: c.county,
        available: true,
      })
    }

    // Progress
    const pct = Math.round(((i + 1) / unique.length) * 100)
    process.stdout.write(`\r   Progress: ${i + 1}/${unique.length} (${pct}%) | ✓ ${geocoded} | ✗ ${failed} | cached: ${cached}`)
  }

  console.log('\n')
  console.log(`✅ Done! ${geocoded} geocoded, ${failed} failed, ${cached} from cache`)

  // Write output
  fs.writeFileSync(OUTPUT, JSON.stringify(results, null, 2), 'utf-8')
  console.log(`📁 Written ${results.length} clinics to ${OUTPUT}`)
}

main().catch(console.error)
