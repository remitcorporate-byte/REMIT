import { useEffect, useState } from 'react'
import { Wallet } from 'lucide-react'
import { api, formatNaira } from '../api'
import { Card } from '../components/ui/Card'
import { Field } from '../components/ui/Field'
import { Notice } from '../components/ui/Notice'
import { PageState } from '../components/ui/PageState'
import { useLoad } from '../hooks/useLoad'
import { Can } from '../auth/Can'

export function WalletPage() {
  const wallet = useLoad(api.wallet)
  const [amount, setAmount] = useState('50000')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const reference = params.get('depositReference')
    if (!reference) return

    setMessage(`Verifying deposit ${reference}...`)
    api.verifyDeposit(reference)
      .then((result) => {
        setMessage(`Deposit verified. New balance: ${formatNaira(result.newBalance)}`)
        wallet.reload()
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : 'Deposit verification failed'))
      .finally(() => {
        params.delete('depositReference')
        const next = params.toString()
        window.history.replaceState(null, '', next ? `?${next}` : window.location.pathname)
      })
  }, [])

  const deposit = async () => {
    setMessage('')
    try {
      const result = await api.deposit(Math.round(Number(amount) * 100))
      setMessage(`Deposit initialized. Reference: ${result.reference}`)
      if (result.authorizationUrl) window.open(result.authorizationUrl, '_blank', 'noopener,noreferrer')
      wallet.reload()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Deposit failed')
    }
  }

  return (
    <PageState loading={wallet.loading} error={wallet.error} onRetry={wallet.reload}>
      <div className="wallet-balance-hero">
        <div>
          <p>Available balance</p>
          <h2 className="mt-2 text-5xl font-black tracking-normal">{formatNaira(wallet.data?.availableBalance || 0)}</h2>
          <span>
            {formatNaira(wallet.data?.reservedBalance || 0)} reserved from {formatNaira(wallet.data?.balance || 0)} total
          </span>
        </div>
        <i><Wallet size={30} /></i>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card title="Available" subtitle="Spendable after scheduled reserves">
          <strong className="text-2xl">{formatNaira(wallet.data?.availableBalance || 0)}</strong>
        </Card>
        <Card title="Reserved" subtitle="Held for approved scheduled payroll">
          <strong className="text-2xl">{formatNaira(wallet.data?.reservedBalance || 0)}</strong>
        </Card>
        <Card title="Total" subtitle="Current wallet ledger balance">
          <strong className="text-2xl">{formatNaira(wallet.data?.balance || 0)}</strong>
        </Card>
      </div>
      <Can permission="wallet.fund">
        <Card title="Fund wallet" subtitle="Initializes a Paystack checkout session through the API">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="Amount in naira" type="number" value={amount} onChange={setAmount} />
            <button className="btn-primary" onClick={deposit}>Initialize deposit</button>
          </div>
          {message && <div className="mt-4"><Notice title="Wallet status">{message}</Notice></div>}
        </Card>
      </Can>
    </PageState>
  )
}
