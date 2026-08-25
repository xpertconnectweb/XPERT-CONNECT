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
