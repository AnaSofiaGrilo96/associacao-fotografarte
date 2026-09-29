export type MemberStatus = 'active' | 'inactive';
export type TransactionType = 'income' | 'expense';

export interface Member {
  id: string;
  member_number: number | null;
  name: string;
  email: string | null;
  phone: string | null;
  nif: string | null;
  address: string | null;
  joined_at: string; // ISO date (yyyy-mm-dd)
  status: MemberStatus;
  inactive_reason_id: string | null;
  inactive_at: string | null;
  notes: string | null;
  photo_path: string | null;
  joining_fee_paid_on: string | null;
  joining_fee_amount: number | null;
  joining_fee_payment_method_id: string | null;
  created_at?: string;
  // joined
  inactive_reason?: { name: string } | null;
  membership_fees?: MembershipFee[];
}

export interface MembershipFee {
  id: string;
  member_id: string;
  year: number;
  amount: number;
  paid_on: string; // ISO date
  payment_method_id: string | null;
  notes: string | null;
  created_at?: string;
  // joined
  payment_method?: { name: string } | null;
}

export type AccountKind = 'bank' | 'cash';

export interface PaymentMethod {
  id: string;
  name: string;
  account: AccountKind;
  active: boolean;
  sort_order: number;
}

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  is_system: boolean;
  active: boolean;
  sort_order: number;
}

export interface InactiveReason {
  id: string;
  name: string;
  active: boolean;
  sort_order: number;
}

export interface Transaction {
  id: string;
  date: string; // ISO date
  description: string;
  amount: number; // always positive
  type: TransactionType;
  category_id: string;
  fee_id: string | null;
  joining_fee_member_id: string | null;
  payment_method_id: string | null;
  notes: string | null;
  created_at?: string;
  // joined
  category?: { name: string } | null;
  payment_method?: { name: string; account: AccountKind } | null;
}

export interface Settings {
  id: number;
  association_name: string;
  default_fee_amount: number;
  default_joining_fee_amount: number;
  report_footer: string | null;
  initial_balance: number;
  bank_balance: number;
  bank_balance_date: string | null;
  cash_balance: number;
  cash_balance_date: string | null;
}

export interface Report {
  id: string;
  number: number;
  period_from: string;
  period_to: string;
  previous_balance: number;
  income_total: number;
  expense_total: number;
  net: number;
  expected_balance: number;
  bank_balance: number;
  cash_balance: number;
  total_balance: number;
  difference: number;
  status: 'approved';
  issued_at: string;
  issued_by: string | null;
  data: unknown;
  notes: string | null;
}
