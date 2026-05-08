import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClinicReferralFormModal } from '@/components/professionals/ClinicReferralFormModal'

const fakeLawyer = {
  id: 'l-001',
  name: 'Big Firm',
  region: 'Miami-Dade',
  county: 'Miami-Dade',
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 'ref-new' }),
    })
  )
})

describe('ClinicReferralFormModal', () => {
  it('renders the lawyer header when pre-selected', () => {
    render(
      <ClinicReferralFormModal lawyer={fakeLawyer} onClose={() => {}} />
    )
    expect(
      screen.getByRole('heading', { name: /Refer to Specialist/i })
    ).toBeInTheDocument()
    expect(screen.getByText('Big Firm')).toBeInTheDocument()
    // No specialist picker should be rendered when lawyer is pre-selected
    expect(
      screen.queryByRole('combobox', { name: /Specialist/i })
    ).not.toBeInTheDocument()
  })

  it('shows specialist picker when no lawyer is pre-selected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [fakeLawyer],
      })
    )
    render(<ClinicReferralFormModal onClose={() => {}} />)
    expect(
      await screen.findByRole('combobox', { name: /Specialist/i })
    ).toBeInTheDocument()
  })

  it('calls Escape closes the modal', async () => {
    const onClose = vi.fn()
    render(<ClinicReferralFormModal lawyer={fakeLawyer} onClose={onClose} />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('submits required fields and fires onCreated', async () => {
    const onCreated = vi.fn()
    const onClose = vi.fn()
    render(
      <ClinicReferralFormModal
        lawyer={fakeLawyer}
        onClose={onClose}
        onCreated={onCreated}
      />
    )

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/Patient Name/i), 'John Doe')
    await user.type(screen.getByLabelText(/Patient Phone/i), '305-555-0000')
    await user.selectOptions(
      screen.getByLabelText(/Case Type/i),
      'Auto Accident'
    )

    await user.click(screen.getByRole('button', { name: /Send Referral/i }))

    await waitFor(() => expect(onCreated).toHaveBeenCalled())

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({
      lawyerId: 'l-001',
      patientName: 'John Doe',
      patientPhone: '305-555-0000',
      caseType: 'Auto Accident',
    })
  })

  it('shows server error when POST fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Custom server error' }),
      })
    )
    render(<ClinicReferralFormModal lawyer={fakeLawyer} onClose={() => {}} />)

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/Patient Name/i), 'John Doe')
    await user.type(screen.getByLabelText(/Patient Phone/i), '305-555-0000')
    await user.selectOptions(
      screen.getByLabelText(/Case Type/i),
      'Auto Accident'
    )
    await user.click(screen.getByRole('button', { name: /Send Referral/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Custom server error'
    )
  })

  it('does not fire onCreated when POST fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'boom' }),
      })
    )
    const onCreated = vi.fn()
    render(
      <ClinicReferralFormModal
        lawyer={fakeLawyer}
        onClose={() => {}}
        onCreated={onCreated}
      />
    )

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/Patient Name/i), 'John Doe')
    await user.type(screen.getByLabelText(/Patient Phone/i), '305-555-0000')
    await user.selectOptions(
      screen.getByLabelText(/Case Type/i),
      'Auto Accident'
    )
    await user.click(screen.getByRole('button', { name: /Send Referral/i }))

    await screen.findByRole('alert')
    expect(onCreated).not.toHaveBeenCalled()
  })
})
