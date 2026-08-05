import { getPracticeAreaCatalog } from '@/lib/data'
import { AttorneyDirectory } from '@/components/professionals/AttorneyDirectory'

// Role gating for this whole subtree lives in ./layout.tsx.
export default async function AttorneysPage() {
  // Resolved server-side: /api/admin/settings is admin-only, so a
  // directory user can never read the catalog from the client.
  const catalog = await getPracticeAreaCatalog()

  return <AttorneyDirectory catalog={catalog} />
}
