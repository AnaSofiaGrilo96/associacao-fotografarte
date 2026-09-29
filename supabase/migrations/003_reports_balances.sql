-- =====================================================================
--  Migração 003 — relatórios finais, saldos de conta/numerário, natureza dos métodos de pagamento
--  Executar no SQL Editor do Supabase (pode ser re-executada).
-- =====================================================================

-- ---------- Métodos de pagamento: conta bancária ou numerário ----------
alter table public.payment_methods
  add column if not exists account text not null default 'bank' check (account in ('bank', 'cash'));
update public.payment_methods set account = 'cash' where lower(name) in ('numerário', 'numerario', 'dinheiro') and account <> 'cash';

-- ---------- Saldos guardados e saldo inicial ----------
alter table public.settings add column if not exists initial_balance    numeric(10,2) not null default 0;
alter table public.settings add column if not exists bank_balance       numeric(10,2) not null default 0;
alter table public.settings add column if not exists bank_balance_date  date;
alter table public.settings add column if not exists cash_balance       numeric(10,2) not null default 0;
alter table public.settings add column if not exists cash_balance_date  date;

-- ---------- Relatórios emitidos (finais / aprovados) ----------
create table if not exists public.reports (
  id                uuid primary key default gen_random_uuid(),
  number            integer not null,
  period_from       date not null,
  period_to         date not null,
  previous_balance  numeric(10,2) not null,
  income_total      numeric(10,2) not null,
  expense_total     numeric(10,2) not null,
  net               numeric(10,2) not null,
  expected_balance  numeric(10,2) not null,
  bank_balance      numeric(10,2) not null,
  cash_balance      numeric(10,2) not null,
  total_balance     numeric(10,2) not null,
  difference        numeric(10,2) not null,
  status            text not null default 'approved' check (status in ('approved')),
  issued_at         timestamptz not null default now(),
  issued_by         text,
  data              jsonb not null default '{}'::jsonb, -- grelhas do relatório tal como foram emitidas
  notes             text,
  check (period_to >= period_from),
  unique (number)
);
create index if not exists reports_period_to_idx on public.reports (period_to desc);

alter table public.reports enable row level security;
drop policy if exists "authenticated_all" on public.reports;
create policy "authenticated_all" on public.reports for all to authenticated using (true) with check (true);

-- Número sequencial atribuído automaticamente.
create or replace function public.reports_assign_number() returns trigger language plpgsql as $$
begin
  if new.number is null or new.number = 0 then
    select coalesce(max(number), 0) + 1 into new.number from public.reports;
  end if;
  return new;
end $$;
drop trigger if exists reports_number on public.reports;
create trigger reports_number before insert on public.reports
  for each row execute function public.reports_assign_number();

notify pgrst, 'reload schema';
