/**
 * Minnesota county -> region, for the eight regions in `src/lib/regions.ts`.
 *
 * Extracted from `import-minnesota-clinics.js` so the specialist-clinic list
 * (`scripts/nppes/mn-specialists/`) groups counties exactly as the directory
 * already does. Keys are county names as the Census writes them, without the
 * " County" suffix.
 */
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

  // Missing from the map as it was first written, because the CSV it was built
  // for had no clinic in them. Placed by their neighbours already in the map:
  // Chisago and Isanti belong to the Minneapolis–St. Paul metro area, as Wright
  // and Sherburne above do; the rest go with the counties around them.
  'Chisago': 'Twin Cities Metro',
  'Isanti': 'Twin Cities Metro',
  'Pine': 'Central Minnesota',
  'Wadena': 'Central Minnesota',
  'Meeker': 'Central Minnesota',
  'McLeod': 'Central Minnesota',
  'Pope': 'West Central Minnesota',
  'Stevens': 'West Central Minnesota',
  'Sibley': 'South Central Minnesota',
}

module.exports = { COUNTY_REGION_MAP }
