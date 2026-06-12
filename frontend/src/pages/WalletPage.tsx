import { useEffect, useState } from 'react'
import { Wallet } from 'lucide-react'
import { api, formatNaira } from '../api'
import { Card } from '../components/ui/Card'
import { Field } from '../components/ui/Field'
import { Notice } from '../components/ui/Notice'
import { PageState } from '../components/ui/PageState'
import { useLoad } from '../hooks/useLoad'

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
      <div className="flex items-center justify-between rounded-lg bg-gradient-to-br from-remit-600 to-mint-600 p-7 text-white shadow-soft">
        <div>
          <p className="text-blue-100">Available balance</p>
          <h2 className="mt-2 text-5xl font-black tracking-normal">{formatNaira(wallet.data?.availableBalance || 0)}</h2>
          <span className="mt-2 block text-sm text-blue-100">
            {formatNaira(wallet.data?.reservedBalance || 0)} reserved from {formatNaira(wallet.data?.balance || 0)} total
          </span>
        </div>
        <Wallet size={54} />
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
      <Card title="Fund wallet" subtitle="Initializes a Paystack checkout session through the API">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Amount in naira" type="number" value={amount} onChange={setAmount} />
          <button className="btn-primary" onClick={deposit}>Initialize deposit</button>
        </div>
        {message && <div className="mt-4"><Notice title="Wallet status">{message}</Notice></div>}
      </Card>
    </PageState>
  )
}
