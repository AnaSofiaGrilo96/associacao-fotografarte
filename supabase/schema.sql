-- =====================================================================
--  Gestão da Associação — esquema da base de dados (Supabase / Postgres)
--  Executar uma vez no SQL Editor do Supabase (pode ser re-executado).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- Listas ----------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text not null check (type in ('income', 'expense')),
  is_system   boolean not null default false,
  active      boolean not null default true,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now(),
  unique (name, type)
);

create table if not exists public.inactive_reasons (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  active      boolean not null default true,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now()
);

create table if not exists public.payment_methods (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  account     text not null default 'bank' check (account in ('bank', 'cash')), -- conta bancária ou numerário
  active      boolean not null default true,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now()
);

create table if not exists public.settings (
  id                  integer primary key check (id = 1),
  association_name    text not null default 'Associação',
  default_fee_amount  numeric(10,2) not null default 0,
  default_joining_fee_amount numeric(10,2) not null default 3,
  report_footer       text,
  initial_balance     numeric(10,2) not null default 0, -- saldo antes do primeiro relatório final
  bank_balance        numeric(10,2) not null default 0, -- último saldo confirmado em conta
  bank_balance_date   date,
  cash_balance        numeric(10,2) not null default 0, -- último saldo confirmado em numerário
  cash_balance_date   date,
  updated_at          timestamptz not null default now()
);

