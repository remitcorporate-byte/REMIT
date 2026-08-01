import { FormEvent, useEffect, useState } from 'react'
import { ArrowLeft, LifeBuoy, MessageSquare, Plus, Send, X } from 'lucide-react'
import { api, formatDate, formatNaira } from '../api'
import { useAuth } from '../auth/AuthContext'
import { EmptyState } from '../components/ui/EmptyState'
import { LoadingState } from '../components/ui/LoadingState'
import { Notice } from '../components/ui/Notice'
import { PageState } from '../components/ui/PageState'
import { StatusPill } from '../components/ui/StatusPill'
import { useLoad } from '../hooks/useLoad'
import type {
  SupportTicket,
  SupportTicketCategory,
  SupportTicketPriority,
} from '../types'

const categories: Array<{ value: SupportTicketCategory; label: string }> = [
  { value: 'PAYMENT_FAILURE', label: 'Failed or delayed payment' },
  { value: 'WALLET_FUNDING', label: 'Wallet funding' },
  { value: 'BANK_VERIFICATION', label: 'Bank verification' },
  { value: 'PAYROLL_ISSUE', label: 'Payroll issue' },
  { value: 'ACCOUNT_ACCESS', label: 'Account access' },
  { value: 'GENERAL', label: 'General question' },
]

const initialForm = {
  category: 'GENERAL' as SupportTicketCategory,
  priority: 'NORMAL' as SupportTicketPriority,
  subject: '',
  message: '',
  related: '',
}

