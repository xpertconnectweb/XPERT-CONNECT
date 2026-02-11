import fs from 'fs'
import path from 'path'
import type { User, Clinic, Referral } from '@/types/professionals'

const DATA_DIR = path.join(process.cwd(), 'data')

// In-memory cache for read-heavy data (clinics, users rarely change)
const cache = new Map<string, { data: unknown[]; mtime: number }>()

function readJson<T>(filename: string, useCache = false): T[] {
  const filePath = path.join(DATA_DIR, filename)

  if (useCache) {
    const stat = fs.statSync(filePath)
    const cached = cache.get(filename)
    if (cached && cached.mtime === stat.mtimeMs) {
      return cached.data as T[]
    }
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw) as T[]

    if (useCache) {
      const stat = fs.statSync(filePath)
      cache.set(filename, { data, mtime: stat.mtimeMs })
    }

    return data
  } catch (err) {
    console.error(`Failed to read ${filename}:`, err)
    return []
  }
}

function writeJson<T>(filename: string, data: T[]): void {
  const filePath = path.join(DATA_DIR, filename)
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  // Invalidate cache on write
  cache.delete(filename)
}

// Users (cached - rarely change)
export function getUsers(): User[] {
  return readJson<User>('users.json', true)
}

export function getUserByUsername(username: string): User | undefined {
  return getUsers().find((u) => u.username === username)
}

// Clinics (cached - rarely change)
export function getClinics(): Clinic[] {
  return readJson<Clinic>('clinics.json', true)
}

export function getClinicById(id: string): Clinic | undefined {
  return getClinics().find((c) => c.id === id)
}

// Referrals (not cached - changes frequently)
export function getReferrals(): Referral[] {
  return readJson<Referral>('referrals.json')
}

export function getReferralsByLawyer(lawyerId: string): Referral[] {
  return getReferrals().filter((r) => r.lawyerId === lawyerId)
}

export function getReferralsByClinic(clinicId: string): Referral[] {
  return getReferrals().filter((r) => r.clinicId === clinicId)
}

export function getReferralById(id: string): Referral | undefined {
  return getReferrals().find((r) => r.id === id)
}

export function createReferral(referral: Referral): Referral {
  const referrals = getReferrals()
  referrals.push(referral)
  writeJson('referrals.json', referrals)
  return referral
}

export function updateReferralStatus(
  id: string,
  status: Referral['status']
): Referral | null {
  const referrals = getReferrals()
  const index = referrals.findIndex((r) => r.id === id)
  if (index === -1) return null
  referrals[index].status = status
  referrals[index].updatedAt = new Date().toISOString()
  writeJson('referrals.json', referrals)
  return referrals[index]
}
