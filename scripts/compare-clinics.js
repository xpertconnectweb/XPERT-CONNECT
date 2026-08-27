const fs = require('fs');
const path = require('path');
// normalizeAddress / normalizeStreetName / extractCore moved to scripts/lib so
// the NPPES import can dedupe against this directory with the same judgement
// this script uses. Two copies would drift, and the drift would show up as
// duplicate clinics.
const { normalizeAddress, normalizeStreetName, extractCore } = require('./lib/address-key');

// Read both files
const clinicsJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'clinics.json'), 'utf8'));
let mdContent = fs.readFileSync(path.join(__dirname, '..', 'Listado_Clinicas2.md'), 'utf8');
// Remove BOM and normalize line endings
mdContent = mdContent.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

// Extract all addresses from clinics.json
const existingAddresses = new Set();
const existingAddressesRaw = [];
clinicsJson.forEach(c => {
  const norm = normalizeAddress(c.address);
  existingAddresses.add(norm);
  existingAddressesRaw.push({ norm, raw: c.address, name: c.name });
});

// Extract just the street number and first few words of the street for fuzzy matching
function extractStreetKey(addr) {
  if (!addr) return '';
  const lower = addr.toLowerCase().trim().replace(/\s+/g, ' ');
  // Get everything before FL
  const beforeFL = lower.split(/,\s*fl\b/)[0] || '';
  // Remove suite/unit
  let street = beforeFL
    .replace(/\bsuite\b\s*\S*/gi, '')
    .replace(/\bste\b\s*\S*/gi, '')
    .replace(/\bunit\b\s*\S*/gi, '')
    .replace(/\bbuilding\b\s*\S*/gi, '')
    .replace(/\b#\s*\S*/gi, '')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Extract the first address part (number + street name)
  const firstPart = street.split(/\s*,\s*/)[0].trim();
  return normalizeStreetName(firstPart);
}

// Extract city from address
function extractCity(addr) {
  if (!addr) return '';
  const lower = addr.toLowerCase().trim();
  // Match city before ", FL"
  const m = lower.match(/,\s*([^,]+?)\s*,\s*fl\b/);
  if (m) return m[1].trim();
  // Try alternate pattern
  const parts = lower.split(/,\s*fl\b/);
  if (parts.length >= 1) {
    const chunks = parts[0].split(',');
    if (chunks.length >= 2) return chunks[chunks.length - 1].trim();
  }
  return '';
}

// Parse the markdown file to extract clinic entries
function parseMdClinics(content) {
  const lines = content.split('\n');
  const clinics = [];

  let currentRegion = '';
  let currentCounty = '';
  let currentClinic = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detect region headers (emoji squares like 🟦, 🟩, etc.)
    if (line.match(/^(\u{1F7E6}|\u{1F7E9}|\u{1F7E8}|\u{1F7E7}|\u{1F7EA}|\u{1F7E5}|\u{1F7EB})/u)) {
      currentRegion = line.replace(/^(\u{1F7E6}|\u{1F7E9}|\u{1F7E8}|\u{1F7E7}|\u{1F7EA}|\u{1F7E5}|\u{1F7EB})\s*/u, '').trim();
      continue;
    }

    // Detect county headers (lines that end with "County")
    if (line.match(/\bCounty$/i) && !line.startsWith('📍') && !line.startsWith('📞')) {
      currentCounty = line.trim();
      continue;
    }

    // Detect clinic name lines (numbered entries like "1. Name", "1) Name", "1️⃣ Name")
    const clinicMatch = line.match(/^(?:\d+[\.\)]\s*)(.+)$/);
    // Also try emoji number patterns like 1️⃣
    const emojiNumMatch = !clinicMatch ? line.match(/^[\d\uFE0F\u20E3]+\s+(.+)$/u) : null;
    const finalMatch = clinicMatch || emojiNumMatch;
    if (finalMatch && !line.startsWith('📍') && !line.startsWith('📞') && !line.startsWith('🌐') && !line.startsWith('📌') && !line.startsWith('💡') && !line.startsWith('🔗') && !line.startsWith('🔎') && !line.startsWith('📧') && !line.startsWith('✉') && !line.startsWith('⸻') && !line.startsWith('•') && !line.startsWith('\t•') && !line.startsWith('🔹') && !line.startsWith('🏥') && !line.match(/^[\t\s]*•/) && !line.match(/^ZIP:/i)) {
      // Save previous clinic
      if (currentClinic && currentClinic.addresses.length > 0) {
        clinics.push(currentClinic);
      }
      currentClinic = {
        name: finalMatch[1].trim(),
        addresses: [],
        phone: '',
        website: '',
        region: currentRegion,
        county: currentCounty
      };
      continue;
    }

    // Also detect clinic names that appear as sub-headers (like "Sede Kendall")
    if (line.match(/^Sede\s+/i) && currentClinic) {
      // This is a sub-location, keep current clinic
      continue;
    }

    // Detect address lines
    if (line.startsWith('📍')) {
      const addr = line.replace(/^📍\s*/, '').trim();
      if (addr && currentClinic) {
        currentClinic.addresses.push(addr);
      } else if (addr && !currentClinic) {
        // Address without a clinic header - create one from context
      }
      continue;
    }

    // Detect phone
    if ((line.includes('📞') || line.startsWith('🔹 Tel') || line.match(/^🔹\s*Tel/)) && currentClinic) {
      const phone = line.replace(/^.*?📞\s*/, '').replace(/^🔹\s*Tel[eé]fono:\s*/, '').trim();
      if (!currentClinic.phone) currentClinic.phone = phone;
      continue;
    }

    // Detect website
    if (line.startsWith('🌐') && currentClinic) {
      const web = line.replace(/^🌐\s*/, '').trim();
      if (!currentClinic.website) currentClinic.website = web;
      continue;
    }
  }

  // Don't forget the last clinic
  if (currentClinic && currentClinic.addresses.length > 0) {
    clinics.push(currentClinic);
  }

  return clinics;
}

