import { Button, EmptyState, cx } from '../ui'

/**
 * columns: [{ key, header, render?(row), className? }]
 * meta (optional): `{ page, totalPages, total }` from a paginated endpoint, with onPage(n).
 */
export default function DataTable({ columns, rows, onRowClick, empty = 'Nothing here yet', emptyHint, meta, onPage, rowKey = (r) => r.id }) {
  if (!rows?.length) return <EmptyState title={empty}>{emptyHint}</EmptyState>
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
            <tr>
              {columns.map((c, i) => (
                <th key={c.key} className={cx('py-3 pr-4 font-medium', i === 0 && 'pl-5', c.className)}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cx(onRowClick && 'cursor-pointer hover:bg-slate-50')}
              >
                {columns.map((c, i) => (
                  <td key={c.key} className={cx('py-3 pr-4 align-top', i === 0 && 'pl-5', c.className)}>
                    {c.render ? c.render(row) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm">
          <Button variant="secondary" size="sm" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>Previous</Button>
          <span className="text-slate-500">Page {meta.page} of {meta.totalPages} · {meta.total} total</span>
          <Button variant="secondary" size="sm" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>Next</Button>
        </div>
      )}
    </>
  )
}

/** Stops a row click from also firing when a button inside the row is pressed. */
export const stop = (fn) => (e) => {
  e.stopPropagation()
  fn()
}
