-- =====================================================================
--  Migração 002 — métodos de pagamento, pagamento de várias quotas, fotos
--  Executar no SQL Editor do Supabase (pode ser re-executada).
-- =====================================================================

-- ---------- Métodos de pagamento ----------
create table if not exists public.payment_methods (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  active      boolean not null default true,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now()
);

alter table public.payment_methods enable row level security;
drop policy if exists "authenticated_all" on public.payment_methods;
create policy "authenticated_all" on public.payment_methods for all to authenticated using (true) with check (true);

insert into public.payment_methods (name, sort_order) values
  ('Numerário', 10), ('Transferência bancária', 20), ('MB WAY', 30), ('Multibanco', 40), ('Cheque', 50)
on conflict (name) do nothing;

alter table public.membership_fees
  add column if not exists payment_method_id uuid references public.payment_methods(id) on delete restrict;

alter table public.transactions
  add column if not exists payment_method_id uuid references public.payment_methods(id) on delete restrict;

-- ---------- Foto do associado ----------
alter table public.members add column if not exists photo_path text;

-- Bucket privado; o acesso faz-se com URLs assinados a partir da app (utilizador autenticado).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('member-photos', 'member-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "member_photos_select" on storage.objects;
drop policy if exists "member_photos_insert" on storage.objects;
drop policy if exists "member_photos_update" on storage.objects;
drop policy if exists "member_photos_delete" on storage.objects;
create policy "member_photos_select" on storage.objects for select to authenticated using (bucket_id = 'member-photos');
create policy "member_photos_insert" on storage.objects for insert to authenticated with check (bucket_id = 'member-photos');
create policy "member_photos_update" on storage.objects for update to authenticated using (bucket_id = 'member-photos');
create policy "member_photos_delete" on storage.objects for delete to authenticated using (bucket_id = 'member-photos');

-- ---------- Trigger quota -> movimento (agora copia o método de pagamento) ----------
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

-- ---------- Joia (valor pago pelos novos associados) ----------
alter table public.settings add column if not exists default_joining_fee_amount numeric(10,2) not null default 3;

alter table public.members add column if not exists joining_fee_paid_on date;
alter table public.members add column if not exists joining_fee_amount numeric(10,2);
alter table public.members add column if not exists joining_fee_payment_method_id uuid references public.payment_methods(id) on delete restrict;

alter table public.transactions add column if not exists joining_fee_member_id uuid unique references public.members(id) on delete cascade;

insert into public.categories (name, type, is_system, sort_order) values ('Joias', 'income', true, 1)
on conflict (name, type) do update set is_system = true;

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

-- Força a API (PostgREST) a recarregar o esquema para conhecer as novas tabelas e relações.
notify pgrst, 'reload schema';
