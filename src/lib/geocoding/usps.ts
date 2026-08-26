/**
 * USPS Publication 28 -- the tables that make a typed address match a stored one.
 *
 * The obvious assumption about OpenAddresses is that it normalises everything to
 * the postal standard, so the index holds "62ND ST CIR E" and the parser only
 * ever has to abbreviate towards it. That assumption is wrong, and it was wrong
 * in the one address the client reported. Manatee County publishes
 * `62ND STREET CIR E`, spelled out; other counties publish `62ND STREET EAST`
 * with the direction spelled out too. Across a hundred and forty-four separate
 * county and city registers the conventions simply do not agree.
 *
 * So the tables here run **both ways**. Each entry knows its USPS abbreviation
 * and its full English word, and the parser emits a canonical form for each
 * convention rather than betting on one.
 *
 * Worth being explicit that `TOKEN_EXPANSIONS` in `src/lib/search/text.ts` is a
 * different table for a different job. That one widens a directory query so a
 * firm called "Main Street Legal" is found by someone typing "main st"; this one
 * pins an address to a register. Same words, opposite purposes.
 *
 * ── Appendix C1 (suffixes) ──────────────────────────────────────────────────
 *
 * `ABBREVIATION|full word|other spellings`. The plural forms are separate
 * entries rather than a stemming rule, because USPS treats FLD and FLDS as
 * different suffixes and "Field Rd" and "Fields Rd" can be two streets in one
 * city.
 */
