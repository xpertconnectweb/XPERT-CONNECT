import { describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SmartSearchBox } from '@/components/search/SmartSearchBox'
import type { Suggestion, SuggestionGroup } from '@/components/search/types'

const place = (id: string, label: string): Suggestion => ({
  id,
  kind: 'place',
  label,
  payload: { kind: 'place', lat: 28.5, lng: -81.3, label, placeKind: 'city', bbox: null },
})

const entity = (id: string, label: string): Suggestion => ({
  id,
  kind: 'entity',
  label,
  sublabel: 'Clinic',
  payload: { kind: 'entity', id },
})

const GROUPS: SuggestionGroup[] = [
  { key: 'providers', heading: 'Providers', items: [entity('c-1', 'Newlin Chiropractic')] },
  { key: 'places', heading: 'Places', items: [place('p-1', 'Orlando, FL'), place('p-2', 'Ocala, FL')] },
]

function setup(overrides: Partial<React.ComponentProps<typeof SmartSearchBox>> = {}) {
  const props = {
    value: 'orl',
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    onSelect: vi.fn(),
    groups: GROUPS,
    ...overrides,
  }
  render(<SmartSearchBox {...props} />)
  return { ...props, user: userEvent.setup() }
}

const combobox = () => screen.getByRole('combobox')

describe('combobox semantics', () => {
  it('exposes the ARIA combobox contract', () => {
    setup()
    const input = combobox()
    expect(input).toHaveAttribute('aria-autocomplete', 'list')
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input).toHaveAttribute('aria-controls')
    expect(input).toHaveAttribute('aria-describedby')
  })

  it('expands on focus and collapses on Escape', async () => {
    const { user } = setup()
    await user.click(combobox())
    expect(combobox()).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')
    expect(combobox()).toHaveAttribute('aria-expanded', 'false')
  })

  it('renders options as role=option, never as buttons', async () => {
    // Buttons inside a listbox are invalid ARIA and steal focus from the input.
    const { user } = setup()
    await user.click(combobox())
    const listbox = screen.getByRole('listbox')
    expect(within(listbox).getAllByRole('option')).toHaveLength(3)
    expect(within(listbox).queryByRole('button')).toBeNull()
  })

  it('labels each group', async () => {
    const { user } = setup()
    await user.click(combobox())
    const groups = screen.getAllByRole('group')
    expect(groups).toHaveLength(2)
    expect(groups[0]).toHaveAccessibleName('Providers')
    expect(groups[1]).toHaveAccessibleName('Places')
  })

  it('announces the result count politely', () => {
    setup({ resultCount: 42 })
    expect(screen.getByRole('status')).toHaveTextContent('42 results')
  })

  it('uses the singular for one result', () => {
    setup({ resultCount: 1 })
    expect(screen.getByRole('status')).toHaveTextContent('1 result')
  })
})

describe('keyboard navigation', () => {
  it('points aria-activedescendant at the highlighted option', async () => {
    const { user } = setup()
    await user.click(combobox())
    expect(combobox()).not.toHaveAttribute('aria-activedescendant')

    await user.keyboard('{ArrowDown}')
    const activeId = combobox().getAttribute('aria-activedescendant')
    expect(activeId).toBeTruthy()
    expect(document.getElementById(activeId!)).toHaveAttribute('aria-selected', 'true')
  })

  it('keeps focus on the input while navigating', async () => {
    const { user } = setup()
    await user.click(combobox())
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(document.activeElement).toBe(combobox())
  })

  it('wraps past the end back to the typed text', async () => {
    const { user } = setup()
    await user.click(combobox())
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}')
    expect(combobox()).not.toHaveAttribute('aria-activedescendant')
  })

  it('ArrowUp from the input jumps to the last option', async () => {
    const { user, onSelect } = setup()
    await user.click(combobox())
    await user.keyboard('{ArrowUp}{Enter}')
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'p-2' }))
  })

  it('Home and End jump to the ends', async () => {
    const { user, onSelect } = setup()
    await user.click(combobox())
    await user.keyboard('{ArrowDown}{End}{Enter}')
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'p-2' }))
  })
})

