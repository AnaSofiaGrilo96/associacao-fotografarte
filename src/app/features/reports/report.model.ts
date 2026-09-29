import { Transaction, TransactionType } from '../../core/models';
import { MONTHS_PT, monthKey } from '../../shared/dates';
import { round2 } from '../../shared/money';

export interface ReportInputs {
  from: string; // yyyy-mm-dd
  to: string;
  previousBalance: number; // saldo da gerência anterior
  bankBalance: number;
  cashBalance: number;
}

export interface ReportGrid {
  type: TransactionType;
  months: { key: string; label: string }[];
  rows: { category: string; byMonth: Record<string, number>; total: number }[];
  monthTotals: Record<string, number>;
  total: number;
}

export interface ReportData {
  inputs: ReportInputs;
  income: ReportGrid;
  expense: ReportGrid;
  net: number; // apuramento
  declaredBalances: number; // bank + cash
  expectedBalance: number; // previous + net
  difference: number; // declared - expected
}

export function monthsBetween(from: string, to: string): { key: string; label: string }[] {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  const out: { key: string; label: string }[] = [];
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const label = fy === ty ? MONTHS_PT[m - 1].slice(0, 3) : `${MONTHS_PT[m - 1].slice(0, 3)} ${String(y).slice(2)}`;
    out.push({ key, label });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

function buildGrid(type: TransactionType, tx: Transaction[], months: { key: string; label: string }[]): ReportGrid {
  const byCat = new Map<string, Record<string, number>>();
  for (const t of tx) {
    if (t.type !== type) continue;
    const cat = t.category?.name ?? 'Sem categoria';
    const rec = byCat.get(cat) ?? {};
    const k = monthKey(t.date);
    rec[k] = round2((rec[k] ?? 0) + t.amount);
    byCat.set(cat, rec);
  }
  const rows = [...byCat.entries()]
    .map(([category, byMonth]) => ({ category, byMonth, total: round2(Object.values(byMonth).reduce((a, b) => a + b, 0)) }))
    .sort((a, b) => a.category.localeCompare(b.category, 'pt'));
  const monthTotals: Record<string, number> = {};
  for (const m of months) monthTotals[m.key] = round2(rows.reduce((s, r) => s + (r.byMonth[m.key] ?? 0), 0));
  const total = round2(rows.reduce((s, r) => s + r.total, 0));
  return { type, months, rows, monthTotals, total };
}

export function buildReport(inputs: ReportInputs, transactions: Transaction[]): ReportData {
  const inRange = transactions.filter((t) => t.date >= inputs.from && t.date <= inputs.to);
  const months = monthsBetween(inputs.from, inputs.to);
  const income = buildGrid('income', inRange, months);
  const expense = buildGrid('expense', inRange, months);
  const net = round2(income.total - expense.total);
  const declaredBalances = round2(inputs.bankBalance + inputs.cashBalance);
  const expectedBalance = round2(inputs.previousBalance + net);
  return { inputs, income, expense, net, declaredBalances, expectedBalance, difference: round2(declaredBalances - expectedBalance) };
}