export function SupportPage() {
  const { can } = useAuth()
  const workspace = useLoad(async () => {
    const [tickets, payrolls, transactions] = await Promise.all([
      api.supportTickets(),
      api.payrolls(),
      api.transactions(),
    ])
    return { tickets, payrolls, transactions }
  })
  const [selectedId, setSelectedId] = useState('')
  const [ticket, setTicket] = useState<SupportTicket | null>(null)
  const [ticketLoading, setTicketLoading] = useState(false)
  const [ticketError, setTicketError] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [reply, setReply] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    if (!selectedId) {
      setTicket(null)
      return
    }
    let active = true
    setTicketLoading(true)
    setTicketError('')
    api.supportTicket(selectedId)
      .then((value) => active && setTicket(value))
      .catch((error) => active && setTicketError(error instanceof Error ? error.message : 'Could not load ticket'))
      .finally(() => active && setTicketLoading(false))
    return () => { active = false }
  }, [selectedId])

  const createTicket = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setActionError('')
    const [relatedType, relatedId] = form.related.split(':')
    try {
      const created = await api.createSupportTicket({
        category: form.category,
        priority: form.priority,
        subject: form.subject,
        message: form.message,
        ...(relatedType === 'payroll' && relatedId ? { payrollId: relatedId } : {}),
        ...(relatedType === 'transaction' && relatedId ? { transactionId: relatedId } : {}),
      })
      setForm(initialForm)
      setComposerOpen(false)
      setSelectedId(created.id)
      workspace.reload()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not create ticket')
    } finally {
      setSubmitting(false)
    }
  }

  const sendReply = async (event: FormEvent) => {
    event.preventDefault()
    if (!ticket || !reply.trim()) return
    setSubmitting(true)
    setActionError('')
    try {
      const updated = await api.replyToSupportTicket(ticket.id, reply.trim())
      setTicket(updated)
      setReply('')
      workspace.reload()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not send reply')
    } finally {
      setSubmitting(false)
    }
  }

  const closeTicket = async () => {
    if (!ticket) return
    setSubmitting(true)
    setActionError('')
    try {
      await api.closeSupportTicket(ticket.id)
      setTicket(await api.supportTicket(ticket.id))
      workspace.reload()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not close ticket')
    } finally {
      setSubmitting(false)
    }
  }

  const tickets = workspace.data?.tickets || []

  return (
    <PageState loading={workspace.loading} error={workspace.error} onRetry={workspace.reload}>
      <div className="support-toolbar">
        <div>
          <strong>Resolution centre</strong>
          <p>Report payment, wallet, payroll, or account issues and keep the conversation in one place.</p>
        </div>
        {can('support.create') ? (
          <button className="btn-primary" onClick={() => setComposerOpen((value) => !value)}>
            {composerOpen ? <X size={17} /> : <Plus size={17} />}
            {composerOpen ? 'Cancel' : 'New ticket'}
          </button>
        ) : null}
      </div>

      {composerOpen ? (
        <form className="card support-composer" onSubmit={createTicket}>
          <div className="support-composer-heading">
            <div><LifeBuoy size={20} /><strong>Tell us what happened</strong></div>
            <p>Include the outcome you expected and what happened instead.</p>
          </div>
          {actionError ? <Notice title="Could not create ticket" tone="danger">{actionError}</Notice> : null}
          <div className="support-form-grid">
            <label className="field">
              <span className="field-label">Issue category</span>
              <select className="field-control" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as SupportTicketCategory })}>
                {categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Priority</span>
              <select className="field-control" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as SupportTicketPriority })}>
                <option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option>
              </select>
            </label>
            <label className="field support-span-two">
              <span className="field-label">Subject</span>
              <input className="field-control" value={form.subject} minLength={5} maxLength={120} required onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="Briefly describe the issue" />
            </label>
            <label className="field support-span-two">
              <span className="field-label">Related payroll or transaction <small>(optional)</small></span>
              <select className="field-control" value={form.related} onChange={(event) => setForm({ ...form, related: event.target.value })}>
                <option value="">No related record</option>
                <optgroup label="Payrolls">
                  {(workspace.data?.payrolls || []).map((payroll) => <option key={payroll.id} value={`payroll:${payroll.id}`}>Payroll · {formatDate(payroll.scheduledDate)} · {formatNaira(payroll.totalAmount)}</option>)}
                </optgroup>
                <optgroup label="Transactions">
                  {(workspace.data?.transactions || []).map((transaction) => <option key={transaction.id} value={`transaction:${transaction.id}`}>{transaction.type.replaceAll('_', ' ')} · {formatNaira(transaction.amount)} · {formatDate(transaction.createdAt)}</option>)}
                </optgroup>
              </select>
            </label>
            <label className="field support-span-two">
              <span className="field-label">What happened?</span>
              <textarea className="field-control support-textarea" value={form.message} minLength={10} maxLength={5000} required onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder="Share any error message, timing, and the result you expected." />
            </label>
          </div>
          <button className="btn-primary support-submit" disabled={submitting}>{submitting ? 'Creating ticket…' : 'Submit ticket'}</button>
        </form>
      ) : null}

      <div className={`support-workspace ${selectedId ? 'has-selection' : ''}`}>
        <section className="card support-ticket-list">
          <div className="support-section-heading"><div><h2>Your tickets</h2><p>{tickets.length} support conversations</p></div></div>
          <div className="support-ticket-rows">
            {tickets.map((item) => (
              <button key={item.id} className={item.id === selectedId ? 'is-active' : ''} onClick={() => setSelectedId(item.id)}>
                <div><span>{item.reference}</span><StatusPill value={item.status} /></div>
                <strong>{item.subject}</strong>
                <p>{item.messages[0]?.body || 'No messages yet'}</p>
                <small>{categoryLabel(item.category)} · {item._count?.messages || 0} message{item._count?.messages === 1 ? '' : 's'} · {formatDate(item.lastMessageAt)}</small>
              </button>
            ))}
            <EmptyState show={!tickets.length} text="No support tickets yet. Create one when you need help." />
          </div>
        </section>

        <section className="card support-thread">
          {selectedId ? <button className="support-mobile-back" onClick={() => setSelectedId('')}><ArrowLeft size={16} /> All tickets</button> : null}
          {ticketLoading ? <LoadingState label="Loading conversation..." /> : null}
          {ticketError ? <Notice title="Could not load ticket" tone="danger">{ticketError}</Notice> : null}
          {!selectedId ? <div className="support-thread-empty"><MessageSquare /><strong>Select a ticket</strong><p>Choose a conversation to see its details and replies.</p></div> : null}
          {ticket && !ticketLoading ? (
            <>
              <header className="support-thread-header">
                <div><span>{ticket.reference}</span><h2>{ticket.subject}</h2><p>{categoryLabel(ticket.category)} · {ticket.priority.toLowerCase()} priority</p></div>
                <div><StatusPill value={ticket.status} />{can('support.close') && ticket.status !== 'CLOSED' ? <button className="btn-secondary" disabled={submitting} onClick={closeTicket}>Close ticket</button> : null}</div>
              </header>
              {linkedRecord(ticket)}
              <div className="support-messages">
                {ticket.messages.map((message) => (
                  <article key={message.id} className={`support-message is-${message.senderType.toLowerCase()}`}>
                    <div><strong>{message.senderType === 'SUPPORT' ? 'REMIT Support' : message.author ? `${message.author.firstName} ${message.author.lastName}` : 'System'}</strong><time>{formatDate(message.createdAt)}</time></div>
                    <p>{message.body}</p>
                  </article>
                ))}
              </div>
              {actionError ? <Notice title="Support action failed" tone="danger">{actionError}</Notice> : null}
              {ticket.status !== 'CLOSED' && can('support.reply') ? (
                <form className="support-reply" onSubmit={sendReply}>
                  <label htmlFor="support-reply">Add a reply</label>
                  <textarea id="support-reply" value={reply} maxLength={5000} required onChange={(event) => setReply(event.target.value)} placeholder="Add more context or answer a support question…" />
                  <button className="btn-primary" disabled={submitting || !reply.trim()}><Send size={16} /> Send reply</button>
                </form>
              ) : null}
            </>
          ) : null}
        </section>
      </div>
    </PageState>
  )
}

function categoryLabel(value: SupportTicketCategory) {
  return categories.find((category) => category.value === value)?.label || value.replaceAll('_', ' ')
}

function linkedRecord(ticket: SupportTicket) {
  if (ticket.payroll) return <div className="support-linked-record"><span>Related payroll</span><strong>{formatDate(ticket.payroll.scheduledDate)} · {formatNaira(ticket.payroll.totalAmount)}</strong><StatusPill value={ticket.payroll.status} /></div>
  if (ticket.transaction) return <div className="support-linked-record"><span>Related transaction</span><strong>{ticket.transaction.type.replaceAll('_', ' ')} · {formatNaira(ticket.transaction.amount)}</strong><StatusPill value={ticket.transaction.status} /></div>
  return null
}