-- ---------- Sócios ----------
create table if not exists public.members (
  id                  uuid primary key default gen_random_uuid(),
  member_number       integer unique,
  name                text not null,
  email               text,
  phone               text,
  nif                 text,
  address             text,
  joined_at           date not null default current_date,
  status              text not null default 'active' check (status in ('active', 'inactive')),
  inactive_reason_id  uuid references public.inactive_reasons(id) on delete restrict,
  inactive_at         date,
  notes               text,
  photo_path          text,
  joining_fee_paid_on date,
  joining_fee_amount  numeric(10,2),
  joining_fee_payment_method_id uuid references public.payment_methods(id) on delete restrict,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists members_name_idx on public.members (lower(name));

-- ---------- Quotas ----------
-- Uma linha por sócio e ano. `paid_on` é a data real do pagamento: é essa data
-- que conta para a receita do período (a quota de 2024 paga em 2026 é receita de 2026).
create table if not exists public.membership_fees (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members(id) on delete cascade,
  year        integer not null check (year between 1900 and 2200),
  amount      numeric(10,2) not null check (amount >= 0),
  paid_on     date not null default current_date,
  payment_method_id uuid references public.payment_methods(id) on delete restrict,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (member_id, year)
);
create index if not exists membership_fees_paid_on_idx on public.membership_fees (paid_on);

-- ---------- Movimentos financeiros ----------
create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  date         date not null default current_date,
  description  text not null,
  amount       numeric(10,2) not null check (amount >= 0),
  type         text not null check (type in ('income', 'expense')),
  category_id  uuid not null references public.categories(id) on delete restrict,
  fee_id       uuid unique references public.membership_fees(id) on delete cascade,
  joining_fee_member_id uuid unique references public.members(id) on delete cascade,
  payment_method_id uuid references public.payment_methods(id) on delete restrict,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists transactions_date_idx on public.transactions (date desc);
create index if not exists transactions_category_idx on public.transactions (category_id);

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

-- ---------- updated_at automático ----------
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists members_updated_at on public.members;
create trigger members_updated_at before update on public.members
  for each row execute function public.set_updated_at();

drop trigger if exists transactions_updated_at on public.transactions;
create trigger transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

-- ---------- Quotas -> movimento financeiro (sincronização automática) ----------
-- Cada pagamento de quota gera/atualiza um movimento de receita na categoria de sistema "Quotas".
create or replace function public.sync_fee_transaction() returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cat uuid;
  v_member text;
begin
  select id into v_cat from public.categories where type = 'income' and is_system = true and name = 'Quotas' limit 1;
  if v_cat is null then
    insert into public.categories (name, type, is_system, sort_order) values ('Quotas', 'income', true, 0)
      on conflict (name, type) do update set is_system = true
      returning id into v_cat;
  end if;
  select name into v_member from public.members where id = new.member_id;

  if tg_op = 'INSERT' then
    insert into public.transactions (date, description, amount, type, category_id, fee_id, notes, payment_method_id)
    values (new.paid_on, format('Quota %s — %s', new.year, v_member), new.amount, 'income', v_cat, new.id, new.notes, new.payment_method_id);
  else
    update public.transactions
       set date = new.paid_on,
           description = format('Quota %s — %s', new.year, v_member),
           amount = new.amount,
           notes = new.notes,
           payment_method_id = new.payment_method_id
     where fee_id = new.id;
    if not found then
      insert into public.transactions (date, description, amount, type, category_id, fee_id, notes, payment_method_id)
      values (new.paid_on, format('Quota %s — %s', new.year, v_member), new.amount, 'income', v_cat, new.id, new.notes, new.payment_method_id);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists membership_fees_sync on public.membership_fees;
create trigger membership_fees_sync after insert or update on public.membership_fees
  for each row execute function public.sync_fee_transaction();

-- Se o nome do sócio mudar, atualiza a descrição dos movimentos das suas quotas.
create or replace function public.sync_member_name() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then
    update public.transactions t
       set description = format('Quota %s — %s', f.year, new.name)
      from public.membership_fees f
     where t.fee_id = f.id and f.member_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists members_sync_name on public.members;
create trigger members_sync_name after update on public.members
  for each row execute function public.sync_member_name();

-- ---------- Joia -> movimento financeiro ----------
create or replace function public.sync_joining_fee_transaction() returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cat uuid;
begin
  if new.joining_fee_paid_on is null then
    delete from public.transactions where joining_fee_member_id = new.id;
    return new;
  end if;
  select id into v_cat from public.categories where type = 'income' and is_system = true and name = 'Joias' limit 1;
  if v_cat is null then
    insert into public.categories (name, type, is_system, sort_order) values ('Joias', 'income', true, 1)
      on conflict (name, type) do update set is_system = true
      returning id into v_cat;
  end if;
  update public.transactions
     set date = new.joining_fee_paid_on,
         description = format('Joia — %s', new.name),
         amount = coalesce(new.joining_fee_amount, 0),
         payment_method_id = new.joining_fee_payment_method_id
   where joining_fee_member_id = new.id;
  if not found then
    insert into public.transactions (date, description, amount, type, category_id, joining_fee_member_id, payment_method_id)
    values (new.joining_fee_paid_on, format('Joia — %s', new.name), coalesce(new.joining_fee_amount, 0), 'income', v_cat, new.id, new.joining_fee_payment_method_id);
  end if;
  return new;
end $$;

drop trigger if exists members_sync_joining_fee on public.members;
create trigger members_sync_joining_fee after insert or update on public.members
  for each row execute function public.sync_joining_fee_transaction();

-- ---------- Segurança (RLS): qualquer utilizador autenticado acede a tudo ----------
alter table public.categories       enable row level security;
alter table public.inactive_reasons enable row level security;
alter table public.payment_methods  enable row level security;
alter table public.settings         enable row level security;
alter table public.members          enable row level security;
alter table public.membership_fees  enable row level security;
alter table public.transactions     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['categories','inactive_reasons','payment_methods','settings','members','membership_fees','transactions'] loop
    execute format('drop policy if exists "authenticated_all" on public.%I', t);
    execute format('create policy "authenticated_all" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ---------- Dados iniciais ----------
insert into public.settings (id, association_name, default_fee_amount)
values (1, 'Associação fotografARTE', 0) on conflict (id) do nothing;

insert into public.categories (name, type, is_system, sort_order) values
  ('Quotas', 'income', true, 0),
  ('Joias', 'income', true, 1),
  ('Donativos', 'income', false, 10),
  ('Eventos', 'income', false, 20),
  ('Subsídios', 'income', false, 30),
  ('Outras receitas', 'income', false, 90),
  ('Eventos', 'expense', false, 10),
  ('Material', 'expense', false, 20),
  ('Serviços', 'expense', false, 30),
  ('Despesas bancárias', 'expense', false, 40),
  ('Outras despesas', 'expense', false, 90)
on conflict (name, type) do nothing;

insert into public.payment_methods (name, account, sort_order) values
  ('Numerário', 'cash', 10), ('Transferência bancária', 'bank', 20), ('MB WAY', 'bank', 30), ('Multibanco', 'bank', 40), ('Cheque', 'bank', 50)
on conflict (name) do nothing;

insert into public.inactive_reasons (name, sort_order) values
  ('Desistência', 10),
  ('Falta de pagamento', 20),
  ('Falecimento', 30),
  ('Outro', 90)
on conflict (name) do nothing;

-- ---------- Fotos dos associados (Storage) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('member-photos', 'member-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "member_photos_select" on storage.objects;
drop policy if exists "member_photos_insert" on storage.objects;
drop policy if exists "member_photos_update" on storage.objects;
drop policy if exists "member_photos_delete" on storage.objects;
create policy "member_photos_select" on storage.objects for select to authenticated using (bucket_id = 'member-photos');
create policy "member_photos_insert" on storage.objects for insert to authenticated with check (bucket_id = 'member-photos');
create policy "member_photos_update" on storage.objects for update to authenticated using (bucket_id = 'member-photos');
create policy "member_photos_delete" on storage.objects for delete to authenticated using (bucket_id = 'member-photos');

-- Força a API (PostgREST) a recarregar o esquema.
notify pgrst, 'reload schema';
