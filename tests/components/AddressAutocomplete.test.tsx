import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddressAutocomplete } from '@/components/search/AddressAutocomplete'
import { __clearGeocodeCache } from '@/hooks/useGeocoder'
import type { GeocodeSuggestion } from '@/types/geocode'

/**
 * The one address field, used by the clinic form, the lawyer form and the
 * referral form.
 *
 * All three used to be a bare `<input>` with a placeholder reading "Street,
 * City, State, ZIP", and the admin ones asked for latitude and longitude
 * alongside as two number fields. This is the contract that replaces them.
 */

const ORLANDO: GeocodeSuggestion = {
  id: 'nom-1',
  label: '1000 Legion Pl, Orlando, FL 32801',
  fullLabel: '1000 Legion Pl, Orlando, Orange County, Florida, 32801, United States',
  address: { street: '1000 Legion Pl', city: 'Orlando', state: 'FL', postcode: '32801' },
  county: 'Orange County',
  kind: 'address',
  precision: 'rooftop',
  providerId: 'nominatim',
  placeId: 'nom-1',
  lat: 28.5383,
  lng: -81.3792,
  bbox: null,
  needsResolve: false,
}

const ZIP_ONLY: GeocodeSuggestion = {
  ...ORLANDO,
  id: 'nom-2',
  label: 'Orlando, FL 32801',
  precision: 'zip',
  kind: 'zip',
}

const fetchMock = vi.fn()
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })

