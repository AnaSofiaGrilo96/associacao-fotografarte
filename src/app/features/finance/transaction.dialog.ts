import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { DataService } from '../../core/data.service';
import { Category, PaymentMethod, Transaction, TransactionType } from '../../core/models';
import { UiService } from '../../shared/ui.service';
import { fromIsoDate, toIsoDate } from '../../shared/dates';

export interface TransactionDialogData {
  transaction: Transaction | null;
  categories: Category[];
  paymentMethods: PaymentMethod[];
}

@Component({
  selector: 'app-transaction-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatDatepickerModule, MatSelectModule, MatButtonToggleModule],
  template: `
    <h2 mat-dialog-title>{{ isNew ? 'Novo movimento' : 'Editar movimento' }}</h2>
    <mat-dialog-content>
      @if (linkedToFee) {
        <p class="muted">Este movimento foi gerado por um pagamento de {{ d.transaction?.joining_fee_member_id ? 'joia' : 'quota' }}. Para o alterar, edite o registo na ficha do associado.</p>
      }
      <form [formGroup]="form" id="txForm" (ngSubmit)="save()" class="form-grid">
        <div class="full toggle">
          <mat-button-toggle-group formControlName="type" hideSingleSelectionIndicator>
            <mat-button-toggle value="income">Receita</mat-button-toggle>
            <mat-button-toggle value="expense">Despesa</mat-button-toggle>
          </mat-button-toggle-group>
        </div>
        <mat-form-field>
          <mat-label>Data</mat-label>
          <input matInput [matDatepicker]="dp" formControlName="date" />
          <mat-datepicker-toggle matSuffix [for]="dp" />
          <mat-datepicker #dp />
        </mat-form-field>
        <mat-form-field>
          <mat-label>Valor</mat-label>
          <input matInput type="number" step="0.01" min="0.01" formControlName="amount" />
          <span matTextSuffix>€</span>
        </mat-form-field>
        <mat-form-field class="full">
          <mat-label>Descrição</mat-label>
          <input matInput formControlName="description" />
        </mat-form-field>
        <mat-form-field class="full">
          <mat-label>Categoria</mat-label>
          <mat-select formControlName="category_id">
            @for (c of categoriesForType(); track c.id) { <mat-option [value]="c.id">{{ c.name }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="full">
          <mat-label>Método de pagamento</mat-label>
          <mat-select formControlName="payment_method_id">
            <mat-option [value]="null">—</mat-option>
            @for (m of d.paymentMethods; track m.id) { <mat-option [value]="m.id">{{ m.name }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="full">
          <mat-label>Notas</mat-label>
          <input matInput formControlName="notes" />
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Cancelar</button>
      <button matButton="filled" form="txForm" type="submit" [disabled]="form.invalid || saving() || linkedToFee">Guardar</button>
    </mat-dialog-actions>
  `,
  styles: [`.toggle { margin-bottom: 16px; }`],
})
export class TransactionDialog {
  private readonly fb = inject(FormBuilder);
  private readonly data = inject(DataService);
  private readonly ui = inject(UiService);
  private readonly ref = inject(MatDialogRef<TransactionDialog>);
  readonly d = inject<TransactionDialogData>(MAT_DIALOG_DATA);
  readonly isNew = !this.d.transaction;
  readonly linkedToFee = !!(this.d.transaction?.fee_id || this.d.transaction?.joining_fee_member_id);
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    type: [this.d.transaction?.type ?? ('expense' as TransactionType), Validators.required],
    date: [fromIsoDate(this.d.transaction?.date) ?? new Date(), Validators.required],
    amount: [this.d.transaction?.amount ?? (null as number | null), [Validators.required, Validators.min(0.01)]],
    description: [this.d.transaction?.description ?? '', Validators.required],
    category_id: [this.d.transaction?.category_id ?? '', Validators.required],
    payment_method_id: [this.d.transaction?.payment_method_id ?? (null as string | null)],
    notes: [this.d.transaction?.notes ?? ''],
  });

  private readonly type = toSignal(this.form.controls.type.valueChanges, { initialValue: this.form.controls.type.value });
  readonly categoriesForType = computed(() => this.d.categories.filter((c) => c.type === this.type() && (c.active || c.id === this.d.transaction?.category_id)));

  constructor() {
    if (this.linkedToFee) this.form.disable();
    this.form.controls.type.valueChanges.subscribe(() => {
      const cid = this.form.controls.category_id.value;
      if (!this.categoriesForType().some((c) => c.id === cid)) this.form.controls.category_id.setValue('');
    });
  }

  async save() {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.saving.set(true);
    try {
      await this.data.saveTransaction({
        id: this.d.transaction?.id,
        type: v.type,
        date: toIsoDate(v.date as Date)!,
        amount: Number(v.amount),
        description: v.description.trim(),
        category_id: v.category_id,
        payment_method_id: v.payment_method_id || null,
        notes: v.notes?.trim() || null,
      });
      this.ui.toast('Movimento guardado.');
      this.ref.close(true);
    } catch (e) {
      this.ui.error(e);
    } finally {
      this.saving.set(false);
    }
  }
}
