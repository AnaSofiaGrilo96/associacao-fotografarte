import { AccountKind, Settings, Transaction } from '../core/models';
import { round2 } from './money';

export interface BalanceForecast {
  account: AccountKind;
  stored: number;
  storedDate: string | null;
  movements: number; // net of transactions after storedDate (and up to asOf)
  count: number;
  forecast: number;
}

/**
 * Forecasts an account balance: last confirmed balance + net movements after that date,
 * counting only transactions whose payment method belongs to that account.
 */
export function forecastBalance(account: AccountKind, settings: Settings, transactions: Transaction[], asOf?: string): BalanceForecast {
  const stored = account === 'bank' ? settings.bank_balance : settings.cash_balance;
  const storedDate = account === 'bank' ? settings.bank_balance_date : settings.cash_balance_date;
  let movements = 0;
  let count = 0;
  for (const t of transactions) {
    if (t.payment_method?.account !== account) continue;
    if (storedDate && t.date <= storedDate) continue;
    if (asOf && t.date > asOf) continue;
    movements += t.type === 'income' ? t.amount : -t.amount;
    count++;
  }
  movements = round2(movements);
  return { account, stored, storedDate, movements, count, forecast: round2(stored + movements) };
}

/** Transactions with no payment method (cannot be allocated to bank or cash). */
export function unallocated(transactions: Transaction[], after?: string | null, upTo?: string): Transaction[] {
  return transactions.filter((t) => !t.payment_method && (!after || t.date > after) && (!upTo || t.date <= upTo));
}