beforeEach(() => {
  vi.clearAllMocks()
  __clearGeocodeCache()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function setup(overrides: Partial<React.ComponentProps<typeof AddressAutocomplete>> = {}) {
  const props = {
    label: 'Client Address',
    value: '',
    onChange: vi.fn(),
    onResolved: vi.fn(),
    'data-testid': 'client-address',
    ...overrides,
  }
  const view = render(<AddressAutocomplete {...props} />)
  return { ...props, view, user: userEvent.setup() }
}

describe('the field itself', () => {
  it('gives the combobox a visible label that focuses it', async () => {
    // `SmartSearchBox` has no visible label of its own — the map's accessible
    // name comes from aria-label, because its placeholder is contextual and a
    // changing placeholder is not a label. A form field needs the real thing.
    const { user } = setup()
    await user.click(screen.getByText('Client Address'))
    expect(screen.getByRole('combobox')).toHaveFocus()
  })

  it('marks a required field', () => {
    setup({ required: true })
    expect(screen.getByText('*')).toBeVisible()
  })

  it('namespaces its test ids away from the map', () => {
    // The default in `SmartSearchBox` is `map-search`, and three E2E specs plus
    // a component test drive the map through `map-search-input`. An unlabelled
    // instance on an admin page would start resolving those selectors, and the
    // failures would look like map bugs.
    setup()
    expect(screen.getByTestId('client-address-input')).toBeVisible()
    expect(screen.queryByTestId('map-search-input')).toBeNull()
  })
})

describe('choosing an address', () => {
  it('emits the flat shape the database stores', async () => {
    fetchMock.mockResolvedValue(ok([ORLANDO]))
    // Declared here rather than taken from setup()'s return: the override
    // widens the property's type to "mock OR plain function", and `.mock` only
    // exists on the first arm.
    const onResolved = vi.fn()
    const { user, onChange } = setup({ value: '1000 Legion Pl', onResolved })

    await waitFor(() => expect(screen.getByTestId('client-address-option')).toBeVisible())
    await user.click(screen.getByTestId('client-address-option'))

    await waitFor(() => expect(onResolved).toHaveBeenCalled())
    expect(onResolved.mock.calls[0][0]).toMatchObject({
      street: '1000 Legion Pl',
      city: 'Orlando',
      state: 'FL',
      zip: '32801',
      county: 'Orange County',
      lat: 28.5383,
      lng: -81.3792,
      provider: 'nominatim',
      precision: 'rooftop',
    })
    // The visible text becomes the canonical form, not what was typed.
    expect(onChange).toHaveBeenCalledWith(ORLANDO.fullLabel)
  })

  it('shows the coordinates and the precision once resolved', () => {
    setup({
      value: '1000 Legion Pl, Orlando, FL 32801',
      resolved: {
        formatted: '1000 Legion Pl, Orlando, FL 32801',
        street: '1000 Legion Pl',
        city: 'Orlando',
        state: 'FL',
        zip: '32801',
        county: null,
        lat: 28.5383,
        lng: -81.3792,
        placeId: 'nom-1',
        provider: 'nominatim',
        precision: 'rooftop',
      },
    })

    const line = screen.getByTestId('client-address-resolved')
    expect(line).toHaveTextContent('28.53830')
    expect(line).toHaveTextContent('rooftop')
    expect(line).not.toHaveTextContent('drag the pin')
  })

  it('warns when the point is only approximate', () => {
    // A ZIP centroid and a rooftop hit used to render identically, so someone
    // searching a client's home could be handed the middle of a postcode with
    // no way to tell — and then measure "the nearest clinic" from it.
    setup({
      value: 'Orlando, FL 32801',
      resolved: {
        formatted: 'Orlando, FL 32801',
        street: null,
        city: 'Orlando',
        state: 'FL',
        zip: '32801',
        county: null,
        lat: 28.5383,
        lng: -81.3792,
        placeId: 'nom-2',
        provider: 'nominatim',
        precision: 'zip',
      },
    })

    expect(screen.getByTestId('client-address-resolved')).toHaveTextContent('drag the pin')
  })

  it('flags an approximate suggestion before it is chosen, not after', async () => {
    fetchMock.mockResolvedValue(ok([ZIP_ONLY]))
    setup({ value: 'Orlando' })

    await waitFor(() => expect(screen.getByTestId('client-address-option')).toBeVisible())
    expect(screen.getByTestId('client-address-option')).toHaveTextContent('Approximate')
  })
})

describe('when the address cannot be found', () => {
  it('says which one failed, instead of rendering nothing', async () => {
    // The old behaviour: the group vanished. No message, no movement, no way to
    // tell whether it was broken, slow, or being honest.
    fetchMock.mockResolvedValue(ok([]))
    setup({ value: '862 62nd St Cir E, Bradenton, FL' })

    await waitFor(() =>
      expect(screen.getByTestId('client-address-group-empty')).toBeVisible()
    )
    expect(screen.getByTestId('client-address-group-empty')).toHaveTextContent('62nd St Cir E')
  })

  it('says "keep typing" below the geocoder minimum, not "no match"', async () => {
    setup({ value: 'ba' })
    await waitFor(() => expect(screen.getByTestId('client-address-group-idle')).toBeVisible())
    expect(screen.queryByTestId('client-address-group-empty')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('distinguishes an outage from a miss', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => ({}) })
    setup({ value: '1000 Legion Pl' })
    await waitFor(() =>
      expect(screen.getByTestId('client-address-group-error')).toBeVisible()
    )
  })

  it('keeps the typed text when a resolve fails', async () => {
    // A transient network failure must not look like the user mistyping.
    fetchMock.mockResolvedValueOnce(ok([{ ...ORLANDO, needsResolve: true, lat: null, lng: null }]))
    fetchMock.mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({}) })

    const { user, onChange, onResolved } = setup({ value: '1000 Legion Pl' })
    await waitFor(() => expect(screen.getByTestId('client-address-option')).toBeVisible())
    await user.click(screen.getByTestId('client-address-option'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(onResolved).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('editing after choosing', () => {
  it('drops the resolved point, so a stale coordinate cannot be saved', async () => {
    // Otherwise someone could pick "123 Main St", edit it to "456 Main St",
    // save, and store the second address against the first one's coordinates.
    const resolved = {
      formatted: '1000 Legion Pl, Orlando, FL 32801',
      street: '1000 Legion Pl',
      city: 'Orlando',
      state: 'FL',
      zip: '32801',
      county: null,
      lat: 28.5383,
      lng: -81.3792,
      placeId: 'nom-1',
      provider: 'nominatim' as const,
      precision: 'rooftop' as const,
    }
    const { user, onResolved } = setup({ value: '1000 Legion Pl, Orlando, FL 32801', resolved })

    await user.type(screen.getByTestId('client-address-input'), '2')
    expect(onResolved).toHaveBeenCalledWith(null)
  })
})
