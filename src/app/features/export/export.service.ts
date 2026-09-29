import { Injectable, inject } from '@angular/core';
import { DataService } from '../../core/data.service';
import { Member } from '../../core/models';

/**
 * Exports every table of the application to a single, human-readable Excel workbook.
 * Meant as a backup and as an exit path (continuing the bookkeeping manually).
 */
@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly data = inject(DataService);

  async exportAll(): Promise<void> {
    const mod = await import('exceljs');
    const ExcelJS = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof mod;
    const [members, transactions, categories, methods, reasons, reports, settings] = await Promise.all([
      this.data.listMembers(),
      this.data.listTransactions(),
      this.data.listCategories(true),
      this.data.listPaymentMethods(true),
      this.data.listReasons(true),
      this.data.listReports(),
      this.data.getSettings(),
    ]);
    const methodName = (id: string | null) => methods.find((m) => m.id === id)?.name ?? '';
    // Excel dates are written as UTC by exceljs: build them at UTC midnight to avoid timezone shifts.
    const date = (iso: string | null | undefined) => { if (!iso) return null; const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
    const dateFmt = 'dd/mm/yyyy';
    const money = '#,##0.00 €';

    const wb = new ExcelJS.Workbook();
    wb.creator = settings.association_name;
    wb.created = new Date();

    // ---------- Associados (one column per fee year) ----------
    const years = [...new Set(members.flatMap((m) => (m.membership_fees ?? []).map((f) => f.year)))].sort();
    const ws = wb.addWorksheet('Associados', { views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }] });
    ws.columns = [
      { header: 'N.º', key: 'number', width: 7 },
      { header: 'Nome', key: 'name', width: 32 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Telefone', key: 'phone', width: 14 },
      { header: 'NIF', key: 'nif', width: 12 },
      { header: 'Morada', key: 'address', width: 32 },
      { header: 'Data de entrada', key: 'joined', width: 14, style: { numFmt: dateFmt } },
      { header: 'Estado', key: 'status', width: 10 },
      { header: 'Motivo', key: 'reason', width: 20 },
      { header: 'Data de saída', key: 'left', width: 14, style: { numFmt: dateFmt } },
      { header: 'Joia paga em', key: 'joia_date', width: 14, style: { numFmt: dateFmt } },
      { header: 'Joia (€)', key: 'joia_amount', width: 10, style: { numFmt: money } },
      { header: 'Joia (método)', key: 'joia_method', width: 16 },
      ...years.map((y) => ({ header: `Quota ${y}`, key: `q${y}`, width: 12 })),
      { header: 'Notas', key: 'notes', width: 40 },
    ];
    for (const m of members) {
      const row: Record<string, unknown> = {
        number: m.member_number, name: m.name, email: m.email, phone: m.phone, nif: m.nif, address: m.address,
        joined: date(m.joined_at), status: m.status === 'active' ? 'Ativo' : 'Inativo', reason: m.inactive_reason?.name ?? '',
        left: date(m.inactive_at), joia_date: date(m.joining_fee_paid_on), joia_amount: m.joining_fee_amount ?? null,
        joia_method: methodName(m.joining_fee_payment_method_id), notes: m.notes,
      };
      for (const f of m.membership_fees ?? []) row[`q${f.year}`] = `${fmtDate(f.paid_on)} · ${f.amount.toFixed(2)} €`;
      ws.addRow(row);
    }

    // ---------- Quotas (one row per payment) ----------
    const wf = wb.addWorksheet('Quotas', { views: [{ state: 'frozen', ySplit: 1 }] });
    wf.columns = [
      { header: 'N.º', key: 'number', width: 7 },
      { header: 'Associado', key: 'name', width: 32 },
      { header: 'Ano', key: 'year', width: 8 },
      { header: 'Pago em', key: 'paid', width: 14, style: { numFmt: dateFmt } },
      { header: 'Valor', key: 'amount', width: 12, style: { numFmt: money } },
      { header: 'Método', key: 'method', width: 20 },
      { header: 'Notas', key: 'notes', width: 30 },
    ];
    const feeRows = members.flatMap((m: Member) => (m.membership_fees ?? []).map((f) => ({ m, f })));
    feeRows.sort((a, b) => a.f.paid_on.localeCompare(b.f.paid_on) || a.f.year - b.f.year);
    for (const { m, f } of feeRows) {
      wf.addRow({ number: m.member_number, name: m.name, year: f.year, paid: date(f.paid_on), amount: f.amount, method: f.payment_method?.name ?? methodName(f.payment_method_id), notes: f.notes });
    }

    // ---------- Movimentos (statement, oldest first, with running balance) ----------
    const wt = wb.addWorksheet('Movimentos', { views: [{ state: 'frozen', ySplit: 1 }] });
    wt.columns = [
      { header: 'Data', key: 'date', width: 12, style: { numFmt: dateFmt } },
      { header: 'Descrição', key: 'description', width: 40 },
      { header: 'Categoria', key: 'category', width: 20 },
      { header: 'Método', key: 'method', width: 20 },
      { header: 'Conta', key: 'account', width: 14 },
      { header: 'Receita', key: 'income', width: 12, style: { numFmt: money } },
      { header: 'Despesa', key: 'expense', width: 12, style: { numFmt: money } },
      { header: 'Saldo acumulado', key: 'balance', width: 16, style: { numFmt: money } },
      { header: 'Origem', key: 'origin', width: 14 },
      { header: 'Notas', key: 'notes', width: 30 },
    ];
    const asc = [...transactions].sort((a, b) => a.date.localeCompare(b.date) || (a.created_at ?? '').localeCompare(b.created_at ?? ''));
    asc.forEach((t, i) => {
      const r = i + 2; // sheet row
      const row = wt.addRow({
        date: date(t.date), description: t.description, category: t.category?.name ?? '', method: t.payment_method?.name ?? '',
        account: t.payment_method ? (t.payment_method.account === 'cash' ? 'Numerário' : 'Conta bancária') : '',
        income: t.type === 'income' ? t.amount : null, expense: t.type === 'expense' ? t.amount : null,
        origin: t.fee_id ? 'Quota' : t.joining_fee_member_id ? 'Joia' : 'Manual', notes: t.notes,
      });
      // Saldo acumulado = saldo anterior + receita - despesa (fórmula: continua a funcionar ao acrescentar linhas)
      row.getCell('balance').value = { formula: i === 0 ? `F${r}-G${r}` : `H${r - 1}+F${r}-G${r}` };
    });
    const lastTx = asc.length + 1;
    const tot = wt.addRow({ description: 'TOTAL' });
    tot.getCell('income').value = { formula: `SUM(F2:F${lastTx})` };
    tot.getCell('expense').value = { formula: `SUM(G2:G${lastTx})` };
    tot.getCell('balance').value = { formula: `F${lastTx + 1}-G${lastTx + 1}` };
    tot.font = { bold: true };
    const TX = { date: `Movimentos!$A$2:$A$${lastTx}`, cat: `Movimentos!$C$2:$C$${lastTx}`, acc: `Movimentos!$E$2:$E$${lastTx}`, inc: `Movimentos!$F$2:$F$${lastTx}`, exp: `Movimentos!$G$2:$G$${lastTx}` };

    // ---------- Relatórios emitidos ----------
    const wr = wb.addWorksheet('Relatórios');
    wr.columns = [
      { header: 'N.º', key: 'number', width: 7 },
      { header: 'De', key: 'from', width: 12, style: { numFmt: dateFmt } },
      { header: 'Até', key: 'to', width: 12, style: { numFmt: dateFmt } },
      { header: 'Saldo anterior', key: 'prev', width: 15, style: { numFmt: money } },
      { header: 'Receitas', key: 'inc', width: 12, style: { numFmt: money } },
      { header: 'Despesas', key: 'exp', width: 12, style: { numFmt: money } },
      { header: 'Apuramento', key: 'net', width: 12, style: { numFmt: money } },
      { header: 'Saldo esperado', key: 'expected', width: 15, style: { numFmt: money } },
      { header: 'Conta bancária', key: 'bank', width: 15, style: { numFmt: money } },
      { header: 'Numerário', key: 'cash', width: 12, style: { numFmt: money } },
      { header: 'Total dos saldos', key: 'total', width: 16, style: { numFmt: money } },
      { header: 'Emitido em', key: 'issued', width: 18 },
      { header: 'Por', key: 'by', width: 26 },
    ];
    for (const r of [...reports].sort((a, b) => a.number - b.number)) {
      wr.addRow({ number: r.number, from: date(r.period_from), to: date(r.period_to), prev: r.previous_balance, inc: r.income_total, exp: r.expense_total, net: r.net, expected: r.expected_balance, bank: r.bank_balance, cash: r.cash_balance, total: r.total_balance, issued: new Date(r.issued_at).toLocaleString('pt-PT'), by: r.issued_by });
    }

    // ---------- Listas ----------
    const wl = wb.addWorksheet('Listas');
    wl.columns = [
      { header: 'Lista', key: 'list', width: 24 },
      { header: 'Nome', key: 'name', width: 28 },
      { header: 'Detalhe', key: 'detail', width: 20 },
      { header: 'Ativa', key: 'active', width: 8 },
    ];
    for (const c of categories) wl.addRow({ list: c.type === 'income' ? 'Categoria de receita' : 'Categoria de despesa', name: c.name, detail: c.is_system ? 'sistema' : '', active: c.active ? 'Sim' : 'Não' });
    for (const m of methods) wl.addRow({ list: 'Método de pagamento', name: m.name, detail: m.account === 'cash' ? 'Numerário' : 'Conta bancária', active: m.active ? 'Sim' : 'Não' });
    for (const r of reasons) wl.addRow({ list: 'Motivo de inatividade', name: r.name, detail: '', active: r.active ? 'Sim' : 'Não' });

    // ---------- Definições ----------
    const wd = wb.addWorksheet('Definições');
    wd.columns = [{ header: 'Definição', key: 'k', width: 40 }, { header: 'Valor', key: 'v', width: 30 }];
    wd.addRows([
      { k: 'Nome da associação', v: settings.association_name },
      { k: 'Valor da quota anual (por defeito)', v: settings.default_fee_amount },
      { k: 'Valor da joia', v: settings.default_joining_fee_amount },
      { k: 'Saldo inicial em conta bancária', v: settings.bank_balance },
      { k: 'Saldo inicial em numerário', v: settings.cash_balance },
      { k: 'Data de referência dos saldos iniciais', v: date(settings.bank_balance_date ?? settings.cash_balance_date) ?? new Date(Date.UTC(1900, 0, 1)) },
      { k: 'Exportado em', v: new Date().toLocaleString('pt-PT') },
    ]);
    wd.getCell('B7').numFmt = dateFmt;
    ['B3', 'B4', 'B5', 'B6'].forEach((c) => (wd.getCell(c).numFmt = money));

    // ---------- Resumo (fórmulas: recalcula ao acrescentar movimentos) ----------
    const txYears = [...new Set(asc.map((t) => Number(t.date.slice(0, 4))))].sort();
    const thisYear = new Date().getFullYear();
    if (!txYears.includes(thisYear)) txYears.push(thisYear);
    const wsu = wb.addWorksheet('Resumo', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
    wsu.columns = [{ header: '', key: 'label', width: 34 }, ...txYears.map((y) => ({ header: String(y), key: `y${y}`, width: 14, style: { numFmt: money } }))];
    txYears.forEach((y, i) => (wsu.getRow(1).getCell(i + 2).value = y)); // anos como números (para DATE())
    const col = (i: number) => String.fromCharCode(66 + i); // B, C, ...
    const yr = (i: number) => `${col(i)}$1`;
    const between = (i: number) => `${TX.date},">="&DATE(${yr(i)},1,1),${TX.date},"<="&DATE(${yr(i)},12,31)`;
    const addFormulaRow = (label: string, f: (i: number) => string, bold = false) => {
      const row = wsu.addRow({ label });
      txYears.forEach((_, i) => { row.getCell(i + 2).value = { formula: f(i) }; });
      if (bold) row.font = { bold: true };
      return row;
    };
    addFormulaRow('Receitas do ano', (i) => `SUMIFS(${TX.inc},${between(i)})`);
    addFormulaRow('Despesas do ano', (i) => `SUMIFS(${TX.exp},${between(i)})`);
    addFormulaRow('Apuramento (receitas − despesas)', (i) => `${col(i)}2-${col(i)}3`, true);
    wsu.addRow({});
    addFormulaRow('Conta bancária (saldo no fim do ano)', (i) => `Definições!$B$5+SUMIFS(${TX.inc},${TX.acc},"Conta bancária",${TX.date},">"&Definições!$B$7,${TX.date},"<="&DATE(${yr(i)},12,31))-SUMIFS(${TX.exp},${TX.acc},"Conta bancária",${TX.date},">"&Definições!$B$7,${TX.date},"<="&DATE(${yr(i)},12,31))`);
    addFormulaRow('Numerário (saldo no fim do ano)', (i) => `Definições!$B$6+SUMIFS(${TX.inc},${TX.acc},"Numerário",${TX.date},">"&Definições!$B$7,${TX.date},"<="&DATE(${yr(i)},12,31))-SUMIFS(${TX.exp},${TX.acc},"Numerário",${TX.date},">"&Definições!$B$7,${TX.date},"<="&DATE(${yr(i)},12,31))`);
    addFormulaRow('Total dos saldos', (i) => `${col(i)}6+${col(i)}7`, true);
    addFormulaRow('Novos associados (joias)', (i) => `COUNTIFS(${TX.cat},"Joias",${between(i)})`);
    wsu.getRow(9).numFmt = '0';
    wsu.addRow({});
    wsu.addRow({ label: 'Receitas por categoria' }).font = { bold: true };
    for (const c of categories.filter((c) => c.type === 'income')) addFormulaRow(c.name, (i) => `SUMIFS(${TX.inc},${TX.cat},"${c.name.replace(/"/g, '""')}",${between(i)})`);
    wsu.addRow({});
    wsu.addRow({ label: 'Despesas por categoria' }).font = { bold: true };
    for (const c of categories.filter((c) => c.type === 'expense')) addFormulaRow(c.name, (i) => `SUMIFS(${TX.exp},${TX.cat},"${c.name.replace(/"/g, '""')}",${between(i)})`);
    wsu.addRow({});
    wsu.addRow({ label: 'Nota: os saldos iniciais e a data de referência estão na folha Definições; os movimentos até essa data já estão refletidos nos saldos iniciais.' });

    for (const sheet of wb.worksheets) {
      sheet.getRow(1).font = { bold: true };
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
    }

    // Resumo como primeira folha
    (wsu as unknown as { orderNo: number }).orderNo = 0;
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug(settings.association_name)}_exportacao_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function slug(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase() || 'associacao';
}
