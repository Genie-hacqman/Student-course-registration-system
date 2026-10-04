import { Archive } from 'lucide-react'
import { Badge } from '../ui'

/** Active / Archived for departments and programmes ("archived" = closed to new intake). */
export default function OrgStatusBadge({ status }) {
  if (status === 'archived') return <Badge tone="amber"><Archive className="mr-1 size-3" aria-hidden />Archived</Badge>
  return <Badge tone="green">Active</Badge>
}
