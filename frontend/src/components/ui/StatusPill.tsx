import { clsx } from 'clsx'

export function StatusPill({ value }: { value: string }) {
  return <span className={clsx('status-pill', `status-${value.toLowerCase()}`)}>{value.replaceAll('_', ' ')}</span>
}
