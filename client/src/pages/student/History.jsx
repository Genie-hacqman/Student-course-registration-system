import { History as HistoryIcon } from 'lucide-react'
import { useRegistrationHistory } from '../../api/student'
import { Badge, Card, EmptyState, PageHeader, QueryState } from '../../components/ui'
import { REGISTRATION_STATUS, formatDate, formatDateTime } from '../../lib/format'

export default function History() {
  const history = useRegistrationHistory()
  return (
    <div>
      <PageHeader title="Registration History" subtitle="Every semester you've registered for." />
      <QueryState query={history}>
        {(registrations) => (registrations.length ? (
          <div className="space-y-4">
            {registrations.map((r) => {
              const status = REGISTRATION_STATUS[r.status]
              return (
                <Card key={r.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                    <div>
                      <h2 className="font-semibold">{r.semester?.name}</h2>
                      <p className="text-sm text-slate-500">
                        {formatDate(r.semester?.startDate)} – {formatDate(r.semester?.endDate)}
                        {r.referenceNumber && ` · Ref. ${r.referenceNumber}`}
                      </p>
                    </div>
                    <div className="text-right">
                      {status && <Badge tone={status.tone}>{status.label}</Badge>}
                      <p className="mt-1 text-xs text-slate-500">
                        {r.submittedAt ? `Submitted ${formatDateTime(r.submittedAt)}` : 'Not submitted'}
                      </p>
                    </div>
                  </div>
                  {r.items?.length ? (
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-slate-100">
                        {r.items.map((i) => (
                          <tr key={i.id}>
                            <td className="px-5 py-2.5 font-medium">{i.section.course.code}</td>
                            <td className="py-2.5 text-slate-600">{i.section.course.title}</td>
                            <td className="py-2.5 text-slate-500">Sec. {i.section.sectionCode}</td>
                            <td className="px-5 py-2.5 text-right text-slate-600">{i.credits} cr</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-slate-200">
                          <td colSpan={3} className="px-5 py-2.5 text-right font-medium">Total</td>
                          <td className="px-5 py-2.5 text-right font-semibold">{r.totalCredits} cr</td>
                        </tr>
                      </tfoot>
                    </table>
                  ) : <p className="px-5 py-4 text-sm text-slate-500">No courses registered.</p>}
                </Card>
              )
            })}
          </div>
        ) : <Card><EmptyState title="No registrations yet" icon={HistoryIcon} /></Card>)}
      </QueryState>
    </div>
  )
}
