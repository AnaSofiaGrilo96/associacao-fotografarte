import { Component, computed, effect, inject, signal } from '@angular/core';
import { CurrencyPipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { DataService } from '../../core/data.service';
import { Settings, Transaction } from '../../core/models';
import { UiService } from '../../shared/ui.service';
import { toIsoDate } from '../../shared/dates';
import { ReportData, buildReport } from './report.model';
import { generateReportPdf } from './report-pdf';

const STORAGE_KEY = 'report-inputs';

@Component({
  selector: 'app-reports',
  imports: [CurrencyPipe, NgTemplateOutlet, FormsModule, MatFormFieldModule, MatInputModule, MatDatepickerModule, MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Relatórios</h1>
        <button matButton="filled" (click)="exportPdf()" [disabled]="!report() || loading()"><mat-icon>picture_as_pdf</mat-icon> Exportar PDF</button>
      </div>

      <div class="card">
        <div class="form-grid">
          <mat-form-field>
            <mat-label>Período</mat-label>
            <mat-date-range-input [rangePicker]="rp">
              <input matStartDate [ngModel]="from()" (ngModelChange)="from.set($event)" placeholder="Início" />
              <input matEndDate [ngModel]="to()" (ngModelChange)="to.set($event)" placeholder="Fim" />
            </mat-date-range-input>
            <mat-datepicker-toggle matSuffix [for]="rp" />
            <mat-date-range-picker #rp />
            <mat-hint>
              <button class="linkbtn" type="button" (click)="setYear(currentYear)">{{ currentYear }}</button> ·
              <button class="linkbtn" type="button" (click)="setYear(currentYear - 1)">{{ currentYear - 1 }}</button>
            </mat-hint>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Saldo da gerência anterior</mat-label>
            <input matInput type="number" step="0.01" [ngModel]="previousBalance()" (ngModelChange)="previousBalance.set(+$event || 0)" />
            <span matTextSuffix>€</span>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Saldo em conta bancária</mat-label>
            <input matInput type="number" step="0.01" [ngModel]="bankBalance()" (ngModelChange)="bankBalance.set(+$event || 0)" />
            <span matTextSuffix>€</span>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Saldo em numerário</mat-label>
            <input matInput type="number" step="0.01" [ngModel]="cashBalance()" (ngModelChange)="cashBalance.set(+$event || 0)" />
            <span matTextSuffix>€</span>
          </mat-form-field>
        </div>
        <p class="muted note">As quotas contam como receita na data em que foram pagas, independentemente do ano a que dizem respeito.</p>
      </div>

      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }

      @if (report(); as r) {
        <h2 class="income">Receitas</h2>
        <div class="table-wrap">
          <ng-container *ngTemplateOutlet="gridTpl; context: { grid: r.income }" />
        </div>
        <h2 class="expense">Despesas</h2>
        <div class="table-wrap">
          <ng-container *ngTemplateOutlet="gridTpl; context: { grid: r.expense }" />
        </div>

        <h2>Resumo</h2>
        <div class="card summary">
          <div class="hl"><span>Saldo da gerência anterior</span><strong>{{ r.inputs.previousBalance | currency:'EUR' }}</strong></div>
          <div class="hl"><span>Apuramento do período (receitas − despesas)</span><strong>{{ r.net | currency:'EUR' }}</strong></div>
          <div class="hl"><span>Saldo esperado (anterior + apuramento)</span><strong>{{ r.expectedBalance | currency:'EUR' }}</strong></div>
          <div><span>Saldo em conta bancária</span><strong>{{ r.inputs.bankBalance | currency:'EUR' }}</strong></div>
          <div><span>Saldo em numerário</span><strong>{{ r.inputs.cashBalance | currency:'EUR' }}</strong></div>
          <div class="hl"><span>Total dos saldos</span><strong>{{ r.declaredBalances | currency:'EUR' }}</strong></div>
          @if (r.difference !== 0) {
            <div class="expense"><span>Diferença (saldos − saldo esperado)</span><strong>{{ r.difference | currency:'EUR' }}</strong></div>
          }
        </div>
      }

      <ng-template #gridTpl let-grid="grid">
        <table class="grid">
          <thead>
            <tr><th>Categoria</th>@for (m of grid.months; track m.key) { <th class="num">{{ m.label }}</th> }<th class="num">Total</th></tr>
          </thead>
          <tbody>
            @for (row of grid.rows; track row.category) {
              <tr><td>{{ row.category }}</td>@for (m of grid.months; track m.key) { <td class="num">{{ row.byMonth[m.key] ? (row.byMonth[m.key] | currency:'EUR') : '' }}</td> }<td class="num"><strong>{{ row.total | currency:'EUR' }}</strong></td></tr>
            } @empty {
              <tr><td [attr.colspan]="grid.months.length + 2" class="empty">Sem movimentos neste período.</td></tr>
            }
          </tbody>
          <tfoot>
            <tr><th>Total</th>@for (m of grid.months; track m.key) { <th class="num">{{ grid.monthTotals[m.key] | currency:'EUR' }}</th> }<th class="num">{{ grid.total | currency:'EUR' }}</th></tr>
          </tfoot>
        </table>
      </ng-template>
    </div>
  `,
  styles: [`
    h2 { font-size: 17px; font-weight: 500; margin: 20px 0 8px; }
    .note { margin: 0; font-size: 13px; }
    .linkbtn { background: none; border: none; padding: 0; color: var(--mat-sys-primary); cursor: pointer; font: inherit; }
    table.grid { width: 100%; border-collapse: collapse; font-size: 13px; }
    table.grid th, table.grid td { padding: 8px 10px; border-bottom: 1px solid var(--mat-sys-outline-variant); text-align: left; white-space: nowrap; }
    table.grid thead th { background: var(--mat-sys-surface-container); font-weight: 500; }
    table.grid tfoot th { background: var(--mat-sys-surface-container); font-weight: 600; }
    .summary { max-width: 560px; display: grid; gap: 6px; }
    .summary > div { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--mat-sys-outline-variant); }
    .summary > div.hl { font-weight: 600; }
  `],
})
export class ReportsPage {
  private readonly data = inject(DataService);
  private readonly ui = inject(UiService);

  readonly currentYear = new Date().getFullYear();
  readonly loading = signal(true);
  readonly transactions = signal<Transaction[]>([]);
  readonly settings = signal<Settings | null>(null);

  readonly from = signal<Date | null>(new Date(this.currentYear, 0, 1));
  readonly to = signal<Date | null>(new Date(this.currentYear, 11, 31));
  readonly previousBalance = signal(0);
  readonly bankBalance = signal(0);
  readonly cashBalance = signal(0);

  readonly report = computed<ReportData | null>(() => {
    const from = toIsoDate(this.from());
    const to = toIsoDate(this.to());
    if (!from || !to || from > to) return null;
    const r = buildReport(
      { from, to, previousBalance: this.previousBalance(), bankBalance: this.bankBalance(), cashBalance: this.cashBalance() },
      this.transactions(),
    );
    return r;
  });

  constructor() {
    this.restore();
    this.load();
    effect(() => this.persist());
  }

  async load() {
    this.loading.set(true);
    try {
      const [tx, s] = await Promise.all([this.data.listTransactions(), this.data.getSettings()]);
      this.transactions.set(tx);
      this.settings.set(s);
    } catch (e) {
      this.ui.error(e);
    } finally {
      this.loading.set(false);
    }
  }

  setYear(y: number) {
    this.from.set(new Date(y, 0, 1));
    this.to.set(new Date(y, 11, 31));
  }

  exportPdf() {
    const r = this.report();
    if (!r) return;
    const s = this.settings();
    generateReportPdf(r, s?.association_name ?? 'Associação', s?.report_footer ?? null);
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ previousBalance: this.previousBalance(), bankBalance: this.bankBalance(), cashBalance: this.cashBalance() }));
    } catch { /* ignore */ }
  }

  private restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const v = JSON.parse(raw);
      this.previousBalance.set(Number(v.previousBalance) || 0);
      this.bankBalance.set(Number(v.bankBalance) || 0);
      this.cashBalance.set(Number(v.cashBalance) || 0);
    } catch { /* ignore */ }
  }
}
