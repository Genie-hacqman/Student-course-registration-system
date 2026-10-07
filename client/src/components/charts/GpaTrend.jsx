import { TrendLine } from './Charts'

export default function GpaTrend({ data }) {
  return <TrendLine data={data} valueLabel="GPA" height={200} />
}
