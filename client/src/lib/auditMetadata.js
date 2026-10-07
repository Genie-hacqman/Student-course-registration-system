const show = (value) => {
  if (value === null || value === undefined || value === '') return 'empty'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const changeLines = (changes) =>
  Object.entries(changes ?? {}).map(([field, c]) => (c?.changed ? `${field} changed` : `${field}: ${show(c?.from)} → ${show(c?.to)}`))

const entryLines = (entries) =>
  (entries ?? []).map((e) => {
    const who = e.studentNumber ? `${e.studentNumber}${e.courseCode ? ` ${e.courseCode}` : ''}` : e.studentId ? `Student ${e.studentId}` : (e.key ?? `Row ${e.row}`)
    if ('from' in e || 'to' in e) return `${who}: ${show(e.from)} → ${show(e.to)}`
    return e.outcome ? `${who}: ${e.outcome}` : who
  })

export const summariseMetadata = (metadata) => {
  if (!metadata || typeof metadata !== 'object') return []
  const lines = [
    ...changeLines(metadata.changes),
    ...entryLines(metadata.entries),
    ...entryLines(metadata.rows?.entries),
    ...entryLines(metadata.overwritten?.entries),
  ]
  if (metadata.truncated) lines.push(`…and ${metadata.changed - (metadata.entries?.length ?? 0)} more`)
  if (metadata.rows?.truncated) lines.push(`…and ${metadata.rows.changed - metadata.rows.entries.length} more rows`)
  return lines
}
