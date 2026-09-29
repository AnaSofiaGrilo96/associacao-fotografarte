import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import {
  Category, InactiveReason, Member, MembershipFee, PaymentMethod, Report, Settings, Transaction, TransactionType,
} from './models';

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly sb = inject(SupabaseService).client;

  // ---------- Members ----------
  async listMembers(): Promise<Member[]> {
    return unwrap(
      await this.sb
        .from('members')
        .select('*, inactive_reason:inactive_reasons(name), membership_fees(*, payment_method:payment_methods(name))')
        .order('name'),
    );
  }

  async getMember(id: string): Promise<Member> {
    return unwrap(
      await this.sb
        .from('members')
        .select('*, inactive_reason:inactive_reasons(name), membership_fees(*, payment_method:payment_methods(name))')
        .eq('id', id)
        .single(),
    );
  }

  async saveMember(m: Partial<Member>): Promise<Member> {
    const payload = { ...m };
    delete payload.inactive_reason;
    delete payload.membership_fees;
    delete payload.created_at;
    if (payload.id) {
      return unwrap(await this.sb.from('members').update(payload).eq('id', payload.id).select().single());
    }
    delete payload.id;
    return unwrap(await this.sb.from('members').insert(payload).select().single());
  }

  async deleteMember(id: string): Promise<void> {
    unwrap(await this.sb.from('members').delete().eq('id', id));
  }

  async nextMemberNumber(): Promise<number> {
    const rows = unwrap<{ member_number: number }[]>(
      await this.sb.from('members').select('member_number').not('member_number', 'is', null)
        .order('member_number', { ascending: false }).limit(1),
    );
    return (rows[0]?.member_number ?? 0) + 1;
  }

  // ---------- Fees ----------
  /** Inserts several fee payments at once (e.g. several years paid on the same day). */
  async createFees(fees: Partial<MembershipFee>[]): Promise<MembershipFee[]> {
    const rows = fees.map((f) => { const { id: _id, created_at: _c, payment_method: _pm, ...rest } = f; return rest; });
    return unwrap(await this.sb.from('membership_fees').insert(rows).select());
  }

  async saveFee(f: Partial<MembershipFee>): Promise<MembershipFee> {
    const payload = { ...f };
    delete payload.created_at;
    delete payload.payment_method;
    if (payload.id) {
      return unwrap(await this.sb.from('membership_fees').update(payload).eq('id', payload.id).select().single());
    }
    delete payload.id;
    return unwrap(await this.sb.from('membership_fees').insert(payload).select().single());
  }

  async deleteFee(id: string): Promise<void> {
    unwrap(await this.sb.from('membership_fees').delete().eq('id', id));
  }

  // ---------- Transactions ----------
  async listTransactions(opts: { from?: string; to?: string; type?: TransactionType | null; categoryId?: string | null; search?: string } = {}): Promise<Transaction[]> {
    let q = this.sb
      .from('transactions')
      .select('*, category:categories(name), payment_method:payment_methods(name, account)')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });
    if (opts.from) q = q.gte('date', opts.from);
    if (opts.to) q = q.lte('date', opts.to);
    if (opts.type) q = q.eq('type', opts.type);
    if (opts.categoryId) q = q.eq('category_id', opts.categoryId);
    if (opts.search) q = q.ilike('description', `%${opts.search}%`);
    return unwrap(await q);
  }

  async saveTransaction(t: Partial<Transaction>): Promise<Transaction> {
    const payload = { ...t };
    delete payload.category;
    delete payload.payment_method;
    delete payload.created_at;
    if (payload.id) {
      return unwrap(await this.sb.from('transactions').update(payload).eq('id', payload.id).select().single());
    }
    delete payload.id;
    return unwrap(await this.sb.from('transactions').insert(payload).select().single());
  }

  async deleteTransaction(id: string): Promise<void> {
    unwrap(await this.sb.from('transactions').delete().eq('id', id));
  }

  // ---------- Categories ----------
  async listCategories(includeInactive = false): Promise<Category[]> {
    let q = this.sb.from('categories').select('*').order('type').order('sort_order').order('name');
    if (!includeInactive) q = q.eq('active', true);
    return unwrap(await q);
  }

  async saveCategory(c: Partial<Category>): Promise<Category> {
    if (c.id) return unwrap(await this.sb.from('categories').update(c).eq('id', c.id).select().single());
    const { id: _id, ...payload } = c;
    return unwrap(await this.sb.from('categories').insert(payload).select().single());
  }

  async deleteCategory(id: string): Promise<void> {
    unwrap(await this.sb.from('categories').delete().eq('id', id));
  }

  // ---------- Inactive reasons ----------
  async listReasons(includeInactive = false): Promise<InactiveReason[]> {
    let q = this.sb.from('inactive_reasons').select('*').order('sort_order').order('name');
    if (!includeInactive) q = q.eq('active', true);
    return unwrap(await q);
  }

  async saveReason(r: Partial<InactiveReason>): Promise<InactiveReason> {
    if (r.id) return unwrap(await this.sb.from('inactive_reasons').update(r).eq('id', r.id).select().single());
    const { id: _id, ...payload } = r;
    return unwrap(await this.sb.from('inactive_reasons').insert(payload).select().single());
  }

  async deleteReason(id: string): Promise<void> {
    unwrap(await this.sb.from('inactive_reasons').delete().eq('id', id));
  }

  // ---------- Payment methods ----------
  async listPaymentMethods(includeInactive = false): Promise<PaymentMethod[]> {
    let q = this.sb.from('payment_methods').select('*').order('sort_order').order('name');
    if (!includeInactive) q = q.eq('active', true);
    return unwrap(await q);
  }

  async savePaymentMethod(r: Partial<PaymentMethod>): Promise<PaymentMethod> {
    if (r.id) return unwrap(await this.sb.from('payment_methods').update(r).eq('id', r.id).select().single());
    const { id: _id, ...payload } = r;
    return unwrap(await this.sb.from('payment_methods').insert(payload).select().single());
  }

  async deletePaymentMethod(id: string): Promise<void> {
    unwrap(await this.sb.from('payment_methods').delete().eq('id', id));
  }

  // ---------- Member photos (Storage, private bucket) ----------
  private readonly photoBucket = 'member-photos';

  async uploadMemberPhoto(member: Member, blob: Blob, ext: string): Promise<string> {
    const path = `${member.id}/${Date.now()}.${ext}`;
    const { error } = await this.sb.storage.from(this.photoBucket).upload(path, blob, { contentType: blob.type, upsert: true });
    if (error) throw new Error(error.message);
    if (member.photo_path) await this.sb.storage.from(this.photoBucket).remove([member.photo_path]);
    await this.saveMember({ id: member.id, photo_path: path });
    return path;
  }

  async removeMemberPhoto(member: Member): Promise<void> {
    if (member.photo_path) {
      const { error } = await this.sb.storage.from(this.photoBucket).remove([member.photo_path]);
      if (error) throw new Error(error.message);
    }
    await this.saveMember({ id: member.id, photo_path: null });
  }

  /** Signed URLs (1h) for a set of photo paths. Returns a map path -> url. */
  async photoUrls(paths: string[]): Promise<Record<string, string>> {
    const unique = [...new Set(paths.filter(Boolean))];
    if (!unique.length) return {};
    const { data, error } = await this.sb.storage.from(this.photoBucket).createSignedUrls(unique, 3600);
    if (error) throw new Error(error.message);
    const out: Record<string, string> = {};
    for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
    return out;
  }

  // ---------- Reports (emitidos) ----------
  async listReports(): Promise<Report[]> {
    return unwrap(await this.sb.from('reports').select('*').order('period_to', { ascending: false }).order('number', { ascending: false }));
  }

  async createReport(r: Partial<Report>): Promise<Report> {
    const { id: _id, number: _n, ...payload } = r;
    return unwrap(await this.sb.from('reports').insert(payload).select().single());
  }

  async deleteReport(id: string): Promise<void> {
    unwrap(await this.sb.from('reports').delete().eq('id', id));
  }

  // ---------- Settings ----------
  async getSettings(): Promise<Settings> {
    return unwrap(await this.sb.from('settings').select('*').eq('id', 1).single());
  }

  async saveSettings(s: Partial<Settings>): Promise<Settings> {
    return unwrap(await this.sb.from('settings').update(s).eq('id', 1).select().single());
  }
}
