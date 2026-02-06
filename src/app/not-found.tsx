import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy px-4 text-center">
      <h1 className="font-heading text-7xl font-bold text-gold mb-4">404</h1>
      <h2 className="font-heading text-2xl font-bold text-white mb-4">
        Page Not Found
      </h2>
      <p className="text-white/70 mb-8 max-w-md">
        The page you are looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-full bg-gold px-8 py-4 font-heading text-sm font-bold uppercase tracking-wide text-white transition-all hover:bg-gold-dark"
      >
        Back to Home
      </Link>
    </div>
  )
}
