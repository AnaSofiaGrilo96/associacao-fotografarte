import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { round2 } from '../../shared/money';

export interface EmitReportDialogData {
  from: string;
  to: string;
  previousBalance: number;
  net: number;
  expectedBalance: number;
  bankBalance: number;
  cashBalance: number;
  bankForecast: number;
  cashForecast: number;
  unallocated: number;
  warnings: string[];
}

export interface EmitReportResult { bankBalance: number; cashBalance: number; }

@Component({
  selector: 'app-emit-report-dialog',
  imports: [CurrencyPipe, DatePipe, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Emitir relatório final</h2>
    <mat-dialog-content>
      <p>Os saldos abaixo são os que resultam dos movimentos registados. Confirme-os com o extrato bancário e o dinheiro em caixa a <strong>{{ d.to | date:'dd/MM/yyyy' }}</strong>; se forem diferentes, corrija-os aqui. O relatório só pode ser emitido quando o total dos saldos coincide com o saldo esperado.</p>

      <div class="rows">
        <div><span>Saldo da gerência anterior</span><strong>{{ d.previousBalance | currency:'EUR' }}</strong></div>
        <div><span>Apuramento do período</span><strong>{{ d.net | currency:'EUR' }}</strong></div>
        <div class="hl"><span>Saldo esperado</span><strong>{{ d.expectedBalance | currency:'EUR' }}</strong></div>
      </div>

      <div class="form-grid inputs">
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Saldo em conta bancária</mat-label>
          <input matInput type="number" step="0.01" [ngModel]="bank()" (ngModelChange)="bank.set(+$event || 0)" />
          <span matTextSuffix>€</span>
          <mat-hint>Segundo os movimentos: {{ d.bankForecast | currency:'EUR' }}</mat-hint>
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Saldo em numerário</mat-label>
          <input matInput type="number" step="0.01" [ngModel]="cash()" (ngModelChange)="cash.set(+$event || 0)" />
          <span matTextSuffix>€</span>
          <mat-hint>Segundo os movimentos: {{ d.cashForecast | currency:'EUR' }}</mat-hint>
        </mat-form-field>
      </div>

      <div class="rows">
        <div class="hl"><span>Total dos saldos</span><strong>{{ total() | currency:'EUR' }}</strong></div>
        <div class="hl" [class.ok]="balanced()" [class.bad]="!balanced()">
          <span><mat-icon>{{ balanced() ? 'check_circle' : 'error' }}</mat-icon> Diferença (saldos − esperado)</span>
          <strong>{{ difference() | currency:'EUR' }}</strong>
        </div>
      </div>

      @if (!balanced()) {
        <p class="bad-text">Há uma diferença de {{ difference() | currency:'EUR' }}. Verifique se faltam movimentos, se algum valor está errado ou se algum movimento tem o método de pagamento trocado. Enquanto a diferença não for zero, o relatório não é válido e só pode ser exportado como rascunho.</p>
      }
      @if (d.unallocated > 0) {
        <p class="warn-text">{{ d.unallocated }} {{ d.unallocated === 1 ? 'movimento do período não tem' : 'movimentos do período não têm' }} método de pagamento; os saldos calculados não os incluem.</p>
      }
      @for (w of d.warnings; track w) { <p class="warn-text">{{ w }}</p> }

      <p class="muted small">Ao emitir, o relatório fica registado como aprovado e o total dos saldos passa a ser o saldo da gerência anterior do próximo período.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Cancelar</button>
      <button matButton="filled" [disabled]="!balanced()" (click)="emit()"><mat-icon>verified</mat-icon> Emitir</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .rows { display: grid; gap: 4px; margin: 8px 0 16px; }
    .rows > div { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--mat-sys-outline-variant); }
    .rows > div span { display: flex; align-items: center; gap: 6px; }
    .hl { font-weight: 600; }
    .ok { color: #1b7f3b; }
    .bad { color: #b3261e; }
    .bad-text { color: #b3261e; }
    .warn-text { color: #9a6700; }
    .small { font-size: 12px; }
    .inputs { gap: 12px 16px; }
  `],
})
export class EmitReportDialog {
  readonly d = inject<EmitReportDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<EmitReportDialog, EmitReportResult>);

  readonly bank = signal(this.d.bankBalance);
  readonly cash = signal(this.d.cashBalance);
  readonly total = computed(() => round2(this.bank() + this.cash()));
  readonly difference = computed(() => round2(this.total() - this.d.expectedBalance));
  readonly balanced = computed(() => Math.abs(this.difference()) < 0.005);

  emit() {
    if (!this.balanced()) return;
    this.ref.close({ bankBalance: this.bank(), cashBalance: this.cash() });
  }
}