const SUFFIX_ROWS: readonly string[] = [
  'ALY|alley|allee ally aly',
  'ANX|annex|anex annx anx',
  'ARC|arcade|arc',
  'AVE|avenue|av ave aven avenu avn avnue',
  'BYU|bayou|bayoo byu',
  'BCH|beach|bch',
  'BND|bend|bnd',
  'BLF|bluff|blf bluf',
  'BLFS|bluffs|blfs',
  'BTM|bottom|bot bottm btm',
  'BLVD|boulevard|blvd boul boulv',
  'BR|branch|br brnch',
  'BRG|bridge|brdge brg',
  'BRK|brook|brk',
  'BRKS|brooks|brks',
  'BG|burg|bg',
  'BGS|burgs|bgs',
  'BYP|bypass|byp bypa bypas byps',
  'CP|camp|cp cmp',
  'CYN|canyon|canyn cnyn cyn',
  'CPE|cape|cpe',
  'CSWY|causeway|causwa cswy',
  'CTR|center|cen cent centr centre cnter cntr ctr',
  'CTRS|centers|ctrs',
  'CIR|circle|cir circ circl crcl crcle',
  'CIRS|circles|cirs',
  'CLF|cliff|clf',
  'CLFS|cliffs|clfs',
  'CLB|club|clb',
  'CMN|common|cmn',
  'CMNS|commons|cmns',
  'COR|corner|cor',
  'CORS|corners|cors',
  'CRSE|course|crse',
  'CT|court|ct crt',
  'CTS|courts|cts',
  'CV|cove|cv',
  'CVS|coves|cvs',
  'CRK|creek|crk',
  'CRES|crescent|cres crsent crsnt',
  'CRST|crest|crst',
  'XING|crossing|crssng xing',
  'XRD|crossroad|xrd',
  'XRDS|crossroads|xrds',
  'CURV|curve|curv',
  'DL|dale|dl',
  'DM|dam|dm',
  'DV|divide|div dv dvd',
  'DR|drive|dr driv drv',
  'DRS|drives|drs',
  'EST|estate|est',
  'ESTS|estates|ests',
  'EXPY|expressway|exp expr express expw expy',
  'EXT|extension|ext extn extnsn',
  'EXTS|extensions|exts',
  'FALL|fall|fall',
  'FLS|falls|fls',
  'FRY|ferry|frry fry',
  'FLD|field|fld',
  'FLDS|fields|flds',
  'FLT|flat|flt',
  'FLTS|flats|flts',
  'FRD|ford|frd',
  'FRDS|fords|frds',
  'FRST|forest|frst forests',
  'FRG|forge|forg frg',
  'FRGS|forges|frgs',
  'FRK|fork|frk',
  'FRKS|forks|frks',
  'FT|fort|frt ft',
  'FWY|freeway|freewy frway frwy fwy',
  'GDN|garden|gardn grden grdn gdn',
  'GDNS|gardens|gdns grdns',
  'GTWY|gateway|gatewy gatway gtway gtwy',
  'GLN|glen|gln',
  'GLNS|glens|glns',
  'GRN|green|grn',
  'GRNS|greens|grns',
  'GRV|grove|grov grv',
  'GRVS|groves|grvs',
  'HBR|harbor|harb harbr hbr hrbor harbour',
  'HBRS|harbors|hbrs',
  'HVN|haven|hvn',
  'HTS|heights|hgts ht hts height',
  'HWY|highway|highwy hiway hiwy hway hwy',
  'HL|hill|hl',
  'HLS|hills|hls',
  'HOLW|hollow|hllw holw hollows holws',
  'INLT|inlet|inlt',
  'IS|island|is islnd',
  'ISS|islands|islnds iss',
  'ISLE|isle|isles',
  'JCT|junction|jct jction jctn junctn juncton',
  'JCTS|junctions|jcts jctns',
  'KY|key|ky',
  'KYS|keys|kys',
  'KNL|knoll|knl knol',
  'KNLS|knolls|knls',
  'LK|lake|lk',
  'LKS|lakes|lks',
  'LAND|land|land',
  'LNDG|landing|lndg lndng',
  'LN|lane|ln',
  'LGT|light|lgt',
  'LGTS|lights|lgts',
  'LF|loaf|lf',
  'LCK|lock|lck',
  'LCKS|locks|lcks',
  'LDG|lodge|ldg ldge lodg',
  'LOOP|loop|loops',
  'MALL|mall|mall',
  'MNR|manor|mnr',
  'MNRS|manors|mnrs',
  'MDW|meadow|mdw',
  'MDWS|meadows|mdws medows',
  'MEWS|mews|mews',
  'ML|mill|ml',
  'MLS|mills|mls',
  'MSN|mission|missn mssn msn',
  'MTWY|motorway|mtwy',
  'MT|mount|mnt mt',
  'MTN|mountain|mntain mntn mountin mtin mtn',
  'MTNS|mountains|mntns mtns',
  'NCK|neck|nck',
  'ORCH|orchard|orch orchrd',
  'OVAL|oval|ovl',
  'OPAS|overpass|opas',
  'PARK|park|prk parks',
  'PKWY|parkway|parkwy pkway pkwy pkwys parkways',
  'PASS|pass|pass',
  'PSGE|passage|psge',
  'PATH|path|paths',
  'PIKE|pike|pikes',
  'PNE|pine|pne',
  'PNES|pines|pnes',
  'PL|place|pl',
  'PLN|plain|pln',
  'PLNS|plains|plns plaines',
  'PLZ|plaza|plz plza',
  'PT|point|pt',
  'PTS|points|pts',
  'PRT|port|prt',
  'PRTS|ports|prts',
  'PR|prairie|pr prr',
  'RADL|radial|rad radiel radl',
  'RAMP|ramp|ramp',
  'RNCH|ranch|rnch rnchs ranches',
  'RPD|rapid|rpd',
  'RPDS|rapids|rpds',
  'RST|rest|rst',
  'RDG|ridge|rdg rdge',
  'RDGS|ridges|rdgs',
  'RIV|river|riv rvr rivr',
  'RD|road|rd',
  'RDS|roads|rds',
  'RTE|route|rte',
  'ROW|row|row',
  'RUE|rue|rue',
  'RUN|run|run',
  'SHL|shoal|shl',
  'SHLS|shoals|shls',
  'SHR|shore|shoar shr',
  'SHRS|shores|shoars shrs',
  'SKWY|skyway|skwy',
  'SPG|spring|spg spng sprng',
  'SPGS|springs|spgs spngs sprngs',
  'SPUR|spur|spurs',
  'SQ|square|sq sqr sqre squ',
  'SQS|squares|sqrs sqs',
  'STA|station|sta statn stn',
  'STRA|stravenue|stra strav straven stravn strvn strvnue',
  'STRM|stream|streme strm',
  'ST|street|st str strt',
  'STS|streets|sts',
  'SMT|summit|smt sumit sumitt',
  'TER|terrace|ter terr',
  'TRWY|throughway|trwy',
  'TRCE|trace|trce traces',
  'TRAK|track|trak trk trks tracks',
  'TRFY|trafficway|trfy',
  'TRL|trail|trl trls trails',
  'TRLR|trailer|trlr trlrs',
  'TUNL|tunnel|tunel tunl tunls tunnels tunnl',
  'TPKE|turnpike|trnpk turnpk tpke',
  'UPAS|underpass|upas',
  'UN|union|un',
  'UNS|unions|uns',
  'VLY|valley|vally vlly vly',
  'VLYS|valleys|vlys',
  'VIA|viaduct|vdct via viadct',
  'VW|view|vw',
  'VWS|views|vws',
  'VLG|village|vill villag villg villiage vlg',
  'VLGS|villages|vlgs',
  'VL|ville|vl',
  'VIS|vista|vis vist vst vsta',
  'WALK|walk|walks',
  'WALL|wall|wall',
  'WAY|way|wy',
  'WAYS|ways|ways',
  'WL|well|wl',
  'WLS|wells|wls',
]

/**
 * Appendix C2, directionals.
 *
 * Spanish is included because this platform's referral forms are filled in by
 * bilingual intake staff, and "Norte" reaches them typed as often as spoken. It
 * costs eight entries.
 */
const DIRECTIONAL_ROWS: readonly string[] = [
  'N|north|n norte',
  'S|south|s sur',
  'E|east|e este',
  'W|west|w oeste',
  'NE|northeast|ne noreste',
  'NW|northwest|nw noroeste',
  'SE|southeast|se sureste sudeste',
  'SW|southwest|sw suroeste sudoeste',
]

