import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { signIn, getCsrfToken } = vi.hoisted(() => ({
  signIn: vi.fn(),
  getCsrfToken: vi.fn(),
}))

vi.mock('next-auth/react', () => ({ signIn, getCsrfToken }))
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) =>
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img {...(props as { alt: string })} />,
}))
vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

import { LoginForm } from '@/components/professionals/LoginForm'

/** The shape NextAuth returns for a CSRF token mismatch. */
const CSRF_MISMATCH = {
  ok: true,
  error: null,
  status: 200,
  url: 'http://localhost:3000/api/auth/signin?csrf=true',
}

const SUCCESS = {
  ok: true,
  error: null,
  status: 200,
  url: 'http://localhost:3000',
}

const BAD_PASSWORD = {
  ok: false,
  error: 'CredentialsSignin',
  status: 401,
  url: null,
}

const assign = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  getCsrfToken.mockResolvedValue('a-token')
  Object.defineProperty(window, 'location', {
    value: { assign, href: 'http://localhost:3000/professionals/login' },
    writable: true,
  })
})

async function submit() {
  const user = userEvent.setup()
  render(<LoginForm />)
  await user.type(screen.getByLabelText('Username'), 'admin_xpert')
  await user.type(screen.getByLabelText('Password'), 'hunter2')
  await user.click(screen.getByRole('button', { name: /sign in/i }))
  return user
}

describe('signing in', () => {
  it('navigates once the credentials are accepted', async () => {
    signIn.mockResolvedValue(SUCCESS)
    await submit()
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/professionals'))
  })

  it('reports a wrong password as a wrong password', async () => {
    signIn.mockResolvedValue(BAD_PASSWORD)
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid username or password'
    )
    expect(assign).not.toHaveBeenCalled()
  })

  /**
   * The bug this pins: two `GET /api/auth/session` requests raced at
   * mount, each minting a CSRF token 23 ms apart, and the POST carried
   * the one the cookie no longer held. NextAuth answers that with a
   * redirect to `signin?csrf=true` rather than an error — so a correct
   * password was reported as "Invalid username or password", and
   * retyping it could not possibly help.
   */
  it('retries a CSRF mismatch instead of blaming the password', async () => {
    signIn.mockResolvedValueOnce(CSRF_MISMATCH).mockResolvedValueOnce(SUCCESS)

    await submit()

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/professionals'))
    expect(signIn).toHaveBeenCalledTimes(2)
    // The cookie is settled between the two attempts, so the second
    // carries a token that matches it.
    expect(getCsrfToken).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('retries only once, rather than spinning on a broken deployment', async () => {
    signIn.mockResolvedValue(CSRF_MISMATCH)

    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(/session expired/i)
    expect(signIn).toHaveBeenCalledTimes(2)
    expect(assign).not.toHaveBeenCalled()
  })

  it('does not call the password wrong when it was the handshake', async () => {
    signIn.mockResolvedValue(CSRF_MISMATCH)
    await submit()
    expect(await screen.findByRole('alert')).not.toHaveTextContent(
      'Invalid username or password'
    )
  })

  it('survives signIn throwing outright', async () => {
    signIn.mockRejectedValue(new Error('network down'))
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent(/sign-in failed/i)
  })
})
