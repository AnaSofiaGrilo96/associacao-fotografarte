import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { DataService } from '../../core/data.service';
import { Member, MembershipFee, PaymentMethod } from '../../core/models';
import { UiService } from '../../shared/ui.service';
import { fromIsoDate, toIsoDate } from '../../shared/dates';
import { round2 } from '../../shared/money';

export interface FeeDialogData {
  member: Member;
  fee: MembershipFee | null;
  defaultAmount: number;
  defaultJoiningFee: number;
}

@Component({
  selector: 'app-fee-dialog',
  imports: [CurrencyPipe, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatDatepickerModule, MatSelectModule, MatCheckboxModule],
  template: `
    <h2 mat-dialog-title>{{ isNew ? 'Registar pagamento de quotas' : 'Editar pagamento de quota' }}</h2>
    <mat-dialog-content>
      <p class="muted name">{{ d.member.name }}</p>
      <form [formGroup]="form" id="feeForm" (ngSubmit)="save()">
        @if (isNew) {
          <div class="years-label">Anos a pagar <span class="muted">(selecione um ou vários)</span></div>
          <div class="years">
            @for (y of years; track y) {
              <mat-checkbox [checked]="selected().has(y)" [disabled]="isPaid(y)" (change)="toggle(y, $event.checked)">
                {{ y }}@if (isPaid(y)) { <span class="muted"> (paga)</span> }
              </mat-checkbox>
            }
          </div>
        } @else {
          <mat-form-field class="full">
            <mat-label>Ano da quota</mat-label>
            <mat-select formControlName="year">
              @for (y of years; track y) {
                <mat-option [value]="y" [disabled]="isPaid(y)">{{ y }} {{ isPaid(y) ? '(já paga)' : '' }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }

        <div class="form-grid">
          <mat-form-field>
            <mat-label>Data do pagamento</mat-label>
            <input matInput [matDatepicker]="dp" formControlName="paid_on" />
            <mat-datepicker-toggle matSuffix [for]="dp" />
            <mat-datepicker #dp />
            <mat-hint>Conta como receita nesta data</mat-hint>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Método de pagamento</mat-label>
            <mat-select formControlName="payment_method_id">
              <mat-option [value]="null">—</mat-option>
              @for (m of methods(); track m.id) { <mat-option [value]="m.id">{{ m.name }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ isNew ? 'Valor por ano' : 'Valor' }}</mat-label>
            <input matInput type="number" step="0.01" min="0" formControlName="amount" />
            <span matTextSuffix>€</span>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Notas</mat-label>
            <input matInput formControlName="notes" />
          </mat-form-field>
        </div>

        @if (isNew && !d.member.joining_fee_paid_on) {
          <div class="joia">
            <mat-checkbox formControlName="include_joining_fee">Incluir joia de novo associado</mat-checkbox>
            @if (form.controls.include_joining_fee.value) {
              <mat-form-field class="joia-amount" subscriptSizing="dynamic">
                <mat-label>Valor da joia</mat-label>
                <input matInput type="number" step="0.01" min="0" formControlName="joining_fee_amount" />
                <span matTextSuffix>€</span>
              </mat-form-field>
            }
          </div>
        }
        @if (isNew && (selected().size > 1 || form.controls.include_joining_fee.value)) {
          <p class="total">Total a receber: <strong>{{ total() | currency:'EUR' }}</strong>
            <span class="muted">({{ selected().size }} {{ selected().size === 1 ? 'quota' : 'quotas' }} × {{ amount() | currency:'EUR' }}@if (form.controls.include_joining_fee.value) { + joia {{ joiningFee() | currency:'EUR' }}})</span></p>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Cancelar</button>
      <button matButton="filled" form="feeForm" type="submit" [disabled]="form.invalid || saving() || (isNew && selected().size === 0)">
        {{ isNew ? (selected().size > 1 ? 'Registar ' + selected().size + ' quotas' : 'Registar') : 'Guardar' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .name { margin: 0 0 12px; }
    .years-label { margin-bottom: 4px; }
    .years { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); margin-bottom: 16px; }
    .total { margin: 0; }
    .joia { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin: 4px 0 12px; }
    .joia-amount { width: 160px; }
  `],
})
export class FeeDialog {
  private readonly fb = inject(FormBuilder);
  private readonly data = inject(DataService);
  private readonly ui = inject(UiService);
  private readonly ref = inject(MatDialogRef<FeeDialog>);
  readonly d = inject<FeeDialogData>(MAT_DIALOG_DATA);
  readonly isNew = !this.d.fee;
  readonly saving = signal(false);
  readonly methods = signal<PaymentMethod[]>([]);
  readonly selected = signal<Set<number>>(new Set());

