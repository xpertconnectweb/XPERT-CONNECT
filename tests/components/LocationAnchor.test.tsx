import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LocationAnchor } from '@/components/search/LocationAnchor'

const ORLANDO = {
  street: '1000 Legion Pl',
  city: 'Orlando',
  state: 'FL',
  postcode: '32801',
}

describe('LocationAnchor', () => {
  it('splits the address so the recognisable part is its own line', () => {
    render(<LocationAnchor label="ignored" address={ORLANDO} onClear={() => {}} />)
    expect(screen.getByText('1000 Legion Pl')).toBeVisible()
    expect(screen.getByText('Orlando, FL 32801')).toBeVisible()
  })

  /**
   * The bug this whole component exists to fix: the chip showed Nominatim's
   * raw label, so searching "3200 SW 34th St, Gainesville, FL 32608" came back
   * reading "3200, Southwest 34th Street, Daysville" — a neighbourhood the
   * user never typed, with their city and ZIP dropped.
   */
  it('shows the city and ZIP the user typed', () => {
    render(
      <LocationAnchor
        label="3200, Southwest 34th Street, Daysville"
        address={{ street: '3200 Southwest 34th Street', city: 'Gainesville', state: 'FL', postcode: '32608' }}
        onClear={() => {}}
      />
    )
    expect(screen.getByText('Gainesville, FL 32608')).toBeVisible()
    expect(screen.queryByText(/Daysville/)).toBeNull()
  })

  it('promotes the city line when a ZIP search has no street', () => {
    render(
      <LocationAnchor
        label="Orlando, FL 32801"
        address={{ street: null, city: 'Orlando', state: 'FL', postcode: '32801' }}
        onClear={() => {}}
      />
    )
    // One line, not an empty primary above a populated secondary.
    expect(screen.getByText('Orlando, FL 32801')).toBeVisible()
  })

  it('falls back to the plain label when there are no components', () => {
    render(<LocationAnchor label="My Location" address={null} onClear={() => {}} />)
    expect(screen.getByText('My Location')).toBeVisible()
  })

  it('offers a labelled way out', async () => {
    const onClear = vi.fn()
    const user = userEvent.setup()
    render(<LocationAnchor label="Orlando, FL" onClear={onClear} />)
    await user.click(screen.getByRole('button', { name: /clear location/i }))
    expect(onClear).toHaveBeenCalled()
  })

  it('keeps the testid the deep-link spec asserts on', () => {
    render(<LocationAnchor label="Orlando, FL" onClear={() => {}} />)
    expect(screen.getByTestId('map-search-chip')).toBeVisible()
    // Distinct from the box's own clear button, which keeps `map-search-clear`.
    expect(screen.getByTestId('map-search-anchor-clear')).toBeVisible()
  })
})

/**
 * Once the pin is draggable the row has a second job: admitting the pin is no
 * longer where the search put it. On a general-purpose map nobody needs that;
 * here the anchor decides which clinics count as nearest for one specific
 * client, so an accidental drag would re-rank the list with nothing on screen
 * saying so.
 */
describe('LocationAnchor, once the pin can move', () => {
  it('says nothing about adjustment until the pin is moved', () => {
    render(<LocationAnchor label="Orlando, FL" onClear={() => {}} />)
    expect(screen.queryByText(/pin adjusted/i)).toBeNull()
    expect(screen.queryByTestId('map-anchor-reset')).toBeNull()
  })

  it('admits the pin was moved, and offers the way back', async () => {
    const onReset = vi.fn()
    const user = userEvent.setup()
    render(
      <LocationAnchor label="Custom location" onClear={() => {}} adjusted onReset={onReset} />
    )
    expect(screen.getByText(/pin adjusted/i)).toBeVisible()
    await user.click(screen.getByTestId('map-anchor-reset'))
    expect(onReset).toHaveBeenCalled()
  })

  it('offers no undo when there is nothing to go back to', () => {
    // Geolocated rather than searched: there is no original address.
    render(<LocationAnchor label="My Location" onClear={() => {}} adjusted />)
    expect(screen.getByText(/pin adjusted/i)).toBeVisible()
    expect(screen.queryByTestId('map-anchor-reset')).toBeNull()
  })

  it('holds the adjustment notice back while the new address resolves', () => {
    // Announcing "adjusted · Undo" against a label that is still "Adjusting…"
    // invites an undo of something the user cannot see yet.
    render(<LocationAnchor label="Adjusting…" onClear={() => {}} adjusted resolving onReset={() => {}} />)
    expect(screen.queryByText(/pin adjusted/i)).toBeNull()
  })
})
