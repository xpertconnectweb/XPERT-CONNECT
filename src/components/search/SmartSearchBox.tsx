'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, MutableRefObject, Ref } from 'react'
import {
  Search, X, Loader2, MapPin, Building2, Scale, Clock, Tag, AlertTriangle,
  Landmark, Mailbox, Building, Map, Crosshair,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { splitOnMatch } from '@/lib/search/highlight'
import {
  flattenSuggestions,
  groupStatus,
  type Suggestion,
  type SuggestionGroup,
} from './types'
import type { GeocodeKind } from '@/types/geocode'

/**
 * The single search box.
 *
 * Replaces the two unrelated inputs the map used to have — a geocoder that
 * moved the map and a substring filter that filtered the pins — which left
 * people guessing which one to type into.
 *
 * Implements the WAI-ARIA 1.2 combobox pattern. Two details matter and are
 * easy to get wrong:
 *
 *  - Options are `div[role="option"]`, not `<button>`. Buttons inside a
 *    listbox are invalid ARIA and steal focus; focus must stay on the input
 *    with `aria-activedescendant` doing the pointing.
 *  - `activeIndex` starts at -1, so Enter runs the text search the user
 *    actually typed. Pre-selecting the first suggestion meant Enter
 *    teleported the map to whatever the geocoder guessed.
 */

export interface SmartSearchBoxProps {
  value: string
  onChange: (value: string) => void
  /** Enter with no suggestion highlighted: search for the literal text. */
  onSubmit: (value: string) => void
  onSelect: (suggestion: Suggestion) => void
  /** Dismiss a suggestion, e.g. drop one entry from the search history. */
  onRemove?: (suggestion: Suggestion) => void
  groups: SuggestionGroup[]
  /** Number of results behind the current query, announced politely. */
  resultCount?: number
  loading?: boolean
  placeholder?: string
  /**
   * The accessible name. Separate from `placeholder` on purpose: the map makes
   * its placeholder contextual ("Filter these 16 results…"), and a placeholder
   * that changes with state is not a label.
   */
  'aria-label'?: string
  autoFocus?: boolean
  className?: string
  /** DOM id for the input, so a form can point a visible `<label>` at it. */
  inputId?: string
  /**
   * A handle on the input, for callers that need to focus it from outside.
   *
   * The map binds `/` and Cmd-K to it. A ref rather than reaching through
   * `inputId` and `getElementById`, which would work and would quietly
   * repurpose a prop whose whole job is `<label htmlFor>`.
   */
  inputRef?: Ref<HTMLInputElement>
  /**
   * What to emphasise inside each suggestion. Defaults to `value`.
   *
   * A prop rather than reading `value` directly so a caller can pass `''` and
   * switch it off. This component is shared by the map, the attorney
   * directory, the specialists list and every address field in the
   * application; a change that is right on three of them and merely arguable
   * on the fourth should be a prop, not a fait accompli.
   */
  highlight?: string
  'data-testid'?: string
}

/** How long a lookup must run before the spinner is worth showing. */
const SPINNER_DELAY_MS = 300

const ICON_FOR: Record<Suggestion['kind'], typeof Search> = {
  recent: Clock,
  place: MapPin,
  entity: Building2,
  category: Tag,
  manual: Crosshair,
}

/**
 * `/api/geocode` already classifies every place — a ZIP, a city, a street
 * address and a landmark arrive tagged. The dropdown was giving all four the
 * same generic pin, so the one piece of information that tells you how wide a
 * result is went unused.
 */
const ICON_FOR_PLACE: Record<GeocodeKind, typeof Search> = {
  address: MapPin,
  poi: Landmark,
  zip: Mailbox,
  city: Building,
  region: Map,
}

function iconFor(suggestion: Suggestion) {
  if (suggestion.kind === 'entity' && suggestion.sublabel === 'Attorney') return Scale
  if (suggestion.payload.kind === 'place') return ICON_FOR_PLACE[suggestion.payload.suggestion.kind]
  return ICON_FOR[suggestion.kind]
}

/**
 * A non-selectable line explaining why a group has no rows.
 *
 * `role="presentation"` is the load-bearing part, and it is the same reason the
 * outage warning has always used it: `flattenSuggestions` — which drives every
 * index in the keyboard navigation — contains only `items`, so anything
 * rendered here has to be invisible to the arrow keys. Making one of these
 * focusable would put a dead stop in the middle of the list.
 */
/**
 * Emphasises the part of a label the query is responsible for.
 *
 * A `<mark>` with no background, because the browser default is a yellow
 * highlighter pen and this is a product, not a search-results page from 1998.
 * Weight and colour carry it. `<mark>` rather than a `<span>` because the
 * element means 'marked for reference in another context', which is exactly
 * what this is, and screen readers can be told about it.
 *
 * Splitting a label into several text nodes does not change `textContent`, so
 * `getByText` and Playwright text selectors keep resolving.
 */
function Marked({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  return (
    <>
      {splitOnMatch(text, query).map((segment, i) =>
        segment.hit ? (
          <mark key={i} className="bg-transparent p-0 font-bold text-navy">
            {segment.text}
          </mark>
        ) : (
          <span key={i}>{segment.text}</span>
        )
      )}
    </>
  )
}

function StatusRow({
  testId,
  tone,
  text,
}: {
  testId: string
  tone: 'muted' | 'warning'
  text: string
}) {
  return (
    <div
      role="presentation"
      data-testid={testId}
      className={cn(
        'mx-2 my-1 flex items-start gap-2 rounded-lg px-2.5 py-2 text-[11px] leading-snug',
        tone === 'warning' ? 'bg-amber-50 text-amber-800' : 'bg-gray-50 text-gray-500'
      )}
    >
      {tone === 'warning' && (
        <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      <span>{text}</span>
    </div>
  )
}

export function SmartSearchBox({
  value,
  onChange,
  onSubmit,
  onSelect,
  onRemove,
  groups,
  resultCount,
  loading = false,
  placeholder = 'Search by name, specialty, city or ZIP...',
  'aria-label': ariaLabel = 'Search providers by name, specialty, city or ZIP',
  autoFocus = false,
  highlight,
  className,
  inputId,
  inputRef: externalInputRef,
  'data-testid': testId = 'map-search',
}: SmartSearchBoxProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement | null>(null)

  /**
   * One node, two refs. The internal one drives focus and blur here; the
   * external one lets a caller focus the field. A callback ref rather than
   * `useImperativeHandle` because the caller wants the element itself, not a
   * bespoke handle.
   */
  const setInputRef = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node
      if (typeof externalInputRef === 'function') externalInputRef(node)
      else if (externalInputRef) (externalInputRef as MutableRefObject<HTMLInputElement | null>).current = node
    },
    [externalInputRef]
  )
  const listRef = useRef<HTMLUListElement>(null)
  const baseId = useId()

  const listboxId = `${baseId}-listbox`
  const hintId = `${baseId}-hint`

  const flat = useMemo(() => flattenSuggestions(groups), [groups])
  const hasItems = flat.length > 0
  const anyLoading = loading || groups.some((g) => g.loading)
  // An error with no items still has something to say, so it counts as content.
  const anyError = groups.some((g) => g.error)
  const expanded = open && (hasItems || anyLoading || anyError)

  // Show the spinner only once a lookup has run long enough to be worth
  // acknowledging. Most resolve from cache in well under this, and rendering a
  // spinner for 40ms per keystroke reads as a glitch rather than as progress.
  const [showSpinner, setShowSpinner] = useState(false)
  useEffect(() => {
    if (!anyLoading) {
      setShowSpinner(false)
      return
    }
    const timer = setTimeout(() => setShowSpinner(true), SPINNER_DELAY_MS)
    return () => clearTimeout(timer)
  }, [anyLoading])

  // What the suggestions emphasise. The typed text unless a caller overrides,
  // including with '' to switch emphasis off entirely.
  const emphasis = highlight ?? value

  // Any change to the suggestion set invalidates the highlight. Resetting to
  // -1 rather than 0 keeps Enter meaning "search what I typed".
  useEffect(() => {
    setActiveIndex(-1)
  }, [flat.length, value])

  // Keep the highlighted option in view without moving focus off the input.
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const close = useCallback(() => {
    setOpen(false)
    setActiveIndex(-1)
  }, [])

  const commit = useCallback(
    (suggestion: Suggestion) => {
      onSelect(suggestion)
      close()
    },
    [onSelect, close]
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      const count = flat.length

      switch (event.key) {
        case 'ArrowDown':
          if (!count) return
          event.preventDefault()
          setOpen(true)
          setActiveIndex((i) => (i + 1 >= count ? -1 : i + 1))
          return
        case 'ArrowUp':
          if (!count) return
          event.preventDefault()
          setOpen(true)
          setActiveIndex((i) => (i - 1 < -1 ? count - 1 : i - 1))
          return
        case 'Home':
          if (!count || !expanded) return
          event.preventDefault()
          setActiveIndex(0)
          return
        case 'End':
          if (!count || !expanded) return
          event.preventDefault()
          setActiveIndex(count - 1)
          return
        case 'Enter': {
          event.preventDefault()
          const active = activeIndex >= 0 ? flat[activeIndex] : undefined
          if (active) commit(active)
          else {
            onSubmit(value)
            close()
          }
          return
        }
        case 'Escape':
          // First press closes the list, second clears the query — the
          // behaviour people already expect from every other search box.
          event.preventDefault()
          if (expanded) close()
          else if (value) onChange('')
          return
        case 'Delete':
        case 'Backspace': {
          // Keyboard parity for the dismiss affordance, which cannot be a
          // focusable button inside a listbox option. Only fires while a
          // removable row is highlighted, so it never eats an ordinary
          // backspace in the input.
          const target = activeIndex >= 0 ? flat[activeIndex] : undefined
          if (!target?.removable || !onRemove) return
          event.preventDefault()
          onRemove(target)
          setActiveIndex(-1)
          return
        }
        case 'Tab':
          close()
          return
        default:
      }
    },
    [flat, activeIndex, expanded, value, commit, onSubmit, onChange, onRemove, close]
  )

  const handleBlur = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      // Only close when focus actually left the widget. Cheaper and less racy
      // than a document-level mousedown listener.
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close()
    },
    [close]
  )

  let renderIndex = -1

  return (
    <div className={cn('relative', className)} onBlur={handleBlur}>
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 z-10 pointer-events-none" />

      <input
        ref={setInputRef}
        // Only set when a caller renders a visible <label htmlFor>. The map has
        // no visible label — its accessible name comes from `aria-label`,
        // because its placeholder is contextual and a changing placeholder is
        // not a label — but a form field does, and clicking that label has to
        // focus this input.
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          activeIndex >= 0 && flat[activeIndex] ? `${baseId}-opt-${flat[activeIndex].id}` : undefined
        }
        aria-describedby={hintId}
        aria-label={ariaLabel}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        data-testid={`${testId}-input`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        className="w-full rounded-xl bg-gray-50/80 py-2.5 pl-10 pr-9 text-sm text-gray-900 placeholder:text-gray-400 border border-gray-200/40 focus:outline-none focus:ring-2 focus:ring-navy/15 focus:bg-white transition-all"
      />

      {/* One trailing slot, never two.
          The spinner used to sit beside the clear button, so the corner of the
          box held two competing icons and the layout shifted every time a
          lookup started. Now the spinner takes the same slot, and it only
          appears once a lookup has been slow enough to be worth mentioning —
          below that it flickered on and off with every keystroke. */}
      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center">
        {showSpinner ? (
          <span
            role="status"
            aria-label="Searching"
            data-testid={`${testId}-loading`}
            className="block h-4 w-4 rounded-full border-2 border-gray-200 border-t-navy animate-spin motion-reduce:animate-none"
          />
        ) : (
          value && (
            <button
              type="button"
              onClick={() => {
                onChange('')
                inputRef.current?.focus()
              }}
              aria-label="Clear search"
              data-testid={`${testId}-clear`}
              className="flex h-6 w-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200/60 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/30 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )
        )}
      </div>

      <span id={hintId} className="sr-only">
        Results update as you type. Use the arrow keys to browse suggestions and Enter to choose one.
      </span>

      {/* The only place a screen reader is told how many results there are. */}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {typeof resultCount === 'number'
          ? `${resultCount} ${resultCount === 1 ? 'result' : 'results'}`
          : ''}
      </p>

      <ul
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label="Search suggestions"
        data-testid={`${testId}-listbox`}
        className={cn(
          'absolute z-[501] top-full left-0 right-0 mt-2 max-h-[22rem] overflow-y-auto rounded-xl bg-white shadow-2xl shadow-black/[0.12] border border-gray-200/60 py-1',
          !expanded && 'hidden'
        )}
      >
        {groups.map((group) => {
          const status = groupStatus(group)
          // Drop a group only when it has nothing at all to say: no rows, and
          // no state worth explaining. A group that declares no `status` is a
          // local source, and hiding it when empty is what keeps the list
          // tight — "Specialties (none)" is noise.
          //
          // The places group always declares one, because it is the group whose
          // silence people were misreading. "We have never heard of that
          // address" and "you have not typed enough to ask yet" both used to
          // render as nothing at all, so the only feedback was a dropdown that
          // quietly shrank, and users retyped addresses that were already right.
          if (group.status === undefined && status === 'empty') return null
          if (status === 'ok' && group.items.length === 0) return null

          const headingId = `${baseId}-grp-${group.key}`
          return (
            <li key={group.key} role="group" aria-labelledby={headingId}>
              <div
                id={headingId}
                role="presentation"
                className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400"
              >
                {group.heading}
              </div>

              {/* None of these are options: keyboard navigation must skip
                  straight past them, and `flat` — which drives every index —
                  never contains them. */}
              {status === 'idle' && group.items.length === 0 && (
                <StatusRow
                  testId={`${testId}-group-idle`}
                  tone="muted"
                  text="Keep typing to search addresses."
                />
              )}

              {status === 'empty' && (
                <StatusRow
                  testId={`${testId}-group-empty`}
                  tone="muted"
                  text={group.emptyHint ?? 'No matches.'}
                />
              )}

              {status === 'rate_limited' && group.items.length === 0 && (
                <StatusRow
                  testId={`${testId}-group-error`}
                  tone="warning"
                  text="Too many lookups just now. Try again in a moment."
                />
              )}

              {status === 'error' && group.items.length === 0 && (
                <StatusRow
                  testId={`${testId}-group-error`}
                  tone="warning"
                  text="Address lookup is unavailable. Keep typing to search by name, or try again shortly."
                />
              )}

              {status === 'loading' && group.items.length === 0
                ? // Reserve the row height so the list does not jump when a
                  // slower source (the geocoder) resolves under the cursor.
                  Array.from({ length: 2 }, (_, i) => (
                    <div key={i} className="mx-2 my-1 h-9 animate-pulse rounded-lg bg-gray-100" />
                  ))
                : group.items.map((item) => {
                    renderIndex += 1
                    const index = renderIndex
                    const active = index === activeIndex
                    const Icon = iconFor(item)
                    return (
                      <div
                        key={item.id}
                        id={`${baseId}-opt-${item.id}`}
                        role="option"
                        aria-selected={active}
                        data-index={index}
                        data-testid={`${testId}-option`}
                        // Keep focus on the input: a blur here would close the
                        // list before the click ever lands.
                        onMouseDown={(e) => e.preventDefault()}
                        // Deliberately no `onMouseEnter={() => setActiveIndex(index)}`.
                        // It let the pointer drive `aria-activedescendant`: arrow
                        // down twice, brush the mouse on the way to nothing in
                        // particular, and Enter committed whatever the cursor
                        // happened to be over. On a place row that is a network
                        // resolve and a map that teleports. The visual hover is
                        // CSS below, and clicks pass `item` directly.
                        onClick={(e) => {
                          // The dismiss affordance lives inside the option
                          // rather than as a nested <button>, which would be
                          // invalid inside a listbox and would steal focus.
                          if (
                            item.removable &&
                            (e.target as HTMLElement).closest('[data-remove]')
                          ) {
                            onRemove?.(item)
                            return
                          }
                          commit(item)
                        }}
                        className={cn(
                          'group flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm transition-colors',
                          active ? 'bg-navy/[0.06]' : 'hover:bg-gray-50/80'
                        )}
                      >
                        <Icon
                          className={cn(
                            'h-3.5 w-3.5 shrink-0',
                            active ? 'text-navy' : 'text-gray-300'
                          )}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              'block truncate font-medium',
                              active ? 'text-navy' : 'text-gray-700'
                            )}
                          >
                            <Marked text={item.label} query={emphasis} />
                          </span>
                          {item.sublabel && (
                            <span className="block truncate text-[11px] text-gray-400">
                              <Marked text={item.sublabel} query={emphasis} />
                            </span>
                          )}
                        </span>
                        {item.meta && (
                          <span
                            className={cn(
                              'shrink-0 text-[11px] tabular-nums',
                              item.metaTone === 'warning'
                                ? 'font-medium text-amber-600'
                                : 'text-gray-400'
                            )}
                          >
                            {item.meta}
                          </span>
                        )}
                        {item.removable && (
                          <span
                            data-remove
                            data-testid={`${testId}-remove`}
                            title="Remove from history"
                            className={cn(
                              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-gray-300 transition-colors hover:bg-gray-200/70 hover:text-gray-600',
                              // Visible on touch, where there is no hover, and
                              // whenever the row is the active option.
                              'opacity-100 sm:opacity-0 sm:group-hover:opacity-100',
                              active && 'sm:opacity-100'
                            )}
                          >
                            <X className="h-3 w-3" aria-hidden="true" />
                          </span>
                        )}
                      </div>
                    )
                  })}

              {/* Data-source credit. A LICENCE TERM, not a courtesy: Geoapify's
                  free plan permits commercial use on the condition that this is
                  shown, and OSM's ODbL requires the same. Deleting it is a
                  breach that nothing at runtime will ever flag.

                  `role="presentation"` for the same reason as the status rows —
                  `flattenSuggestions` drives every keyboard index and contains
                  only `items`, so anything else here must be invisible to the
                  arrow keys. */}
              {group.attribution && group.items.length > 0 && (
                <div
                  role="presentation"
                  data-testid={`${testId}-attribution`}
                  className="px-3 pb-1.5 pt-1 text-[10px] text-gray-400"
                >
                  {group.attribution}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