  readonly years: number[] = (() => {
    const now = new Date().getFullYear();
    const joined = Number((this.d.member.joined_at ?? '').slice(0, 4)) || now;
    const start = Math.min(joined, now) - 2;
    const list: number[] = [];
    for (let y = start; y <= now + 3; y++) list.push(y);
    return list;
  })();

  readonly form = this.fb.group({
    year: [this.d.fee?.year ?? null as number | null],
    paid_on: [fromIsoDate(this.d.fee?.paid_on) ?? new Date(), Validators.required],
    amount: [this.d.fee?.amount ?? this.d.defaultAmount, [Validators.required, Validators.min(0)]],
    payment_method_id: [this.d.fee?.payment_method_id ?? null as string | null],
    notes: [this.d.fee?.notes ?? ''],
    include_joining_fee: [false],
    joining_fee_amount: [this.d.defaultJoiningFee, [Validators.min(0)]],
  });

  readonly amount = toSignal(this.form.controls.amount.valueChanges, { initialValue: this.form.controls.amount.value });
  readonly includeJoiningFee = toSignal(this.form.controls.include_joining_fee.valueChanges, { initialValue: false });
  readonly joiningFee = toSignal(this.form.controls.joining_fee_amount.valueChanges, { initialValue: this.form.controls.joining_fee_amount.value });
  readonly total = computed(() =>
    round2(Number(this.amount() ?? 0) * this.selected().size + (this.includeJoiningFee() ? Number(this.joiningFee() ?? 0) : 0)));

  constructor() {
    this.data.listPaymentMethods().then((m) => this.methods.set(m)).catch((e) => this.ui.error(e));
    if (this.isNew) {
      this.selected.set(new Set([this.firstUnpaidYear()]));
      // New member (no fees yet, no joining fee): suggest the joining fee.
      if (!this.d.member.joining_fee_paid_on && !(this.d.member.membership_fees ?? []).length) {
        this.form.controls.include_joining_fee.setValue(true);
      }
    } else {
      this.form.controls.year.addValidators(Validators.required);
    }
  }

  isPaid(year: number): boolean {
    if (this.d.fee?.year === year) return false;
    return (this.d.member.membership_fees ?? []).some((f) => f.year === year);
  }

  toggle(year: number, checked: boolean) {
    const next = new Set(this.selected());
    checked ? next.add(year) : next.delete(year);
    this.selected.set(next);
  }

  private firstUnpaidYear(): number {
    const now = new Date().getFullYear();
    let y = now;
    while ((this.d.member.membership_fees ?? []).some((f) => f.year === y)) y++;
    return y;
  }

  async save() {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const base = {
      member_id: this.d.member.id,
      paid_on: toIsoDate(v.paid_on as Date)!,
      amount: Number(v.amount),
      payment_method_id: v.payment_method_id || null,
      notes: v.notes?.trim() || null,
    };
    this.saving.set(true);
    try {
      if (this.isNew) {
        const years = [...this.selected()].sort((a, b) => a - b);
        if (!years.length) return;
        await this.data.createFees(years.map((year) => ({ ...base, year })));
        const withJoia = v.include_joining_fee && !this.d.member.joining_fee_paid_on;
        if (withJoia) {
          await this.data.saveMember({
            id: this.d.member.id,
            joining_fee_paid_on: base.paid_on,
            joining_fee_amount: Number(v.joining_fee_amount ?? 0),
            joining_fee_payment_method_id: base.payment_method_id,
          });
        }
        const msg = years.length === 1 ? `Quota de ${years[0]} registada` : `${years.length} quotas registadas (${years.join(', ')})`;
        this.ui.toast(withJoia ? `${msg} e joia registada.` : `${msg}.`);
      } else {
        await this.data.saveFee({ id: this.d.fee!.id, ...base, year: v.year! });
        this.ui.toast('Pagamento atualizado.');
      }
      this.ref.close(true);
    } catch (e) {
      this.ui.error(e);
    } finally {
      this.saving.set(false);
    }
  }
}
