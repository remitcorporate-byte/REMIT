import { api } from '../api'
import { TransactionsTable } from '../components/TransactionsTable'
import { Card } from '../components/ui/Card'
import { PageState } from '../components/ui/PageState'
import { useLoad } from '../hooks/useLoad'
import { Can } from '../auth/Can'

export function TransactionsPage() {
  const transactions = useLoad(api.transactions)

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
        <TransactionsTable rows={transactions.data || []} />
      </Card>
    </PageState>
  )
}
