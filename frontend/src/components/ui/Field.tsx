export function Field({ label, value, onChange, type = 'text', required }: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  required?: boolean
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input className="field-control" type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} />
    </label>
  )
}