describe('committing a search', () => {
  it('Enter with nothing highlighted searches the typed text', async () => {
    // Pre-selecting the first suggestion made Enter teleport the map to
    // whatever the geocoder happened to guess first.
    const { user, onSubmit, onSelect } = setup()
    await user.click(combobox())
    await user.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('orl')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('Enter with a highlighted option selects it', async () => {
    const { user, onSubmit, onSelect } = setup()
    await user.click(combobox())
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'c-1' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('clicking an option selects it and closes the list', async () => {
    const { user, onSelect } = setup()
    await user.click(combobox())
    await user.click(screen.getByText('Ocala, FL'))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'p-2' }))
    expect(combobox()).toHaveAttribute('aria-expanded', 'false')
  })

  it('a second Escape clears the query', async () => {
    const { user, onChange } = setup()
    await user.click(combobox())
    await user.keyboard('{Escape}')
    expect(onChange).not.toHaveBeenCalled()
    await user.keyboard('{Escape}')
    expect(onChange).toHaveBeenCalledWith('')
  })
})

describe('clear button', () => {
  it('clears the query and returns focus to the input', async () => {
    const { user, onChange } = setup()
    await user.click(screen.getByTestId('map-search-clear'))
    expect(onChange).toHaveBeenCalledWith('')
    expect(document.activeElement).toBe(combobox())
  })

  it('is absent when there is nothing to clear', () => {
    setup({ value: '' })
    expect(screen.queryByTestId('map-search-clear')).toBeNull()
  })
})

describe('removable suggestions', () => {
  const recent = (id: string, label: string): Suggestion => ({
    id,
    kind: 'recent',
    label,
    removable: true,
    payload: { kind: 'recent', query: label },
  })

  const RECENTS: SuggestionGroup[] = [
    {
      key: 'recent',
      heading: 'Recent searches',
      items: [recent('r-1', 'chiro orlando'), recent('r-2', '32501')],
    },
  ]

  it('offers a dismiss control on each history entry', async () => {
    const { user } = setup({ groups: RECENTS, value: '' })
    await user.click(combobox())
    expect(screen.getAllByTestId('map-search-remove')).toHaveLength(2)
  })

  it('removes the entry instead of searching for it', async () => {
    const onRemove = vi.fn()
    const { user, onSelect } = setup({ groups: RECENTS, value: '', onRemove })
    await user.click(combobox())

    await user.click(screen.getAllByTestId('map-search-remove')[0])
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 'r-1' }))
    // Clicking the X must not also run the search it sits on.
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('still selects the entry when the row itself is clicked', async () => {
    const onRemove = vi.fn()
    const { user, onSelect } = setup({ groups: RECENTS, value: '', onRemove })
    await user.click(combobox())

    await user.click(screen.getByText('chiro orlando'))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'r-1' }))
    expect(onRemove).not.toHaveBeenCalled()
  })

  it('keeps the listbox free of nested buttons', async () => {
    // A focusable control inside role="option" is invalid ARIA and steals
    // focus from the input, which the whole combobox pattern depends on.
    const { user } = setup({ groups: RECENTS, value: '' })
    await user.click(combobox())
    expect(within(screen.getByRole('listbox')).queryByRole('button')).toBeNull()
  })

  it('removes the highlighted entry with the Delete key', async () => {
    const onRemove = vi.fn()
    const { user } = setup({ groups: RECENTS, value: '', onRemove })
    await user.click(combobox())
    await user.keyboard('{ArrowDown}{Delete}')
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 'r-1' }))
  })

  it('leaves Backspace editing the text when nothing removable is highlighted', async () => {
    // The removal shortcut must not hijack the most-used key in a search box.
    const onRemove = vi.fn()
    const { user, onChange } = setup({ onRemove })
    await user.click(combobox())
    await user.keyboard('{Backspace}')
    expect(onRemove).not.toHaveBeenCalled()
    expect(onChange).toHaveBeenCalledWith('or')
  })
})

describe('loading state', () => {
  it('reserves rows for a group still in flight so the list does not jump', async () => {
    const { user } = setup({
      groups: [{ key: 'places', heading: 'Places', items: [], loading: true }],
    })
    await user.click(combobox())
    expect(screen.getByRole('listbox')).toBeVisible()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('holds the spinner back until a lookup is genuinely slow', async () => {
    // A spinner that blinks on for 40ms per keystroke reads as a glitch. It
    // also used to sit beside the clear button, so the corner held two
    // competing icons and the layout shifted on every lookup.
    vi.useFakeTimers()
    try {
      render(
        <SmartSearchBox
          value="chiro"
          onChange={vi.fn()}
          onSubmit={vi.fn()}
          onSelect={vi.fn()}
          groups={[{ key: 'places', heading: 'Places', items: [], loading: true }]}
        />
      )
      expect(screen.queryByTestId('map-search-loading')).toBeNull()
      // The clear button owns the slot until then.
      expect(screen.getByTestId('map-search-clear')).toBeVisible()

      await act(async () => {
        vi.advanceTimersByTime(350)
      })
      expect(screen.getByTestId('map-search-loading')).toBeVisible()
      expect(screen.queryByTestId('map-search-clear')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('hides a group that is neither loading nor populated', async () => {
    const { user } = setup({
      groups: [
        { key: 'empty', heading: 'Nothing', items: [] },
        { key: 'places', heading: 'Places', items: [place('p-9', 'Tampa, FL')] },
      ],
    })
    await user.click(combobox())
    expect(screen.queryByText('Nothing')).toBeNull()
    expect(screen.getByText('Places')).toBeVisible()
  })
})

/**
 * This used to be `describe('chip mode')`, asserting that a resolved location
 * REPLACED the input — `expect(queryByRole('combobox')).toBeNull()`. That was
 * the defect, written down as a guarantee: it meant that once you picked an
 * address you could no longer filter by name or specialty.
 *
 * The location now lives in a sibling `LocationAnchor`, so the box has no chip
 * mode at all and the combobox is unconditional.
 */
describe('the box never goes away', () => {
  it('renders the combobox with no location concept of its own', () => {
    setup()
    expect(screen.getByRole('combobox')).toBeVisible()
    expect(screen.queryByTestId('map-search-chip')).toBeNull()
  })

  it('keeps a single clear affordance, so the testid is unambiguous', async () => {
    // Both branches used to ship `data-testid="map-search-clear"`, mutually
    // exclusive only because of the early return.
    const { user } = setup({ value: 'chiro' })
    expect(screen.getAllByTestId('map-search-clear')).toHaveLength(1)
    await user.click(screen.getByTestId('map-search-clear'))
    expect(screen.getByRole('combobox')).toHaveFocus()
  })

  it('takes an accessible name independent of the placeholder', () => {
    setup({ placeholder: 'Filter these 16 results...', 'aria-label': 'Search providers' })
    expect(screen.getByRole('combobox', { name: 'Search providers' })).toBeVisible()
  })
})
