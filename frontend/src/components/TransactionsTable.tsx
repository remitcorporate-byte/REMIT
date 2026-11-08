import type { Transaction } from '../types'
import { formatDate, formatNaira } from '../api'
import { EmptyState } from './ui/EmptyState'
import { StatusPill } from './ui/StatusPill'
import { labelFor } from '../labels'

export function TransactionsTable({ rows, compact = false }: { rows: Transaction[]; compact?: boolean }) {
  return (
    <>
      <div className="transactions-table-scroll overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3">Amount</th>
              <th className="px-3 py-3">Status</th>
              {!compact && <th className="px-3 py-3">Description</th>}
              <th className="px-3 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-100">
                <td className="whitespace-nowrap px-3 py-4">{labelFor(row.type)}</td>
                <td className="whitespace-nowrap px-3 py-4 font-bold">{formatNaira(row.amount)}</td>
                <td className="whitespace-nowrap px-3 py-4"><StatusPill value={row.status} /></td>
                {!compact && <td className="whitespace-nowrap px-3 py-4 text-slate-600">{row.description || row.employee?.email || 'No description'}</td>}
                <td className="whitespace-nowrap px-3 py-4 text-slate-600">{formatDate(row.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="transactions-mobile-list">
        {rows.map((row) => (
          <article key={row.id}>
            <div>
              <strong>{labelFor(row.type)}</strong>
              <time>{formatDate(row.createdAt)}</time>
            </div>
            <div>
              <strong>{formatNaira(row.amount)}</strong>
              <StatusPill value={row.status} />
            </div>
            {!compact && <p>{row.description || row.employee?.email || 'No description'}</p>}
          </article>
        ))}
      </div>
      <EmptyState show={!rows.length} text="No transactions yet." />
    </>
  )
}
