import { TrendLine } from './Charts'

/** Split out so Recharts only loads for students who actually have a GPA history. */
export default function GpaTrend({ data }) {
  return <TrendLine data={data} valueLabel="GPA" height={200} />
}
