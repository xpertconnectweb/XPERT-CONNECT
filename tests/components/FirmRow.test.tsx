import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FirmRow } from '@/components/directory/FirmRow'

/**
 * A row fed the OLD listing shape — contact details included. That is
 * what a stale cache served the landing page for an hour on 2026-09-30.
 */
const STALE = {
  id: 'l-1',
  name: 'Czaia Law',
  address: '862 62nd St Cir E #101, Bradenton, FL 34208',
  phone: '(941) 592-0845',
  website: 'https://czaialaw.com/',
  practiceAreas: ['Personal Injury'],
  city: 'Bradenton',
  county: 'Manatee',
}

function renderRow(props: Partial<Parameters<typeof FirmRow>[0]>) {
  return render(
    <ul>
      <FirmRow firm={STALE} {...props} />
    </ul>
  )
}

describe('FirmRow', () => {
  it('public row: no phone, website or address even when the data carries them', () => {
    const { container } = renderRow({ onRequestInfo: vi.fn() })
    expect(container.querySelector('a[href^="tel:"]')).toBeNull()
    expect(screen.queryByText('(941) 592-0845')).toBeNull()
    expect(screen.queryByText(/Manatee Ave|62nd St/)).toBeNull()
    expect(screen.queryByRole('link', { name: /website/i })).toBeNull()
    expect(screen.getByTestId('firm-request-info')).toBeInTheDocument()
    // What the client asked to keep.
    expect(screen.getByText('Czaia Law')).toBeInTheDocument()
    expect(screen.getByText('Bradenton')).toBeInTheDocument()
    expect(screen.getByText('Personal Injury')).toBeInTheDocument()
  })

  it('gated row (no lead form): still shows the contact details', () => {
    const { container } = renderRow({})
    expect(container.querySelector('a[href="tel:9415920845"]')).not.toBeNull()
    expect(screen.getByRole('link', { name: /website of czaia law/i })).toHaveAttribute(
      'href',
      'https://czaialaw.com/'
    )
  })

  it('never renders a javascript: website as a link', () => {
    render(
      <ul>
        <FirmRow firm={{ ...STALE, website: 'javascript:alert(1)' }} />
      </ul>
    )
    expect(screen.queryByRole('link', { name: /website/i })).toBeNull()
  })
})
