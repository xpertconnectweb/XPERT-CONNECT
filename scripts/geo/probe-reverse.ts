/**
 * Drags the pin, against production, and reports WHO answered.
 *
 * The companion to `probe.ts`, which types addresses. This one asks the other
 * question — what is at this point — and the column that matters is the
 * provider: the whole case for Phase C is that the coordinates of a
 * personal-injury client's home stop leaving the building, and the only way to
 * see whether they do is to look at which engine replied.
 *
 *   npx tsx scripts/geo/probe-reverse.ts
 *   npx tsx scripts/geo/probe-reverse.ts --base=https://preview-url
 *
 * Reuses the session cookie the E2E setup writes to `.auth/lawyer.json`, the
 * same way `probe.ts` does, because `/api/geocode` requires one — deliberately.
 * If it is missing or expired:
 *
 *   E2E_BASE_URL=<base> npx dotenv -e .env.test -- npx playwright test --project=setup
 */
import { readFile } from 'node:fs/promises'

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
const BASE = (arg('base') ?? 'https://www.844xpert.com').replace(/\/$/, '')

interface Case {
  name: string
  lat: number
  lng: number
  want: string
}

const CASES: Case[] = [
  {
    name: 'el edificio de CZAIA LAW',
    lat: 27.491257,
    lng: -82.481824,
    want: 'la dirección exacta que reportó el cliente, por el motor propio',
  },
  {
    name: 'a 15 m de ese portal',
    lat: 27.4913917,
    lng: -82.481824,
    want: 'el mismo portal: 15 m está dentro de NUMBER_M',
  },
  {
    // No "the street without a number": 120 m north of 862 puts the pin next
    // to State Road 64, which has a door of its own within NUMBER_M. Naming it
    // is right. The rule is about the nearest door on ANY street, not about
    // the street the probe started from -- an earlier version of this line
    // said otherwise and would have read a correct answer as a violation.
    name: 'a 120 m de ese portal',
    lat: 27.4923374,
    lng: -82.481824,
    want: 'el portal más cercano de cualquier calle, no el de la de partida',
  },
  {
    name: 'en mitad de un campo, Wakulla FL',
    lat: 30.2,
    lng: -84.45,
    want: 'la calle sin número, o nada — aquí no hay portal que reclamar',
  },
  { name: 'centro de Miami', lat: 25.774, lng: -80.194, want: 'motor propio' },
  { name: 'centro de Minneapolis', lat: 44.9778, lng: -93.265, want: 'motor propio' },
  { name: 'rural, Aitkin MN', lat: 46.5319, lng: -93.7099, want: 'motor propio' },
  {
    name: 'Filadelfia, fuera de cobertura',
    lat: 39.9526,
    lng: -75.1652,
    want: 'otro estado — Geoapify, y eso está bien',
  },
  {
    name: 'mar abierto',
    lat: 26.5,
    lng: -84.5,
    want: 'sin registro; la cadena pasa a Geoapify',
  },
]

interface StoredCookie {
  name: string
  value: string
  domain: string
}

async function cookieHeader(): Promise<string> {
  const raw = await readFile('.auth/lawyer.json', 'utf8')
  const state = JSON.parse(raw) as { cookies: StoredCookie[] }
  return state.cookies.map((c) => `${c.name}=${c.value}`).join('; ')
}

async function main() {
  let cookie: string
  try {
    cookie = await cookieHeader()
  } catch {
    console.error(
      '\n  No hay sesión en .auth/lawyer.json. Genérala con:\n' +
        `    E2E_BASE_URL=${BASE} npx dotenv -e .env.test -- npx playwright test --project=setup\n`
    )
    process.exit(1)
  }

  console.log(`\n  ${BASE}   ${CASES.length} arrastres\n`)

  const byProvider = new Map<string, number>()

  for (const c of CASES) {
    const started = Date.now()
    const res = await fetch(`${BASE}/api/geocode?lat=${c.lat}&lng=${c.lng}`, {
      headers: { cookie },
    })
    const ms = Date.now() - started

    console.log(`  ${c.name}`)
    console.log(`      quiero: ${c.want}`)

    if (!res.ok) {
      console.log(`      HTTP ${res.status}  ${(await res.text()).slice(0, 120)}\n`)
      continue
    }

    /**
     * A bare array, not `{ results: [...] }`.
     *
     * The two halves of `/api/geocode` do not answer in the same shape:
     * autocomplete wraps its suggestions, reverse returns the list directly.
     * An earlier version of this file assumed the wrapper and reported eight
     * empty answers against a production that was answering all eight
     * correctly — which is a worse failure than crashing would have been,
     * because it looked like a finding.
     */
    const body = (await res.json()) as Array<{
      fullLabel?: string
      label?: string
      precision?: string
      providerId?: string
    }>
    const hit = Array.isArray(body) ? body[0] : undefined

    if (!hit) {
      console.log(`      → nada  (${ms} ms)\n`)
      byProvider.set('sin respuesta', (byProvider.get('sin respuesta') ?? 0) + 1)
      continue
    }

    const provider = hit.providerId ?? '?'
    byProvider.set(provider, (byProvider.get(provider) ?? 0) + 1)
    console.log(`      → ${hit.fullLabel || hit.label}`)
    console.log(
      `        ${(hit.precision ?? '?').padEnd(13)} ${provider.padEnd(11)} ${ms} ms\n`
    )
  }

  console.log('  ' + '─'.repeat(70))
  console.log(
    '  respondió: ' +
      Array.from(byProvider.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} ${v}`)
        .join(' · ')
  )
  console.log(
    '\n  Lo que hay que mirar: los seis primeros deben decir `selfhosted`.\n' +
      '  Cualquiera de ellos en `geoapify` significa que las coordenadas de un\n' +
      '  domicilio siguen saliendo fuera, que es exactamente lo que esta fase\n' +
      '  existía para arreglar.\n'
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
