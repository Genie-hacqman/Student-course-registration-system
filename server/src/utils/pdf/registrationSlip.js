import PDFDocument from 'pdfkit';

const MARGIN = 50;
const COLUMNS = [
  { key: 'code', label: 'Code', width: 58 },
  { key: 'title', label: 'Course title', width: 150 },
  { key: 'section', label: 'Sec', width: 28, align: 'center' },
  { key: 'credits', label: 'Cr', width: 26, align: 'center' },
  { key: 'schedule', label: 'Schedule', width: 128 },
  { key: 'lecturer', label: 'Lecturer', width: 105 },
];
const TABLE_WIDTH = COLUMNS.reduce((sum, c) => sum + c.width, 0);
const INK = '#1a1a1a';
const MUTED = '#555555';
const RULE = '#bbbbbb';

const fmtDate = (d) => (d ? new Date(d).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—');

const cellText = (course, key) => {
  if (key === 'schedule') return course.schedule.length ? course.schedule.join('\n') : 'TBA';
  if (key === 'lecturer') return course.lecturer ?? 'TBA';
  return String(course[key]);
};

/** Large diagonal watermark centred in the lower half of the page (below the course table). */
const watermark = (doc, text) => {
  const cx = doc.page.width / 2;
  const cy = doc.page.height * 0.62;
  doc.save();
  doc.rotate(-30, { origin: [cx, cy] });
  doc.fillColor('#999999').fillOpacity(0.13).font('Helvetica-Bold').fontSize(72)
    .text(text, cx - 300, cy - 36, { width: 600, align: 'center', lineBreak: false });
  doc.restore();
  doc.fillOpacity(1);
};

const drawTableHeader = (doc, y) => {
  doc.rect(MARGIN, y, TABLE_WIDTH, 20).fill('#e9edf2');
  let x = MARGIN;
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(9);
  for (const col of COLUMNS) {
    doc.text(col.label, x + 4, y + 6, { width: col.width - 8, align: col.align ?? 'left' });
    x += col.width;
  }
  return y + 20;
};

const labelValue = (doc, label, value, x, y, width) => {
  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(label.toUpperCase(), x, y, { width });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(value ?? '—', x, y + 10, { width });
};

/** Renders the registration slip as an A4 PDF into `stream` (e.g. the HTTP response). */
export const renderSlipPdf = (slip, stream) => {
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    info: { Title: `Registration slip ${slip.referenceNumber}`, Author: slip.institution },
  });
  doc.pipe(stream);

  const provisional = slip.status !== 'confirmed';
  if (provisional) watermark(doc, 'PROVISIONAL');

  // Header
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(16).text(slip.institution, MARGIN, MARGIN, { align: 'center' });
  doc.font('Helvetica').fontSize(12).fillColor(MUTED).text('Course Registration Slip', { align: 'center' });
  doc.moveDown(0.5);
  const badge = provisional ? 'PROVISIONAL' : 'CONFIRMED';
  const badgeColor = provisional ? '#b26a00' : '#1d7a3a';
  const badgeWidth = 110;
  const badgeX = (doc.page.width - badgeWidth) / 2;
  doc.roundedRect(badgeX, doc.y, badgeWidth, 18, 4).fill(badgeColor);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9).text(badge, badgeX, doc.y + 5, { width: badgeWidth, align: 'center' });

  // Student and semester block
  let y = doc.y + 18;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + TABLE_WIDTH, y).strokeColor(RULE).stroke();
  y += 10;
  const half = TABLE_WIDTH / 2;
  labelValue(doc, 'Student', slip.student.name, MARGIN, y, half - 10);
  labelValue(doc, 'Student number', slip.student.studentNumber, MARGIN + half, y, half);
  y += 32;
  labelValue(doc, 'Program', slip.student.program, MARGIN, y, half - 10);
  labelValue(doc, 'Level', String(slip.student.level), MARGIN + half, y, half);
  y += 32;
  const period = [slip.semester.name, slip.semester.academicYear].filter(Boolean).join(', ');
  labelValue(doc, 'Semester', period, MARGIN, y, half - 10);
  labelValue(doc, 'Reference number', slip.referenceNumber, MARGIN + half, y, half);
  y += 38;

  // Course table
  y = drawTableHeader(doc, y);
  const bottom = doc.page.height - MARGIN - 110;
  doc.font('Helvetica').fontSize(9);
  slip.courses.forEach((course, index) => {
    const height = Math.max(
      ...COLUMNS.map((col) => doc.heightOfString(cellText(course, col.key), { width: col.width - 8 })),
    ) + 10;
    if (y + height > bottom) {
      doc.addPage();
      if (provisional) watermark(doc, 'PROVISIONAL');
      y = drawTableHeader(doc, MARGIN);
    }
    if (index % 2 === 1) doc.rect(MARGIN, y, TABLE_WIDTH, height).fill('#f7f8fa');
    let x = MARGIN;
    doc.fillColor(INK).font('Helvetica').fontSize(9);
    for (const col of COLUMNS) {
      doc.text(cellText(course, col.key), x + 4, y + 5, { width: col.width - 8, align: col.align ?? 'left' });
      x += col.width;
    }
    y += height;
    doc.moveTo(MARGIN, y).lineTo(MARGIN + TABLE_WIDTH, y).strokeColor('#e2e2e2').stroke();
  });

  // Totals
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK)
    .text(`Total: ${slip.courses.length} course${slip.courses.length === 1 ? '' : 's'}, ${slip.totalCredits} credits`, MARGIN, y + 8, {
      width: TABLE_WIDTH, align: 'right',
    });
  y += 30;

  // Status line
  doc.font('Helvetica').fontSize(9).fillColor(MUTED);
  const status = provisional
    ? `Submitted ${fmtDate(slip.submittedAt)}. This registration is awaiting approval and is not yet final.`
    : `Approved ${fmtDate(slip.approvedAt)}${slip.approvedBy ? ` by ${slip.approvedBy}` : ''}.`;
  doc.text(status, MARGIN, y, { width: TABLE_WIDTH });

  // Footer (verification)
  const footerY = doc.page.height - MARGIN - 70;
  doc.moveTo(MARGIN, footerY).lineTo(MARGIN + TABLE_WIDTH, footerY).strokeColor(RULE).stroke();
  labelValue(doc, 'Verification code', slip.verificationCode, MARGIN, footerY + 8, half - 10);
  labelValue(doc, 'Printed', fmtDate(slip.printedAt), MARGIN + half, footerY + 8, half);
  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(
    `Verify this slip: GET /api/registrations/verify/${slip.referenceNumber}?code=${slip.verificationCode}. `
      + 'A slip stops verifying if courses are added or dropped after it was printed.',
    MARGIN, footerY + 40, { width: TABLE_WIDTH },
  );

  doc.end();
  return doc;
};