/**
 * Appendix C2, secondary unit designators.
 *
 * These matter to a geocoder for exactly one reason: they mark where the street
 * name stops. "1531 SE 17th St Unit 101" has to reduce to "SE 17TH ST", because
 * no register holds a point called "17th St Unit 101" and the whole query would
 * miss.
 */
const DESIGNATOR_ROWS: readonly string[] = [
  'APT|apartment|apt aptmnt',
  'BSMT|basement|bsmt',
  'BLDG|building|bldg',
  'DEPT|department|dept',
  'FL|floor|fl flr',
  'FRNT|front|frnt',
  'HNGR|hangar|hngr',
  'KEY|key|key',
  'LBBY|lobby|lbby',
  'LOT|lot|lot',
  'LOWR|lower|lowr',
  'OFC|office|ofc',
  'PH|penthouse|ph',
  'PIER|pier|pier',
  'REAR|rear|rear',
  'RM|room|rm',
  'SIDE|side|side',
  'SLIP|slip|slip',
  'SPC|space|spc',
  'STOP|stop|stop',
  'STE|suite|ste',
  'TRLR|trailer|trlr',
  'UNIT|unit|unit unt',
  'UPPR|upper|uppr',
]

interface Tables {
  /** Every recognised spelling, lower-cased, to the USPS abbreviation. */
  toAbbreviation: Map<string, string>
  /** The USPS abbreviation to its full English word, lower-cased. */
  toFullWord: Map<string, string>
}

function build(rows: readonly string[]): Tables {
  const toAbbreviation = new Map<string, string>()
  const toFullWord = new Map<string, string>()

  for (let i = 0; i < rows.length; i++) {
    const [standard, full, others] = rows[i].split('|')

    toAbbreviation.set(standard.toLowerCase(), standard)
    toAbbreviation.set(full, standard)
    toFullWord.set(standard, full)

    if (!others) continue
    const variants = others.split(' ')
    for (let j = 0; j < variants.length; j++) {
      if (variants[j]) toAbbreviation.set(variants[j], standard)
    }
  }

  return { toAbbreviation, toFullWord }
}

const SUFFIXES = build(SUFFIX_ROWS)
const DIRECTIONS = build(DIRECTIONAL_ROWS)
const DESIGNATORS = build(DESIGNATOR_ROWS)

export const STREET_SUFFIXES: ReadonlyMap<string, string> = SUFFIXES.toAbbreviation
export const DIRECTIONALS: ReadonlyMap<string, string> = DIRECTIONS.toAbbreviation
export const UNIT_DESIGNATORS: ReadonlyMap<string, string> = DESIGNATORS.toAbbreviation

/**
 * Designators that stand alone, with no number after them.
 *
 * The distinction is load-bearing. "100 Main St Rear" ends at a designator, so a
 * parser insisting on a following number would leave "Rear" glued to the street
 * name. "100 Main St Apt" with nothing after it, on the other hand, is a
 * truncated address, and the word should stay put rather than be silently
 * dropped.
 */
export const STANDALONE_DESIGNATORS: ReadonlySet<string> = new Set([
  'BSMT',
  'FRNT',
  'LBBY',
  'LOWR',
  'OFC',
  'PH',
  'REAR',
  'SIDE',
  'UPPR',
])

/** The USPS abbreviation for a suffix spelling, or null if it is not one. */
export function canonicalSuffix(token: string): string | null {
  return SUFFIXES.toAbbreviation.get(token.toLowerCase()) ?? null
}

/** The USPS abbreviation for a directional, or null. */
export function canonicalDirectional(token: string): string | null {
  return DIRECTIONS.toAbbreviation.get(token.toLowerCase()) ?? null
}

/** The USPS abbreviation for a unit designator, or null. */
export function canonicalDesignator(token: string): string | null {
  return DESIGNATORS.toAbbreviation.get(token.toLowerCase()) ?? null
}

/**
 * The full English word for a suffix spelling: "st" and "ST" both give "STREET".
 *
 * The reverse direction, and the reason it exists: Manatee County stores
 * `62ND STREET CIR E`. A parser that could only abbreviate would look for
 * `62ND ST CIR E` and find nothing, which is precisely the miss the client
 * reported.
 */
export function expandSuffix(token: string): string | null {
  const abbreviation = SUFFIXES.toAbbreviation.get(token.toLowerCase())
  if (!abbreviation) return null
  const full = SUFFIXES.toFullWord.get(abbreviation)
  return full ? full.toUpperCase() : null
}

/** The full English word for a directional: "E" and "e" both give "EAST". */
export function expandDirectional(token: string): string | null {
  const abbreviation = DIRECTIONS.toAbbreviation.get(token.toLowerCase())
  if (!abbreviation) return null
  const full = DIRECTIONS.toFullWord.get(abbreviation)
  return full ? full.toUpperCase() : null
}
