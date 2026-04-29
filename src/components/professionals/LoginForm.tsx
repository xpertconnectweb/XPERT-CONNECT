'use client'

import { useState, useRef, useEffect } from 'react'
import { signIn, getSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Lock, User, AlertCircle, Loader2, ArrowLeft, Shield, ChevronRight } from 'lucide-react'

export function LoginForm() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const usernameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    usernameRef.current?.focus()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await signIn('credentials', {
      username,
      password,
      redirect: false,
    })

    if (result?.error) {
      setError('Invalid username or password')
      setPassword('')
      setLoading(false)
    } else {
      const session = await getSession()
      if (session?.user?.role === 'admin') {
        router.push('/admin/dashboard')
      } else if (session?.user?.role === 'partner') {
        router.push('/partners/map')
      } else if (session?.user?.role === 'referrer') {
        router.push('/professionals/refer')
      } else {
        router.push('/professionals/map')
      }
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex bg-[#0a1628]">
      {/* Left side — decorative panel (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden items-center justify-center">
        {/* Gradient background */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #0f1d35 0%, #1a2a4a 40%, #243756 70%, #1a2a4a 100%)' }} />

        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-[0.03]" style={{ background: 'radial-gradient(circle, #d4a84b, transparent 70%)' }} />
        <div className="absolute bottom-20 left-20 w-72 h-72 rounded-full opacity-[0.04]" style={{ background: 'radial-gradient(circle, #d4a84b, transparent 70%)' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.02]" style={{ background: 'radial-gradient(circle, #ffffff, transparent 60%)' }} />

        {/* Grid pattern overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

        {/* Content */}
        <div className="relative z-10 px-16 max-w-lg">
          <Image
            src="/images/logo.png"
            alt="Xpert Connect"
            width={200}
            height={56}
            className="h-14 w-auto brightness-0 invert mb-12 opacity-90"
            priority
          />

          <h2 className="text-4xl font-heading font-bold text-white leading-tight mb-4">
            Welcome to the<br />
            <span style={{ color: '#d4a84b' }}>Professionals</span> Area
          </h2>
          <p className="text-white/40 text-base leading-relaxed mb-10">
            Access your dashboard to manage referrals, track clients, and connect with our network of professionals across Florida and Minnesota.
          </p>

          {/* Feature highlights */}
          <div className="space-y-4">
            {[
              { label: 'Real-time Referral Tracking', desc: 'Monitor your referrals from submission to completion' },
              { label: 'Secure & Confidential', desc: 'Enterprise-grade security for sensitive data' },
              { label: 'Multi-State Network', desc: 'Connect with providers across FL and MN' },
            ].map((item) => (
              <div key={item.label} className="flex items-start gap-3 group">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ background: 'rgba(212, 168, 75, 0.15)' }}>
                  <ChevronRight className="h-3.5 w-3.5" style={{ color: '#d4a84b' }} />
                </div>
                <div>
                  <p className="text-sm font-medium text-white/80">{item.label}</p>
                  <p className="text-xs text-white/30 mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom attribution */}
        <div className="absolute bottom-8 left-16">
          <p className="text-[11px] text-white/20">&copy; {new Date().getFullYear()} Xpert Connect. All rights reserved.</p>
        </div>
      </div>

      {/* Right side — login form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 relative">
        {/* Subtle background texture */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0f1d35] to-[#0a1628]" />

        <div className="relative z-10 w-full max-w-sm">
          {/* Mobile logo (hidden on desktop) */}
          <div className="lg:hidden text-center mb-10">
            <Image
              src="/images/logo.png"
              alt="Xpert Connect"
              width={160}
              height={45}
              className="h-11 w-auto mx-auto brightness-0 invert mb-5 opacity-90"
              priority
            />
            <h1 className="font-heading text-xl font-bold text-white">Professionals Area</h1>
            <p className="text-white/40 text-sm mt-1.5">Sign in to access your dashboard</p>
          </div>

          {/* Desktop heading */}
          <div className="hidden lg:block mb-8">
            <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-4" style={{ background: 'rgba(212, 168, 75, 0.1)', border: '1px solid rgba(212, 168, 75, 0.15)' }}>
              <Shield className="h-3 w-3" style={{ color: '#d4a84b' }} />
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#d4a84b' }}>Secure Login</span>
            </div>
            <h1 className="font-heading text-2xl font-bold text-white mb-1.5">Sign in to your account</h1>
            <p className="text-white/35 text-sm">Enter your credentials to continue</p>
          </div>

          {/* Login Card */}
          <div className="rounded-2xl p-7" style={{ background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.08)', backdropFilter: 'blur(20px)' }}>
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }} role="alert">
                  <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                  <span className="text-red-300">{error}</span>
                </div>
              )}

              <div>
                <label htmlFor="username" className="block text-sm font-medium text-white/60 mb-2">
                  Username
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-white/25" aria-hidden="true" />
                  <input
                    ref={usernameRef}
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoComplete="username"
                    className="w-full rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 transition-all duration-200"
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = 'rgba(212, 168, 75, 0.5)'
                      e.target.style.boxShadow = '0 0 0 3px rgba(212, 168, 75, 0.1)'
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                      e.target.style.boxShadow = 'none'
                    }}
                    placeholder="Enter your username"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-white/60 mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-white/25" aria-hidden="true" />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 transition-all duration-200"
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = 'rgba(212, 168, 75, 0.5)'
                      e.target.style.boxShadow = '0 0 0 3px rgba(212, 168, 75, 0.1)'
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                      e.target.style.boxShadow = 'none'
                    }}
                    placeholder="Enter your password"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl px-4 py-3.5 font-heading text-sm font-bold uppercase tracking-wider text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all duration-300 hover:-translate-y-0.5"
                style={{
                  background: 'linear-gradient(135deg, #d4a84b 0%, #c49a3f 50%, #b8903a 100%)',
                  boxShadow: loading ? 'none' : '0 8px 24px -4px rgba(212, 168, 75, 0.35)',
                }}
                onMouseEnter={(e) => {
                  if (!loading) (e.target as HTMLElement).style.boxShadow = '0 12px 32px -4px rgba(212, 168, 75, 0.5)'
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.boxShadow = '0 8px 24px -4px rgba(212, 168, 75, 0.35)'
                }}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>
          </div>

          {/* Back link */}
          <div className="text-center mt-8">
            <Link
              href="/"
              className="group inline-flex items-center gap-1.5 text-white/25 text-sm hover:text-white/50 transition-colors duration-200"
            >
              <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
              Back to Xpert Connect
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
