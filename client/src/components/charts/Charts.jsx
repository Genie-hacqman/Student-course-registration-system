import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { usePrefersReducedMotion } from '../../lib/motion'
import { REGISTRATION_STATUS } from '../../lib/format'

// Recharts SVG props can't consume Tailwind classes/CSS vars, so these hexes are hand-synced
// to the brand/status tokens in src/index.css — update both together.
export const CHART_COLORS = {
  brand: '#2553e0',
  brandLight: '#93b0fa',
  slate: '#94a3b8',
  amber: '#f59e0b',
  green: '#16a34a',
  red: '#dc2626',
  blue: '#2553e0',
  grid: '#e2e8f0',
  axis: '#64748b',
  label: '#334155',
}

/** Distinct but calm series colours for categorical charts (programs, roles). */
export const SERIES = ['#2553e0', '#0d9488', '#7c3aed', '#d97706', '#db2777', '#0891b2', '#65a30d', '#64748b']

const axis = { tick: { fontSize: 12, fill: CHART_COLORS.axis }, tickLine: false, axisLine: false }
const tooltipStyle = { contentStyle: { borderRadius: 8, borderColor: CHART_COLORS.grid, fontSize: 12 } }

/** Wraps a chart so screen readers get a sentence instead of an SVG. */
function Figure({ summary, height, children }) {
  return (
    <figure role="img" aria-label={summary} className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
    </figure>
  )
}

const describe = (rows, labelKey, valueKey) => rows.map((r) => `${r[labelKey]}: ${r[valueKey]}`).join(', ')

/** Registrations per status, coloured like the status badges. */
export function StatusChart({ byStatus, height = 220 }) {
  const reduced = usePrefersReducedMotion()
  const data = Object.entries(REGISTRATION_STATUS).map(([status, { label, tone }]) => ({
    status: label,
    count: byStatus.find((b) => b.status === status)?.count ?? 0,
    fill: CHART_COLORS[tone],
  }))
  return (
    <Figure summary={`Registrations by status. ${describe(data, 'status', 'count')}`} height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_COLORS.grid} />
        <XAxis dataKey="status" {...axis} interval={0} tick={{ ...axis.tick, fontSize: 11 }} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(v) => [v, 'Registrations']} {...tooltipStyle} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={!reduced}>
          {data.map((d) => <Cell key={d.status} fill={d.fill} />)}
        </Bar>
      </BarChart>
    </Figure>
  )
}

const fillColor = (rate) => (rate >= 100 ? CHART_COLORS.red : rate >= 90 ? CHART_COLORS.amber : CHART_COLORS.brand)

/** Seat fill rate (%) per section, highest first. */
export function FillRateChart({ sections, limit }) {
  const reduced = usePrefersReducedMotion()
  const data = [...sections]
    .sort((a, b) => b.fillRate - a.fillRate)
    .slice(0, limit ?? sections.length)
    .map((s) => ({ name: `${s.code}-${s.sectionCode}`, fillRate: s.fillRate, seats: `${s.seatsTaken}/${s.capacity}` }))
  return (
    <Figure summary={`Section fill rate. ${describe(data, 'name', 'fillRate')} percent`} height={Math.max(160, data.length * 32)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={CHART_COLORS.grid} />
        <XAxis type="number" domain={[0, 100]} unit="%" {...axis} />
        <YAxis type="category" dataKey="name" width={96} {...axis} tick={{ fontSize: 12, fill: CHART_COLORS.label }} />
        <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(v, _n, p) => [`${v}% (${p.payload.seats} seats)`, 'Filled']} {...tooltipStyle} />
        <Bar dataKey="fillRate" radius={[0, 4, 4, 0]} barSize={18} minPointSize={2} isAnimationActive={!reduced}>
          {data.map((d) => <Cell key={d.name} fill={fillColor(d.fillRate)} />)}
        </Bar>
      </BarChart>
    </Figure>
  )
}

/**
 * Horizontal bars for a labelled breakdown (students by program, by level, per course).
 * data: [{ label, value }]
 */
export function BarBreakdown({ data, valueLabel = 'Count', height, color = CHART_COLORS.brand, multicolor }) {
  const reduced = usePrefersReducedMotion()
  return (
    <Figure summary={`${valueLabel}. ${describe(data, 'label', 'value')}`} height={height ?? Math.max(140, data.length * 36)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={CHART_COLORS.grid} />
        <XAxis type="number" allowDecimals={false} {...axis} />
        <YAxis type="category" dataKey="label" width={110} {...axis} tick={{ fontSize: 12, fill: CHART_COLORS.label }} />
        <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(v) => [v, valueLabel]} {...tooltipStyle} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18} minPointSize={2} isAnimationActive={!reduced}>
          {data.map((d, i) => <Cell key={d.label} fill={multicolor ? SERIES[i % SERIES.length] : color} />)}
        </Bar>
      </BarChart>
    </Figure>
  )
}

/** Share-of-total ring with a legend that carries the numbers (so colour is never the only cue). data: [{ label, value }] */
export function DonutChart({ data, centerLabel, centerValue, height = 200 }) {
  const reduced = usePrefersReducedMotion()
  const total = data.reduce((n, d) => n + d.value, 0)
  return (
    // Side by side only when the card itself is wide enough, whatever the viewport.
    <div className="@container w-full">
    <div className="flex flex-col items-center gap-4 @sm:flex-row">
      <div className="relative w-full max-w-[200px] shrink-0" style={{ height }}>
        <Figure summary={`${centerLabel ?? 'Breakdown'}. ${describe(data, 'label', 'value')}`} height={height}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="92%" paddingAngle={data.length > 1 ? 2 : 0} stroke="none" isAnimationActive={!reduced}>
              {data.map((d, i) => <Cell key={d.label} fill={d.color ?? SERIES[i % SERIES.length]} />)}
            </Pie>
            <Tooltip formatter={(v, n) => [v, n]} {...tooltipStyle} />
          </PieChart>
        </Figure>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums">{centerValue ?? total}</span>
          {centerLabel && <span className="text-xs text-slate-500">{centerLabel}</span>}
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1.5 text-sm">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: d.color ?? SERIES[i % SERIES.length] }} aria-hidden />
              <span className="truncate text-slate-700">{d.label}</span>
            </span>
            <span className="shrink-0 tabular-nums text-slate-600">
              {d.value}
              <span className="ml-1 text-xs text-slate-400">{total ? Math.round((d.value / total) * 100) : 0}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
    </div>
  )
}

/** Values over time. data: [{ label, value }] in date order. */
export function TrendLine({ data, valueLabel = 'Count', height = 220, color = CHART_COLORS.brand }) {
  const reduced = usePrefersReducedMotion()
  return (
    <Figure summary={`${valueLabel} over time. ${describe(data, 'label', 'value')}`} height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.18} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_COLORS.grid} />
        <XAxis dataKey="label" {...axis} minTickGap={16} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip formatter={(v) => [v, valueLabel]} {...tooltipStyle} />
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill="url(#trend-fill)" isAnimationActive={!reduced} />
      </AreaChart>
    </Figure>
  )
}
