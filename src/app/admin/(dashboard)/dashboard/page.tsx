'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts'
import {
  ChartLineUp, Stack, UserPlus, Buildings, Clock, Warning, CheckCircle, Scales, MapPin,
  ArrowsClockwise, Plus, PencilSimple, TrashSimple, Gear, ClipboardText, ChartBar, Bell,
} from '@phosphor-icons/react/dist/ssr'
import type { AdminStats, StatsRange } from '@/lib/admin-stats'
import { KpiTile } from '@/components/admin/dashboard/KpiTile'
import { SectionCard } from '@/components/admin/dashboard/SectionCard'
import { ChartCard } from '@/components/admin/dashboard/ChartCard'
import { AlertCard } from '@/components/admin/dashboard/AlertCard'
import { DateRangeControl } from '@/components/admin/dashboard/DateRangeControl'
import { DashboardSkeleton } from '@/components/admin/dashboard/skeletons'
import { cn } from '@/lib/utils'

// ── Formatting ────────────────────────────────────────────────────────────
const nf = new Intl.NumberFormat('en-US')
const RANGE_LABEL: Record<StatsRange, string> = {
  '7d': 'last 7 days',
  '30d': 'last 30 days',
  '90d': 'last 90 days',
  '12mo': 'last 12 months',
}

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

function updatedAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 30) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return `${h}h ago`
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function truncate(s: string, n: number): string {
  return s && s.length > n ? s.slice(0, n) + '…' : s
}

