import { useMemo, useState } from 'react'
import { api } from '../api'
import { TransactionsTable } from '../components/TransactionsTable'
import { Card } from '../components/ui/Card'
import { PageState } from '../components/ui/PageState'
import { useLoad } from '../hooks/useLoad'
import { Can } from '../auth/Can'
import type { Transaction } from '../types'

export function TransactionsPage() {
  const transactions = useLoad(api.transactions)
  const [type, setType] = useState<'ALL' | Transaction['type']>('ALL')
  const [status, setStatus] = useState<'ALL' | Transaction['status']>('ALL')
  const rows = useMemo(
    () => (transactions.data || []).filter((row) => (type === 'ALL' || row.type === type) && (status === 'ALL' || row.status === status)),
    [status, transactions.data, type],
  )

  return (
    <PageState loading={transactions.loading} error={transactions.error} onRetry={transactions.reload}>
      <Card
        title="Transaction ledger"
        subtitle="Wallet deposits, payroll debit, refunds, and failures"
        action={(
          <Can permission="transaction.export">
            <button className="btn-secondary" onClick={() => api.exportTransactions()}>Export CSV</button>
          </Can>
        )}
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <label className="field">
            <span className="field-label">Type</span>
            <select className="field-control" value={type} onChange={(event) => setType(event.target.value as typeof type)}>
              <option value="ALL">All types</option>
              <option value="DEPOSIT">Deposits</option>
              <option value="PAYROLL_DEBIT">Payroll debits</option>
              <option value="REFUND">Refunds</option>
              <option value="WITHDRAWAL">Withdrawals</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Status</span>
            <select className="field-control" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
              <option value="ALL">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="SUCCESS">Success</option>
              <option value="FAILED">Failed</option>
              <option value="REVERSED">Reversed</option>
            </select>
          </label>
        </div>
        <TransactionsTable rows={rows} />
      </Card>
    </PageState>
  )
}
