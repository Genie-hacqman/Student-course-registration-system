import { Check } from 'lucide-react'
import { ProgressBar, cx } from '../ui'

export function RegistrationStepper({ steps, current, maxReached = current, onSelect }) {
  return (
    <nav aria-label="Registration steps" className="no-print">
      <div className="sm:hidden">
        <p className="text-sm font-medium text-slate-900">
          Step {current + 1} of {steps.length} <span className="text-slate-500">· {steps[current]}</span>
        </p>
        <div className="mt-2"><ProgressBar value={current + 1} max={steps.length} size="sm" label="Registration progress" /></div>
      </div>
      <ol className="hidden items-center sm:flex">
        {steps.map((label, i) => {
          const done = i < current
          const active = i === current
          const reachable = i <= maxReached && i !== current && onSelect
          const circle = (
            <span className={cx(
              'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors',
              done && 'bg-brand-600 text-white',
              active && 'bg-white text-brand-700 ring-2 ring-brand-600',
              !done && !active && 'bg-slate-100 text-slate-500',
            )}>
              {done ? <Check className="size-4" aria-hidden /> : i + 1}
            </span>
          )
          const text = (
            <span className={cx('hidden text-sm font-medium lg:block', active ? 'text-slate-900' : done ? 'text-slate-700' : 'text-slate-400')}>{label}</span>
          )
          return (
            <li key={label} className={cx('flex items-center', i < steps.length - 1 && 'flex-1')} aria-current={active ? 'step' : undefined}>
              {reachable ? (
                <button type="button" onClick={() => onSelect(i)} className="flex items-center gap-2 rounded-lg p-1 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-600">
                  {circle}{text}<span className="sr-only">(completed, go back)</span>
                </button>
              ) : <span className="flex items-center gap-2 p-1">{circle}{text}</span>}
              {i < steps.length - 1 && (
                <span className="mx-2 h-0.5 min-w-4 flex-1 overflow-hidden rounded-full bg-slate-200" aria-hidden>
                  <span className={cx('block h-full bg-brand-600 transition-[width] duration-500', done ? 'w-full' : 'w-0')} />
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