// ── Activity feed helpers ─────────────────────────────────────────────────
const ACTION_LABEL: Record<string, string> = {
  clinic_created: 'created a clinic', clinic_updated: 'updated a clinic', clinic_deleted: 'deleted a clinic',
  lawyer_created: 'created a lawyer', lawyer_updated: 'updated a lawyer', lawyer_deleted: 'deleted a lawyer',
  user_created: 'created a user', user_updated: 'updated a user', user_deleted: 'deleted a user',
  bulk_toggle_availability: 'toggled availability', bulk_delete: 'bulk deleted', settings_updated: 'updated settings',
  referral_created: 'created a referral for', referral_status_changed: 'changed referral status for',
  referral_deleted: 'deleted a referral for',
  referrer_referral_assigned: 'assigned a partner referral for',
  referrer_referral_updated: 'updated a partner referral for',
  referrer_referral_deleted: 'deleted a partner referral for',
}
function actionLabel(a: string): string { return ACTION_LABEL[a] || a.replace(/_/g, ' ') }
function actionIcon(a: string) {
  if (a.includes('created')) return Plus
  if (a.includes('deleted')) return TrashSimple
  if (a.includes('status')) return ArrowsClockwise
  if (a.includes('updated') || a.includes('toggle') || a.includes('settings') || a.includes('assigned')) return PencilSimple
  return Gear
}
function actionTone(a: string): string {
  if (a.includes('created')) return 'bg-emerald-50 text-emerald-600'
  if (a.includes('deleted')) return 'bg-red-50 text-red-500'
  if (a.includes('updated') || a.includes('toggle') || a.includes('status') || a.includes('assigned')) return 'bg-amber-50 text-amber-600'
  return 'bg-gray-100 text-gray-500'
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  received: { label: 'Received', cls: 'bg-blue-50 text-blue-700 ring-blue-600/10' },
  in_process: { label: 'In Process', cls: 'bg-amber-50 text-amber-700 ring-amber-600/10' },
  attended: { label: 'Attended', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/10' },
}

// ── Small visual building blocks ──────────────────────────────────────────
function ProportionRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        <span className="font-mono text-xs font-semibold text-navy tabular-nums">
          {nf.format(value)} <span className="text-gray-400">· {pct(value, total)}%</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct(value, total)}%`, background: color }} />
      </div>
    </div>
  )
}

function SegmentBar({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
        {total > 0 &&
          segments.map((s) => (
            <div key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} title={`${s.label}: ${s.value}`} />
          ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="truncate text-xs text-gray-500">{s.label}</span>
            <span className="ml-auto font-mono text-xs font-semibold text-navy tabular-nums">{nf.format(s.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RankedList({ items, color }: { items: { name: string; count: number }[]; color: string }) {
  const max = Math.max(1, ...items.map((i) => i.count))
  if (items.length === 0) return <p className="py-6 text-center text-sm text-gray-400">No data yet</p>
  return (
    <div className="space-y-2.5">
      {items.map((it) => (
        <div key={it.name} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-xs font-medium text-gray-600" title={it.name}>{it.name}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full" style={{ width: `${(it.count / max) * 100}%`, background: color }} />
          </div>
          <span className="w-8 shrink-0 text-right font-mono text-xs font-semibold text-navy tabular-nums">{it.count}</span>
        </div>
      ))}
    </div>
  )
}

interface TooltipProps { active?: boolean; label?: string | number; payload?: { value: number | string }[] }
function ChartTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-[11px] font-medium text-gray-400">{label}</p>
      <p className="font-mono text-sm font-bold text-navy tabular-nums">{payload[0].value} referrals</p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function AdminDashboardPage() {
  const [range, setRange] = useState<StatsRange>('30d')
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [error, setError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)

  const load = useCallback(async (r: StatsRange) => {
    setRefreshing(true)
    setError(false)
    try {
      const res = await fetch(`/api/admin/stats?range=${r}`)
      if (!res.ok) throw new Error('bad status')
      const data: AdminStats = await res.json()
      setStats(data)
      setFetchedAt(new Date().toISOString())
    } catch {
      setError(true)
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load(range) }, [range, load])

  if (!stats && !error) return <DashboardSkeleton />
  if (error && !stats) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <Warning className="h-8 w-8 text-red-400" weight="duotone" />
        <p className="text-sm text-gray-500">Couldn&apos;t load the dashboard.</p>
        <button onClick={() => load(range)} className="rounded-lg bg-navy px-4 py-2 text-xs font-semibold text-white hover:bg-navy-dark">
          Try again
        </button>
      </div>
    )
  }
  if (!stats) return null

  const { kpis, funnel, trend, mix, partner, network, topClinics, topLawyers, contacts, newsletter, alerts, recentReferrals, recentActivity } = stats
  const funnelTotal = funnel.received + funnel.inProcess + funnel.attended
  const trendEmpty = !trend.some((t) => t.count > 0)
  const trendSpark = trend.map((t) => t.count)

  const alertItems = [
    alerts.stuckReferrals > 0 && { count: alerts.stuckReferrals, label: 'Referrals stuck over 7 days', href: '/admin/referrals?status=received', tone: 'amber' as const, icon: Clock },
    alerts.partnerUnassigned > 0 && { count: alerts.partnerUnassigned, label: 'Partner referrals awaiting assignment', href: '/admin/referrer-referrals?status=pending', tone: 'blue' as const, icon: UserPlus },
    alerts.clinicsUnavailable > 0 && { count: alerts.clinicsUnavailable, label: 'Clinics currently unavailable', href: '/admin/clinics?availability=unavailable', tone: 'red' as const, icon: Warning },
  ].filter(Boolean) as { count: number; label: string; href: string; tone: 'amber' | 'blue' | 'red'; icon: typeof Clock }[]

  return (
    <div className={cn('space-y-6 font-sans transition-opacity duration-200', refreshing && 'opacity-70')}>
      {/* ── Header ── */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-navy">Overview</h1>
          <p className="mt-0.5 text-sm text-gray-400">
            Platform performance
            {fetchedAt && <> · updated {updatedAgo(fetchedAt)}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangeControl value={range} onChange={setRange} disabled={refreshing} />
          <button
            onClick={() => load(range)}
            disabled={refreshing}
            aria-label="Refresh"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200/80 bg-white text-gray-500 shadow-sm transition-colors hover:text-navy disabled:opacity-50"
          >
            <ArrowsClockwise className={cn('h-4 w-4', refreshing && 'animate-spin')} weight="bold" />
          </button>
          <Link
            href="/admin/users"
            className="hidden items-center gap-1.5 rounded-xl bg-navy px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-navy-dark sm:inline-flex"
          >
            <Plus className="h-4 w-4" weight="bold" /> New user
          </Link>
        </div>
      </header>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label={`Referrals · ${RANGE_LABEL[range]}`} value={kpis.referralsPeriod} delta={kpis.referralsDeltaPct} spark={trendSpark} icon={ChartLineUp} tone="navy" href="/admin/referrals" />
        <KpiTile label="Active pipeline" value={kpis.activePipeline} sub={`${funnel.received} new · ${funnel.inProcess} in process`} icon={Stack} tone="blue" href="/admin/referrals?status=received" />
        <KpiTile label="Partner referrals pending" value={kpis.partnerPending} sub={`${partner.total} total · ${partner.confirmedRate ?? 0}% confirmed`} icon={UserPlus} tone="gold" href="/admin/referrer-referrals?status=pending" />
        <KpiTile label="Clinics available" value={kpis.clinicsAvailable} sub={`of ${nf.format(kpis.clinicsTotal)} clinics`} icon={Buildings} tone="emerald" href="/admin/clinics?availability=available" />
      </div>

      {/* ── Alerts ── */}
      {alertItems.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {alertItems.map((a) => (
            <AlertCard key={a.label} count={a.count} label={a.label} href={a.href} tone={a.tone} icon={a.icon} />
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200/60 bg-emerald-50/50 px-4 py-2.5 text-sm text-emerald-700">
          <CheckCircle className="h-4 w-4" weight="fill" /> All clear — nothing needs attention right now.
        </div>
      )}

      {/* ── Trend + Funnel ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ChartCard
          title="Referral volume"
          subtitle={`${nf.format(kpis.referralsPeriod)} in the ${RANGE_LABEL[range]}`}
          viewAllHref="/admin/referrals"
          height={260}
          isEmpty={trendEmpty}
          className="lg:col-span-2"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1a2a4a" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#1a2a4a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f2f4" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af', fontFamily: 'var(--font-geist-mono)' }} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af', fontFamily: 'var(--font-geist-mono)' }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="count" stroke="#1a2a4a" strokeWidth={2.25} fill="url(#volGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <SectionCard title="Status funnel" subtitle={`${nf.format(funnelTotal)} referrals total`} viewAllHref="/admin/referrals">
          <div className="space-y-4 pt-1">
            <ProportionRow label="Received" value={funnel.received} total={funnelTotal} color="#3b82f6" />
            <ProportionRow label="In process" value={funnel.inProcess} total={funnelTotal} color="#f59e0b" />
            <ProportionRow label="Attended" value={funnel.attended} total={funnelTotal} color="#10b981" />
            <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
              <span className="text-xs text-gray-400">Completion rate</span>
              <span className="font-mono text-sm font-semibold text-emerald-600 tabular-nums">{pct(funnel.attended, funnelTotal)}%</span>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ── Mix + Partner + Geography ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Referral mix */}
        <SectionCard title="Referral mix" subtitle="By type & top cases">
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">By kind</p>
              <SegmentBar
                segments={[
                  { label: 'Lawyer', value: mix.byKind.lawyer, color: '#1a2a4a' },
                  { label: 'Medical specialist', value: mix.byKind.medicalSpecialist, color: '#20b2aa' },
                ]}
              />
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Initiated by</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { k: 'Lawyers', v: mix.byCreator.lawyer },
                  { k: 'Clinics', v: mix.byCreator.clinic },
                  { k: 'Admin', v: mix.byCreator.admin },
                ].map((c) => (
                  <div key={c.k} className="rounded-lg bg-gray-50 px-2.5 py-2">
                    <p className="font-mono text-base font-semibold text-navy tabular-nums">{nf.format(c.v)}</p>
                    <p className="text-[11px] text-gray-400">{c.k}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Top case types</p>
              <RankedList items={mix.topCaseTypes} color="#d4a84b" />
            </div>
          </div>
        </SectionCard>

        {/* Partner pipeline */}
        <SectionCard title="Partner pipeline" subtitle={`${nf.format(partner.total)} partner referrals`} viewAllHref="/admin/referrer-referrals">
          <div className="space-y-5">
            <SegmentBar
              segments={[
                { label: 'Pending', value: partner.pending, color: '#f59e0b' },
                { label: 'Assigned', value: partner.assigned, color: '#3b82f6' },
                { label: 'In process', value: partner.inProcess, color: '#6366f1' },
                { label: 'Completed', value: partner.completed, color: '#10b981' },
              ]}
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-gray-100 p-3">
                <p className="font-mono text-xl font-semibold text-navy tabular-nums">{partner.confirmedRate ?? 0}%</p>
                <p className="text-[11px] text-gray-400">Cases confirmed</p>
              </div>
              <div className="rounded-xl border border-gray-100 p-3">
                <p className="font-mono text-xl font-semibold text-navy tabular-nums">
                  {partner.byService.both + partner.byService.clinic + partner.byService.lawyer > 0
                    ? `${partner.byService.both}`
                    : '0'}
                </p>
                <p className="text-[11px] text-gray-400">Need clinic + lawyer</p>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Geography */}
        <SectionCard title="Network by state" subtitle="Available providers">
          <div className="space-y-4">
            {([
              { st: 'Florida', code: 'FL' as const },
              { st: 'Minnesota', code: 'MN' as const },
            ]).map(({ st, code }) => {
              const cAvail = network.clinicsAvailableByState[code]
              const cTotal = network.clinicsByState[code]
              const lTotal = network.lawyersByState[code]
              return (
                <div key={code} className="rounded-xl border border-gray-100 p-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-navy">
                      <MapPin className="h-4 w-4 text-gold" weight="duotone" /> {st}
                    </span>
                    <span className="font-mono text-[11px] text-gray-400 tabular-nums">{code}</span>
                  </div>
                  <div className="mt-2.5 space-y-2">
                    <ProportionRow label={`Clinics available`} value={cAvail} total={cTotal || 1} color="#10b981" />
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-gray-500"><Scales className="h-3.5 w-3.5" weight="duotone" /> Lawyer firms</span>
                      <span className="font-mono font-semibold text-navy tabular-nums">{nf.format(lTotal)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </SectionCard>
      </div>

      {/* ── Top performers + Activity ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <SectionCard title="Top clinics" subtitle="By referrals received" viewAllHref="/admin/clinics">
          <RankedList items={topClinics} color="#d4a84b" />
        </SectionCard>
        <SectionCard title="Top lawyers" subtitle="By referrals sent" viewAllHref="/admin/lawyers">
          <RankedList items={topLawyers} color="#3b82f6" />
        </SectionCard>

        <SectionCard title="Recent activity" subtitle="Latest platform actions" viewAllHref="/admin/activity">
          {recentActivity.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No activity logged yet.</p>
          ) : (
            <div className="-my-1 divide-y divide-gray-100/80">
              {recentActivity.map((a, i) => {
                const Icon = actionIcon(a.action)
                return (
                  <div key={i} className="flex items-start gap-3 py-2.5">
                    <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', actionTone(a.action))}>
                      <Icon className="h-3.5 w-3.5" weight="bold" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-snug text-gray-600">
                        <span className="font-semibold text-gray-900">{a.userName}</span> {actionLabel(a.action)}
                        {a.targetName && <span className="font-medium text-gray-900"> {truncate(a.targetName, 22)}</span>}
                      </p>
                      <p className="mt-0.5 text-[11px] text-gray-400">{timeAgo(a.createdAt)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── Recent referrals ── */}
      <SectionCard title="Recent referrals" subtitle="Latest 5 across the platform" viewAllHref="/admin/referrals" bodyClassName="px-0 pb-0 pt-2">
        {recentReferrals.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-400">No referrals yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-gray-100 bg-gray-50/60 text-left text-[11px] uppercase tracking-wider text-gray-400">
                  <th className="px-5 py-2.5 font-semibold">Patient</th>
                  <th className="px-5 py-2.5 font-semibold">Lawyer</th>
                  <th className="px-5 py-2.5 font-semibold">Clinic</th>
                  <th className="px-5 py-2.5 font-semibold">Status</th>
                  <th className="px-5 py-2.5 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100/80">
                {recentReferrals.map((r) => {
                  const s = STATUS_STYLE[r.status] ?? { label: r.status, cls: 'bg-gray-100 text-gray-600 ring-gray-500/10' }
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-gray-50/50">
                      <td className="px-5 py-3 text-xs font-semibold text-gray-900">{r.patientName}</td>
                      <td className="px-5 py-3 text-xs text-gray-600">{truncate(r.lawyerName, 20)}</td>
                      <td className="px-5 py-3 text-xs text-gray-600">{truncate(r.clinicName, 20)}</td>
                      <td className="px-5 py-3">
                        <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1', s.cls)}>{s.label}</span>
                      </td>
                      <td className="px-5 py-3 font-mono text-[11px] text-gray-400 tabular-nums">{fmtDate(r.createdAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ── Footer strip: engagement ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { icon: ClipboardText, label: 'Contacts', value: contacts.total, sub: `${contacts.periodCount} this period`, href: '/admin/contacts' },
          { icon: Bell, label: 'Subscribers', value: newsletter.total, sub: `+${newsletter.periodCount} this period`, href: '/admin/newsletter' },
          { icon: ChartBar, label: 'Total referrals', value: kpis.totalReferrals, sub: 'all time', href: '/admin/referrals' },
          { icon: UserPlus, label: 'Platform users', value: kpis.totalUsers, sub: 'all roles', href: '/admin/users' },
        ].map((m) => (
          <Link key={m.label} href={m.href} className="group flex items-center gap-3 rounded-xl border border-gray-200/70 bg-white px-4 py-3 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-500 group-hover:text-navy">
              <m.icon className="h-4 w-4" weight="duotone" />
            </span>
            <div className="min-w-0">
              <p className="font-mono text-lg font-semibold leading-none text-navy tabular-nums">{nf.format(m.value)}</p>
              <p className="mt-1 truncate text-[11px] text-gray-400">{m.label} · {m.sub}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
