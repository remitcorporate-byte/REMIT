export function Field({ label, value, onChange, type = 'text', required, disabled, autoComplete, min, max, step, inputMode, minLength }: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  required?: boolean
  disabled?: boolean
  autoComplete?: string
  min?: string | number
  max?: string | number
  step?: string | number
  inputMode?: 'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url'
  minLength?: number
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="field-control"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        min={min}
        max={max}
        step={step}
        inputMode={inputMode}
        minLength={minLength}
      />
    </label>
  )
}
