import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Segmented } from '@/components/ui/Segmented'

const RADIUS = [
  { value: 'any', label: 'Any', 'aria-label': 'Any distance' },
  { value: '5', label: '5 mi', 'aria-label': 'Within 5 miles' },
  { value: '10', label: '10 mi', 'aria-label': 'Within 10 miles' },
  { value: '25', label: '25 mi', 'aria-label': 'Within 25 miles' },
] as const

function setup(value: string = 'any') {
  const onChange = vi.fn()
  const user = userEvent.setup()
  const view = render(
    <Segmented options={RADIUS} value={value} onChange={onChange} label="Search radius" />
  )
  return { onChange, user, view }
}

describe('Segmented', () => {
  it('is one named group of radios, not a pile of toggles', () => {
    setup()
    const group = screen.getByRole('radiogroup', { name: 'Search radius' })
    expect(group).toBeVisible()
    expect(screen.getAllByRole('radio')).toHaveLength(4)
  })

  it('marks exactly one option as checked', () => {
    setup('10')
    expect(screen.getByRole('radio', { name: 'Within 10 miles' })).toBeChecked()
    expect(screen.getAllByRole('radio').filter((r) => r.getAttribute('aria-checked') === 'true'))
      .toHaveLength(1)
  })

  it('exposes the group as a single tab stop', () => {
    setup('5')
    // Roving tabindex: tabbing into the group lands on the current value, and
    // the arrows move from there. Four separate tab stops for one setting is
    // what this replaces.
    expect(screen.getByRole('radio', { name: 'Within 5 miles' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('radio', { name: 'Any distance' })).toHaveAttribute('tabindex', '-1')
  })

  it('moves the selection with the arrow keys', async () => {
    const { onChange, user } = setup('any')
    await user.tab()
    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenCalledWith('5')
  })

  it('wraps around at both ends', async () => {
    const { onChange, user } = setup('any')
    await user.tab()
    await user.keyboard('{ArrowLeft}')
    expect(onChange).toHaveBeenCalledWith('25')
  })

  it('jumps to the ends with Home and End', async () => {
    const { onChange, user } = setup('10')
    await user.tab()
    await user.keyboard('{End}')
    expect(onChange).toHaveBeenCalledWith('25')
    await user.keyboard('{Home}')
    expect(onChange).toHaveBeenCalledWith('any')
  })

  it('still responds to a plain click', async () => {
    const { onChange, user } = setup('any')
    await user.click(screen.getByRole('radio', { name: 'Within 25 miles' }))
    expect(onChange).toHaveBeenCalledWith('25')
  })

  it('is not a tablist, because there are no tabpanels', () => {
    setup()
    expect(screen.queryByRole('tablist')).toBeNull()
  })
})