const mdClinics = parseMdClinics(mdContent);

console.log(`\n=== CLINIC COMPARISON REPORT ===`);
console.log(`Clinics in clinics.json: ${clinicsJson.length}`);
console.log(`Clinic entries parsed from Listado_Clinicas2.md: ${mdClinics.length}`);

// Count total addresses
let totalAddresses = 0;
mdClinics.forEach(c => totalAddresses += c.addresses.length);
console.log(`Total address lines in Listado_Clinicas2.md: ${totalAddresses}`);

// For each md clinic, check if each address matches one in clinics.json
const newClinics = [];
const matchedClinics = [];

mdClinics.forEach(clinic => {
  clinic.addresses.forEach(addr => {
    const addrCore = extractCore(addr);
    const addrStreetKey = extractStreetKey(addr);
    const addrCity = extractCity(addr);
    let matched = false;
    let matchedWith = '';

    for (const existing of existingAddressesRaw) {
      const existingCore = extractCore(existing.raw);
      const existingStreetKey = extractStreetKey(existing.raw);
      const existingCity = extractCity(existing.raw);

      // Direct core match (with all commas removed)
      if (addrCore === existingCore) {
        matched = true;
        matchedWith = existing.raw;
        break;
      }

      // Street key + city match
      if (addrStreetKey && existingStreetKey && addrCity && existingCity) {
        if (addrStreetKey === existingStreetKey && addrCity === existingCity) {
          matched = true;
          matchedWith = existing.raw;
          break;
        }
        // Check if one contains the other (for street name variations)
        if (addrCity === existingCity &&
            (addrStreetKey.includes(existingStreetKey) || existingStreetKey.includes(addrStreetKey))) {
          matched = true;
          matchedWith = existing.raw;
          break;
        }
      }

      // Same street number + same city (looser match)
      const addrNum = addr.match(/^\(?\w*\)?\s*(\d+)/);
      const existingNum = existing.raw.match(/^\(?\w*\)?\s*(\d+)/);
      if (addrNum && existingNum && addrNum[1] === existingNum[1] && addrCity && existingCity && addrCity === existingCity) {
        // Also check first meaningful word of street name
        const addrWords = addrStreetKey.replace(/^\d+\s*/, '').split(/\s+/);
        const existingWords = existingStreetKey.replace(/^\d+\s*/, '').split(/\s+/);
        if (addrWords[0] && existingWords[0] && addrWords[0] === existingWords[0]) {
          matched = true;
          matchedWith = existing.raw;
          break;
        }
      }
    }

    if (!matched) {
      const hasStreetNumber = /\d/.test(addr.split(',')[0]);
      newClinics.push({
        name: clinic.name,
        address: addr,
        phone: clinic.phone,
        website: clinic.website,
        region: clinic.region,
        county: clinic.county,
        hasFullAddress: hasStreetNumber
      });
    } else {
      matchedClinics.push({
        name: clinic.name,
        address: addr,
        matchedWith: matchedWith
      });
    }
  });
});

// Deduplicate new clinics by address (same address appearing under different counties)
const seenNewAddresses = new Set();
const deduplicatedNew = [];
newClinics.forEach(c => {
  const key = extractCore(c.address);
  if (!seenNewAddresses.has(key)) {
    seenNewAddresses.add(key);
    deduplicatedNew.push(c);
  }
});

console.log(`\nMatched addresses (already in clinics.json): ${matchedClinics.length}`);
console.log(`NEW addresses (not in clinics.json) before dedup: ${newClinics.length}`);
console.log(`NEW addresses (not in clinics.json) after dedup: ${deduplicatedNew.length}`);

// Separate those with full addresses from vague ones
const fullNewClinics = deduplicatedNew.filter(c => c.hasFullAddress);
const vagueNewClinics = deduplicatedNew.filter(c => !c.hasFullAddress);

console.log(`  - With full street address: ${fullNewClinics.length}`);
console.log(`  - With vague/city-only address: ${vagueNewClinics.length}`);

console.log(`\n\n========================================`);
console.log(`NEW CLINICS WITH FULL ADDRESSES`);
console.log(`========================================\n`);

fullNewClinics.forEach((c, i) => {
  console.log(`${i+1}. ${c.name}`);
  console.log(`   Address: ${c.address}`);
  console.log(`   Phone: ${c.phone || 'N/A'}`);
  console.log(`   Website: ${c.website || 'N/A'}`);
  console.log(`   Region: ${c.region}`);
  console.log(`   County: ${c.county}`);
  console.log('');
});

if (vagueNewClinics.length > 0) {
  console.log(`\n========================================`);
  console.log(`NEW CLINICS WITH VAGUE/PARTIAL ADDRESSES`);
  console.log(`========================================\n`);

  vagueNewClinics.forEach((c, i) => {
    console.log(`${i+1}. ${c.name}`);
    console.log(`   Address: ${c.address}`);
    console.log(`   Phone: ${c.phone || 'N/A'}`);
    console.log(`   Website: ${c.website || 'N/A'}`);
    console.log(`   Region: ${c.region}`);
    console.log(`   County: ${c.county}`);
    console.log('');
  });
}

// Also output the matched ones for verification
console.log(`\n========================================`);
console.log(`MATCHED CLINICS (already exist)`);
console.log(`========================================\n`);
matchedClinics.forEach((c, i) => {
  console.log(`${i+1}. ${c.name} - ${c.address}`);
});
