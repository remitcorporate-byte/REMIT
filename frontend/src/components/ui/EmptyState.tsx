export function EmptyState({ show, text }: { show: boolean; text: string }) {
  if (!show) return null
  return <div className="grid min-h-28 place-items-center rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{text}</div>
}
