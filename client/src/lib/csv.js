export const parseCsv = (text) => {
  const src = text.startsWith('﻿') ? text.slice(1) : text
  const raw = []
  let row = []
  let cell = ''
  let quoted = false
  let line = 1
  let rowLine = 1

  const endCell = () => { row.push(cell); cell = '' }
  const endRow = () => {
    endCell()
    if (row.some((c) => c.trim() !== '')) raw.push({ line: rowLine, cells: row })
    row = []
  }

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1 }
      else if (ch === '"') quoted = false
      else {
        if (ch === '\n') line += 1
        cell += ch
      }
    } else if (ch === '"' && cell.trim() === '') {
      cell = ''
      quoted = true
    } else if (ch === ',') endCell()
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1
      endRow()
      line += 1
      rowLine = line
    } else cell += ch
  }
  if (cell !== '' || row.length) endRow()

  const [head, ...body] = raw
  const headers = head ? head.cells.map((h) => h.trim()) : []
  const records = body.map(({ line: l, cells }) => ({
    line: l,
    values: Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? '').trim()])),
  }))
  return { headers, records }
}

const escapeCell = (value) => {
  const s = value == null ? '' : String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const toCsv = (headers, rows = []) =>
  [headers, ...rows.map((r) => headers.map((h) => r[h]))].map((cells) => cells.map(escapeCell).join(',')).join('\r\n') + '\r\n'
