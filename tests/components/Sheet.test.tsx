import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Sheet, type SheetSnap } from '@/components/ui/Sheet'

/**
 * The sheet is hand-rolled (no vaul, no framer-motion), so its snap logic and
 * its keyboard affordance are worth pinning. jsdom reports every element as
 * 0x0, which is exactly why the drag maths is tested through the controlled
 * `snap` prop rather than by simulating pixel movement.
 */

function Harness({ initial = 'peek' as SheetSnap, onSnapChange = vi.fn() }) {
  const [snap, setSnap] = useState<SheetSnap>(initial)
  return (
    <div style={{ height: 800 }}>
      <Sheet
        snap={snap}
        onSnapChange={(next) => {
          setSnap(next)
          onSnapChange(next)
        }}
        handleLabel={<span>12 results</span>}
      >
        <p>Result list</p>
      </Sheet>
    </div>
  )
}

const handle = () => screen.getByRole('button', { name: /resize results panel/i })

describe('structure', () => {
  it('exposes itself as a labelled dialog', () => {
    render(<Harness />)
    expect(screen.getByRole('dialog', { name: 'Results' })).toBeInTheDocument()
  })

  it('renders the handle label and the content', () => {
    render(<Harness />)
    expect(screen.getByText('12 results')).toBeVisible()
    expect(screen.getByText('Result list')).toBeVisible()
  })

  it('announces the current snap point on the handle', () => {
    render(<Harness initial="half" />)
    expect(handle()).toHaveAccessibleName(/currently half/i)
  })
})

describe('keyboard control', () => {
  it('steps up and down through the snap points', async () => {
    const onSnapChange = vi.fn()
    const user = userEvent.setup()
    render(<Harness onSnapChange={onSnapChange} />)

    await user.tab()
    expect(handle()).toHaveFocus()

    await user.keyboard('{ArrowUp}')
    expect(onSnapChange).toHaveBeenLastCalledWith('half')

    await user.keyboard('{ArrowUp}')
    expect(onSnapChange).toHaveBeenLastCalledWith('full')

    await user.keyboard('{ArrowDown}')
    expect(onSnapChange).toHaveBeenLastCalledWith('half')
  })

  it('does not step past either end', async () => {
    const onSnapChange = vi.fn()
    const user = userEvent.setup()
    render(<Harness onSnapChange={onSnapChange} />)

    handle().focus()
    await user.keyboard('{ArrowDown}')
    // Already at peek, so nothing changes.
    expect(handle()).toHaveAccessibleName(/currently peek/i)

    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}')
    expect(handle()).toHaveAccessibleName(/currently full/i)
  })

  it('Enter toggles between collapsed and full', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    handle().focus()

    await user.keyboard('{Enter}')
    expect(handle()).toHaveAccessibleName(/currently full/i)

    await user.keyboard('{Enter}')
    expect(handle()).toHaveAccessibleName(/currently peek/i)
  })

  it('is reachable by keyboard at all, so the sheet is never drag-only', () => {
    render(<Harness />)
    expect(handle()).toHaveAttribute('tabIndex', '0')
  })
})

describe('drag surface', () => {
  it('opts out of native scrolling on the handle only', () => {
    render(<Harness />)
    // The list underneath must still scroll normally.
    expect(handle()).toHaveStyle({ touchAction: 'none' })
    expect(screen.getByText('Result list').parentElement).not.toHaveStyle({
      touchAction: 'none',
    })
  })
})
