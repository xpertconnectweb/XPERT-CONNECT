/**
 * Florida county -> region, for the eight regions in `src/lib/regions.ts`.
 *
 * The directory never had this as a table: each clinic row carried its own
 * region. These follow what those rows say where they agree (Manatee is
 * Southwest Florida, Marion is Central Florida, Citrus and Hernando are Tampa
 * Bay) and geography for the counties no clinic is in. Keys are county names
 * as the Census writes them, without the " County" suffix.
 *
 * COUNTY_BAND is the coarser grouping of the lawyers Sheet ("BASE DE DATOS
 * ABOGADOS FLORIDA"), whose three coloured bands client lists copy: Tampa Bay
 * sits under South Florida there, and so it does here.
 */
const COUNTY_REGION_MAP = {
  // North Florida / Panhandle
  'Escambia': 'North Florida / Panhandle',
  'Santa Rosa': 'North Florida / Panhandle',
  'Okaloosa': 'North Florida / Panhandle',
  'Walton': 'North Florida / Panhandle',
  'Holmes': 'North Florida / Panhandle',
  'Washington': 'North Florida / Panhandle',
  'Bay': 'North Florida / Panhandle',
  'Jackson': 'North Florida / Panhandle',
  'Calhoun': 'North Florida / Panhandle',
  'Gulf': 'North Florida / Panhandle',
  'Liberty': 'North Florida / Panhandle',
  'Franklin': 'North Florida / Panhandle',
  'Gadsden': 'North Florida / Panhandle',
  'Leon': 'North Florida / Panhandle',
  'Wakulla': 'North Florida / Panhandle',
  'Jefferson': 'North Florida / Panhandle',
  'Madison': 'North Florida / Panhandle',
  'Taylor': 'North Florida / Panhandle',

  // North Central Florida
  'Alachua': 'North Central Florida',
  'Levy': 'North Central Florida',
  'Gilchrist': 'North Central Florida',
  'Dixie': 'North Central Florida',
  'Lafayette': 'North Central Florida',
  'Suwannee': 'North Central Florida',
  'Columbia': 'North Central Florida',
  'Hamilton': 'North Central Florida',
  'Union': 'North Central Florida',
  'Bradford': 'North Central Florida',

  // Northeast Florida
  'Duval': 'Northeast Florida',
  'St. Johns': 'Northeast Florida',
  'Nassau': 'Northeast Florida',
  'Clay': 'Northeast Florida',
  'Baker': 'Northeast Florida',
  'Putnam': 'Northeast Florida',
  'Flagler': 'Northeast Florida',

  // Central Florida
  'Orange': 'Central Florida',
  'Osceola': 'Central Florida',
  'Seminole': 'Central Florida',
  'Lake': 'Central Florida',
  'Volusia': 'Central Florida',
  'Brevard': 'Central Florida',
  'Polk': 'Central Florida',
  'Sumter': 'Central Florida',
  'Marion': 'Central Florida',
  'Highlands': 'Central Florida',
  'Hardee': 'Central Florida',

  // West Central Florida / Tampa Bay
  'Hillsborough': 'West Central Florida / Tampa Bay',
  'Pinellas': 'West Central Florida / Tampa Bay',
  'Pasco': 'West Central Florida / Tampa Bay',
  'Hernando': 'West Central Florida / Tampa Bay',
  'Citrus': 'West Central Florida / Tampa Bay',

  // Southwest Florida
  'Manatee': 'Southwest Florida',
  'Sarasota': 'Southwest Florida',
  'Charlotte': 'Southwest Florida',
  'DeSoto': 'Southwest Florida',
  'Lee': 'Southwest Florida',
  'Collier': 'Southwest Florida',
  'Hendry': 'Southwest Florida',
  'Glades': 'Southwest Florida',

  // South Florida
  'Miami-Dade': 'South Florida',
  'Broward': 'South Florida',
  'Palm Beach': 'South Florida',
  'Martin': 'South Florida',
  'St. Lucie': 'South Florida',
  'Indian River': 'South Florida',
  'Okeechobee': 'South Florida',

  // Florida Keys
  'Monroe': 'Florida Keys',
}

/** The lawyers Sheet's three bands. Counties it named keep its placement. */
const REGION_BAND = {
  'North Florida / Panhandle': 'NORTH FLORIDA / PANHANDLE',
  'North Central Florida': 'NORTH FLORIDA / PANHANDLE',
  'Northeast Florida': 'NORTH FLORIDA / PANHANDLE',
  'Central Florida': 'CENTRAL FLORIDA',
  'West Central Florida / Tampa Bay': 'SOUTH FLORIDA',
  'Southwest Florida': 'SOUTH FLORIDA',
  'South Florida': 'SOUTH FLORIDA',
  'Florida Keys': 'SOUTH FLORIDA',
}
/** Where the lawyers Sheet put a county differently from its region's band. */
const BAND_OVERRIDES = {
  'Flagler': 'CENTRAL FLORIDA',
  'Marion': 'NORTH FLORIDA / PANHANDLE',
  'Alachua': 'NORTH FLORIDA / PANHANDLE',
}

function countyBand(county) {
  return BAND_OVERRIDES[county] ?? REGION_BAND[COUNTY_REGION_MAP[county]]
}

module.exports = { COUNTY_REGION_MAP, countyBand }
