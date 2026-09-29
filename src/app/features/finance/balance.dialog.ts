import { Component, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { DataService } from '../../core/data.service';
import { AccountKind } from '../../core/models';
import { UiService } from '../../shared/ui.service';
import { BalanceForecast } from '../../shared/balances';
import { toIsoDate } from '../../shared/dates';

export interface BalanceDialogData { account: AccountKind; forecast: BalanceForecast; }

@Component({
  selector: 'app-balance-dialog',
  imports: [CurrencyPipe, DatePipe, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatDatepickerModule],
  template: `
    <h2 mat-dialog-title>Confirmar saldo {{ d.account === 'bank' ? 'em conta bancária' : 'em numerário' }}</h2>
    <mat-dialog-content>
      <p class="muted">
        Previsão atual: <strong>{{ d.forecast.forecast | currency:'EUR' }}</strong>
        @if (d.forecast.storedDate) {
          (saldo confirmado de {{ d.forecast.stored | currency:'EUR' }} em {{ d.forecast.storedDate | date:'dd/MM/yyyy' }} + {{ d.forecast.count }} movimentos)
        }
      </p>
      <form [formGroup]="form" id="balForm" (ngSubmit)="save()" class="form-grid">
        <mat-form-field>
          <mat-label>Saldo real</mat-label>
          <input matInput type="number" step="0.01" formControlName="balance" />
          <span matTextSuffix>€</span>
        </mat-form-field>
        <mat-form-field>
          <mat-label>À data de</mat-label>
          <input matInput [matDatepicker]="dp" formControlName="date" />
          <mat-datepicker-toggle matSuffix [for]="dp" />
          <mat-datepicker #dp />
          <mat-hint>Os movimentos posteriores a esta data entram na previsão</mat-hint>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Cancelar</button>
      <button matButton="filled" form="balForm" type="submit" [disabled]="form.invalid || saving()">Guardar</button>
    </mat-dialog-actions>
  `,
})
export class BalanceDialog {
  private readonly fb = inject(FormBuilder);
  private readonly data = inject(DataService);
  private readonly ui = inject(UiService);
  private readonly ref = inject(MatDialogRef<BalanceDialog>);
  readonly d = inject<BalanceDialogData>(MAT_DIALOG_DATA);
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    balance: [this.d.forecast.forecast, Validators.required],
    date: [new Date(), Validators.required],
  });

  async save() {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const date = toIsoDate(v.date as Date)!;
    this.saving.set(true);
    try {
      await this.data.saveSettings(
        this.d.account === 'bank'
          ? { bank_balance: Number(v.balance), bank_balance_date: date }
          : { cash_balance: Number(v.balance), cash_balance_date: date },
      );
      this.ui.toast('Saldo confirmado.');
      this.ref.close(true);
    } catch (e) {
      this.ui.error(e);
    } finally {
      this.saving.set(false);
    }
  }
}
