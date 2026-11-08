import { clsx } from 'clsx'
import { labelFor } from '../../labels'

export function StatusPill({ value }: { value: string }) {
  return <span className={clsx('status-pill', `status-${value.toLowerCase()}`)}>{labelFor(value)}</span>
}
