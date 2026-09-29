import { jsPDF } from 'jspdf';
import autoTable, { RowInput } from 'jspdf-autotable';
import { ReportData, ReportGrid } from './report.model';
import { formatMoney } from '../../shared/money';

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const money = (v: number | undefined) => (v ? formatMoney(v) : '');

function gridTable(doc: jsPDF, grid: ReportGrid, title: string, startY: number, color: [number, number, number]): number {
  const head = [['Categoria', ...grid.months.map((m) => m.label), 'Total']];
  const body: RowInput[] = grid.rows.map((r) => [r.category, ...grid.months.map((m) => money(r.byMonth[m.key])), formatMoney(r.total)]);
  if (!body.length) body.push([{ content: 'Sem movimentos neste período.', colSpan: grid.months.length + 2, styles: { halign: 'center', textColor: 120 } }]);
  const foot = [['Total', ...grid.months.map((m) => formatMoney(grid.monthTotals[m.key])), formatMoney(grid.total)]];

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, startY);
  autoTable(doc, {
    startY: startY + 3,
    head,
    body,
    foot,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.6, overflow: 'linebreak' },
    headStyles: { fillColor: color, textColor: 255, halign: 'center' },
    footStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: 'bold' },
    columnStyles: Object.fromEntries(
      [...grid.months.map((_, i) => i + 1), grid.months.length + 1].map((i) => [i, { halign: 'right' as const, cellWidth: 'auto' as const }]),
    ),
    didParseCell: (d) => {
      if (d.column.index === grid.months.length + 1) d.cell.styles.fontStyle = 'bold';
    },
  });
  return (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

export interface PdfOptions {
  /** Draft: adds a RASCUNHO watermark. */
  draft: boolean;
  /** Final report number and issue date (shown in the header). */
  number?: number;
  issuedAt?: string;
}

export function generateReportPdf(data: ReportData, associationName: string, footer: string | null, opts: PdfOptions = { draft: true }): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const period = `${fmtDate(data.inputs.from)} a ${fmtDate(data.inputs.to)}`;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(associationName, 14, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Relatório de contas — período de ${period}`, 14, 23);
  doc.setFontSize(8);
  doc.setTextColor(120);
  if (opts.draft) {
    doc.text(`Rascunho gerado em ${new Date().toLocaleString('pt-PT')}`, pageW - 14, 16, { align: 'right' });
  } else {
    const issued = opts.issuedAt ? new Date(opts.issuedAt) : new Date();
    doc.text(`Relatório final n.º ${opts.number ?? '—'}`, pageW - 14, 16, { align: 'right' });
    doc.text(`Emitido em ${issued.toLocaleDateString('pt-PT')}`, pageW - 14, 21, { align: 'right' });
  }
  doc.setTextColor(0);

  let y = gridTable(doc, data.income, 'Receitas', 32, [27, 127, 59]);
  if (y > doc.internal.pageSize.getHeight() - 60) { doc.addPage(); y = 10; }
  y = gridTable(doc, data.expense, 'Despesas', y + 10, [179, 38, 30]);

  if (y > doc.internal.pageSize.getHeight() - 70) { doc.addPage(); y = 10; }
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Resumo', 14, y + 10);

  const bold = (v: string) => ({ content: v, styles: { fontStyle: 'bold' as const } });
  const summary: RowInput[] = [
    [bold('Saldo da gerência anterior'), bold(formatMoney(data.inputs.previousBalance))],
    [bold('Apuramento do período (receitas - despesas)'), bold(formatMoney(data.net))],
    [bold('Saldo esperado (gerência anterior + apuramento)'), bold(formatMoney(data.expectedBalance))],
    ['Saldo em conta bancária', formatMoney(data.inputs.bankBalance)],
    ['Saldo em numerário', formatMoney(data.inputs.cashBalance)],
    [bold('Total dos saldos'), bold(formatMoney(data.declaredBalances))],
  ];
  if (Math.abs(data.difference) >= 0.01) {
    summary.push([{ content: 'Diferença (saldos - saldo esperado)', styles: { textColor: [179, 38, 30] } }, { content: formatMoney(data.difference), styles: { textColor: [179, 38, 30] } }]);
  }
  autoTable(doc, {
    startY: y + 13,
    body: summary,
    theme: 'grid',
    tableWidth: 120,
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 40, halign: 'right' } },
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const h = doc.internal.pageSize.getHeight();
    doc.setFontSize(7.5);
    doc.setTextColor(120);
    if (footer) doc.text(footer, 14, h - 8);
    doc.text(`Página ${i} de ${pageCount}`, pageW - 14, h - 8, { align: 'right' });
    if (opts.draft) {
      doc.saveGraphicsState();
      doc.setGState(doc.GState({ opacity: 0.12 }));
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(110);
      doc.setTextColor(179, 38, 30);
      doc.text('RASCUNHO', pageW / 2, h / 2 + 20, { align: 'center', angle: 25 });
      doc.restoreGraphicsState();
    }
  }
  doc.setTextColor(0);

  const name = opts.draft ? `rascunho_${data.inputs.from}_${data.inputs.to}.pdf` : `relatorio_final_${opts.number ?? ''}_${data.inputs.from}_${data.inputs.to}.pdf`;
  doc.save(name);
}
