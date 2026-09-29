import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSelectModule } from '@angular/material/select';
import { DataService } from '../../core/data.service';
import { Member, PaymentMethod } from '../../core/models';
import { UiService } from '../../shared/ui.service';
import { fromIsoDate, toIsoDate } from '../../shared/dates';

export interface JoiningFeeDialogData { member: Member; defaultAmount: number; }

@Component({
  selector: 'app-joining-fee-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatDatepickerModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>{{ isNew ? 'Registar joia' : 'Editar joia' }}</h2>
    <mat-dialog-content>
      <p class="muted name">{{ d.member.name }}</p>
      <form [formGroup]="form" id="joiaForm" (ngSubmit)="save()" class="form-grid">
        <mat-form-field>
          <mat-label>Data do pagamento</mat-label>
          <input matInput [matDatepicker]="dp" formControlName="paid_on" />
          <mat-datepicker-toggle matSuffix [for]="dp" />
          <mat-datepicker #dp />
        </mat-form-field>
        <mat-form-field>
          <mat-label>Valor</mat-label>
          <input matInput type="number" step="0.01" min="0" formControlName="amount" />
          <span matTextSuffix>€</span>
        </mat-form-field>
        <mat-form-field class="full">
          <mat-label>Método de pagamento</mat-label>
          <mat-select formControlName="payment_method_id">
            <mat-option [value]="null">—</mat-option>
            @for (m of methods(); track m.id) { <mat-option [value]="m.id">{{ m.name }}</mat-option> }
          </mat-select>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Cancelar</button>
      <button matButton="filled" form="joiaForm" type="submit" [disabled]="form.invalid || saving()">Guardar</button>
    </mat-dialog-actions>
  `,
  styles: [`.name { margin: 0 0 12px; }`],
})
export class JoiningFeeDialog {
  private readonly fb = inject(FormBuilder);
  private readonly data = inject(DataService);
  private readonly ui = inject(UiService);
  private readonly ref = inject(MatDialogRef<JoiningFeeDialog>);
  readonly d = inject<JoiningFeeDialogData>(MAT_DIALOG_DATA);
  readonly isNew = !this.d.member.joining_fee_paid_on;
  readonly saving = signal(false);
  readonly methods = signal<PaymentMethod[]>([]);

  readonly form = this.fb.group({
    paid_on: [fromIsoDate(this.d.member.joining_fee_paid_on) ?? new Date(), Validators.required],
    amount: [this.d.member.joining_fee_amount ?? this.d.defaultAmount, [Validators.required, Validators.min(0)]],
    payment_method_id: [this.d.member.joining_fee_payment_method_id ?? null as string | null],
  });

  constructor() {
    this.data.listPaymentMethods().then((m) => this.methods.set(m)).catch((e) => this.ui.error(e));
  }

  async save() {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.saving.set(true);
    try {
      await this.data.saveMember({
        id: this.d.member.id,
        joining_fee_paid_on: toIsoDate(v.paid_on as Date),
        joining_fee_amount: Number(v.amount),
        joining_fee_payment_method_id: v.payment_method_id || null,
      });
      this.ui.toast('Joia registada.');
      this.ref.close(true);
    } catch (e) {
      this.ui.error(e);
    } finally {
      this.saving.set(false);
    }
  }
}
