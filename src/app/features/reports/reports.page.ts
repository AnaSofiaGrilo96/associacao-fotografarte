import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { CurrencyPipe, DatePipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { EmitReportDialog, EmitReportDialogData, EmitReportResult } from './emit-report.dialog';
import { DataService } from '../../core/data.service';
import { AuthService } from '../../core/auth.service';
import { Report, Settings, Transaction } from '../../core/models';
import { UiService } from '../../shared/ui.service';
import { fromIsoDate, toIsoDate } from '../../shared/dates';
import { forecastBalance, unallocated } from '../../shared/balances';
import { ReportData, buildReport } from './report.model';
import { generateReportPdf } from './report-pdf';

@Component({
  selector: 'app-reports',
  imports: [CurrencyPipe, DatePipe, NgTemplateOutlet, FormsModule, MatFormFieldModule, MatInputModule, MatDatepickerModule, MatButtonModule, MatIconModule, MatProgressBarModule, MatTableModule, MatTooltipModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Relatórios</h1>
        <button matButton (click)="exportDraft()" [disabled]="!report() || loading()"><mat-icon>picture_as_pdf</mat-icon> Exportar rascunho</button>
        <button matButton="filled" (click)="emitFinal()" [disabled]="!report() || loading() || emitting()" [matTooltip]="report()?.difference ? 'Os saldos não batem certo; confirme-os ao emitir' : ''"><mat-icon>verified</mat-icon> Emitir relatório final</button>
      </div>

      <div class="card">
        <div class="form-grid inputs">
          <mat-form-field subscriptSizing="dynamic">
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
              @if (suggestedStart()) { · <button class="linkbtn" type="button" (click)="useSuggestedStart()">desde {{ suggestedStart() | date:'dd/MM/yyyy' }}</button> }
            </mat-hint>
          </mat-form-field>
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>Saldo da gerência anterior</mat-label>
            <input matInput [value]="previousBalance() | currency:'EUR'" readonly />
            <mat-icon matSuffix matTooltip="Calculado automaticamente">lock</mat-icon>
            <mat-hint>{{ previousBalanceSource() }}</mat-hint>
          </mat-form-field>
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>Saldo em conta bancária</mat-label>
            <input matInput type="number" step="0.01" [ngModel]="bankBalance()" (ngModelChange)="bankBalance.set(+$event || 0)" />
            <span matTextSuffix>€</span>
            <mat-hint>Previsto pelos movimentos a {{ to() | date:'dd/MM/yyyy' }}: {{ bankForecast() | currency:'EUR' }}
              @if (bankForecast() !== bankBalance()) { · <button class="linkbtn" type="button" (click)="bankBalance.set(bankForecast())">usar</button> }
            </mat-hint>
          </mat-form-field>
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>Saldo em numerário</mat-label>
            <input matInput type="number" step="0.01" [ngModel]="cashBalance()" (ngModelChange)="cashBalance.set(+$event || 0)" />
            <span matTextSuffix>€</span>
            <mat-hint>Previsto pelos movimentos a {{ to() | date:'dd/MM/yyyy' }}: {{ cashForecast() | currency:'EUR' }}
              @if (cashForecast() !== cashBalance()) { · <button class="linkbtn" type="button" (click)="cashBalance.set(cashForecast())">usar</button> }
            </mat-hint>
          </mat-form-field>
        </div>
        <p class="muted note">As quotas e joias contam como receita na data em que foram pagas, independentemente do ano a que dizem respeito.
          @if (unallocatedInPeriod() > 0) { <span class="warn-text">{{ unallocatedInPeriod() }} {{ unallocatedInPeriod() === 1 ? 'movimento do período não tem' : 'movimentos do período não têm' }} método de pagamento e não {{ unallocatedInPeriod() === 1 ? 'entra' : 'entram' }} nos saldos previstos.</span> }
        </p>
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
        @if (r.difference !== 0) {
          <p class="bad-text"><mat-icon>error</mat-icon> Os saldos não coincidem com o saldo esperado. Pode exportar um rascunho, mas o relatório final só pode ser emitido quando a diferença for 0,00 €.</p>
        } @else {
          <p class="ok-text"><mat-icon>check_circle</mat-icon> Os saldos batem certo com o saldo esperado.</p>
        }
      }

      <h2>Relatórios emitidos</h2>
      <div class="table-wrap">
        <table mat-table [dataSource]="reports()">
          <ng-container matColumnDef="number">
            <th mat-header-cell *matHeaderCellDef>N.º</th>
            <td mat-cell *matCellDef="let r"><strong>{{ r.number }}</strong></td>
          </ng-container>
          <ng-container matColumnDef="period">
            <th mat-header-cell *matHeaderCellDef>Período</th>
            <td mat-cell *matCellDef="let r">{{ r.period_from | date:'dd/MM/yyyy' }} – {{ r.period_to | date:'dd/MM/yyyy' }}</td>
          </ng-container>
          <ng-container matColumnDef="previous">
            <th mat-header-cell *matHeaderCellDef class="num">Saldo anterior</th>
            <td mat-cell *matCellDef="let r" class="num">{{ r.previous_balance | currency:'EUR' }}</td>
          </ng-container>
          <ng-container matColumnDef="net">
            <th mat-header-cell *matHeaderCellDef class="num">Apuramento</th>
            <td mat-cell *matCellDef="let r" class="num" [class.expense]="r.net < 0" [class.income]="r.net > 0">{{ r.net | currency:'EUR' }}</td>
          </ng-container>
          <ng-container matColumnDef="total">
            <th mat-header-cell *matHeaderCellDef class="num">Total dos saldos</th>
            <td mat-cell *matCellDef="let r" class="num"><strong>{{ r.total_balance | currency:'EUR' }}</strong></td>
          </ng-container>
          <ng-container matColumnDef="issued">
            <th mat-header-cell *matHeaderCellDef>Emitido</th>
            <td mat-cell *matCellDef="let r">{{ r.issued_at | date:'dd/MM/yyyy HH:mm' }}<div class="muted small">{{ r.issued_by }}</div></td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let r" class="num actions">
              <button matIconButton (click)="downloadIssued(r)" matTooltip="Transferir PDF"><mat-icon>picture_as_pdf</mat-icon></button>
              <button matIconButton (click)="cancelIssued(r)" [disabled]="r.id !== latestReport()!.id" matTooltip="Anular (só o mais recente)"><mat-icon>delete</mat-icon></button>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="reportCols"></tr>
          <tr mat-row *matRowDef="let row; columns: reportCols"></tr>
        </table>
        @if (!reports().length) { <div class="empty">Ainda não foi emitido nenhum relatório final. O saldo da gerência anterior usa o saldo inicial das definições.</div> }
      </div>

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
    .inputs { gap: 12px 16px; }
    .note { margin: 12px 0 0; font-size: 13px; }
    .warn-text { color: #9a6700; }
    .bad-text, .ok-text { display: flex; align-items: center; gap: 6px; font-size: 13px; margin: 8px 0 0; }
    .bad-text { color: #b3261e; }
    .ok-text { color: #1b7f3b; }
    .small { font-size: 12px; }
    .actions { white-space: nowrap; }
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
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);

  readonly currentYear = new Date().getFullYear();
  readonly loading = signal(true);
  readonly emitting = signal(false);
  readonly transactions = signal<Transaction[]>([]);
  readonly settings = signal<Settings | null>(null);
  readonly reports = signal<Report[]>([]);
  readonly reportCols = ['number', 'period', 'previous', 'net', 'total', 'issued', 'actions'];

  readonly from = signal<Date | null>(new Date(this.currentYear, 0, 1));
  readonly to = signal<Date | null>(new Date(this.currentYear, 11, 31));
  readonly bankBalance = signal(0);
  readonly cashBalance = signal(0);

  private readonly fromIso = computed(() => toIsoDate(this.from()));
  private readonly toIso = computed(() => toIsoDate(this.to()));

  /** Most recently issued report (by period end, then number). */
  readonly latestReport = computed(() => this.reports()[0] ?? null);

  /** Suggested start of the next period: the day after the latest report. */
  readonly suggestedStart = computed(() => {
    const r = this.latestReport();
    if (!r) return null;
    const d = fromIsoDate(r.period_to)!;
    d.setDate(d.getDate() + 1);
    return d;
  });

  /** Previous balance: total balance of the last final report ending before the period; otherwise the initial balance. */
  private readonly previousInfo = computed(() => {
    const from = this.fromIso();
    const prev = from ? this.reports().find((r) => r.period_to < from) : null;
    if (prev) {
      return { value: prev.total_balance, source: `Relatório final n.º ${prev.number} (${fmt(prev.period_from)} – ${fmt(prev.period_to)})` };
    }
    const s = this.settings();
    return { value: s?.initial_balance ?? 0, source: 'Saldo inicial (Listas e definições → Definições)' };
  });
  readonly previousBalance = computed(() => this.previousInfo().value);
  readonly previousBalanceSource = computed(() => this.previousInfo().source);

  readonly bankForecast = computed(() => {
    const s = this.settings();
    return s ? forecastBalance('bank', s, this.transactions(), this.toIso() ?? undefined).forecast : 0;
  });
  readonly cashForecast = computed(() => {
    const s = this.settings();
    return s ? forecastBalance('cash', s, this.transactions(), this.toIso() ?? undefined).forecast : 0;
  });
  readonly unallocatedInPeriod = computed(() => {
    const from = this.fromIso(), to = this.toIso();
    return unallocated(this.transactions(), from ? prevDay(from) : null, to ?? undefined).length;
  });

  readonly report = computed<ReportData | null>(() => {
    const from = this.fromIso();
    const to = this.toIso();
    if (!from || !to || from > to) return null;
    return buildReport(
      { from, to, previousBalance: this.previousBalance(), bankBalance: this.bankBalance(), cashBalance: this.cashBalance() },
      this.transactions(),
    );
  });

  constructor() {
    this.load();
    // Whenever the period (or the data) changes, prefill the balances with the forecast.
    effect(() => {
      const bank = this.bankForecast();
      const cash = this.cashForecast();
      untracked(() => { this.bankBalance.set(bank); this.cashBalance.set(cash); });
    });
  }

  async load() {
    this.loading.set(true);
    try {
      const [tx, s, reps] = await Promise.all([this.data.listTransactions(), this.data.getSettings(), this.data.listReports()]);
      this.transactions.set(tx);
      this.settings.set(s);
      this.reports.set(reps);
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

  useSuggestedStart() {
    const d = this.suggestedStart();
    if (d) this.from.set(d);
  }

  exportDraft() {
    const r = this.report();
    if (!r) return;
    const s = this.settings();
    generateReportPdf(r, s?.association_name ?? 'Associação', s?.report_footer ?? null, { draft: true });
  }

  async emitFinal() {
    const current = this.report();
    if (!current) return;
    const from = current.inputs.from, to = current.inputs.to;

    const overlap = this.reports().find((x) => x.period_from <= to && x.period_to >= from);
    if (overlap) {
      this.ui.error(`O período sobrepõe-se ao relatório final n.º ${overlap.number} (${fmt(overlap.period_from)} – ${fmt(overlap.period_to)}). Anule-o primeiro ou escolha outro período.`);
      return;
    }
    const warnings: string[] = [];
    const latest = this.latestReport();
    if (latest && this.suggestedStart() && toIsoDate(this.suggestedStart())! !== from) {
      warnings.push(`O último relatório terminou em ${fmt(latest.period_to)}; este período não começa no dia seguinte.`);
    }

    const data: EmitReportDialogData = {
      from, to,
      previousBalance: current.inputs.previousBalance,
      net: current.net,
      expectedBalance: current.expectedBalance,
      bankBalance: current.inputs.bankBalance,
      cashBalance: current.inputs.cashBalance,
      bankForecast: this.bankForecast(),
      cashForecast: this.cashForecast(),
      unallocated: this.unallocatedInPeriod(),
      warnings,
    };
    const result = await firstValueFrom(this.dialog.open<EmitReportDialog, EmitReportDialogData, EmitReportResult>(EmitReportDialog, { width: '640px', data }).afterClosed());
    if (!result) return;

    // Apply the confirmed balances and rebuild the report from them.
    this.bankBalance.set(result.bankBalance);
    this.cashBalance.set(result.cashBalance);
    const r = this.report()!;
    if (Math.abs(r.difference) >= 0.005) {
      this.ui.error('Os saldos não batem certo; o relatório final não pode ser emitido.');
      return;
    }

    this.emitting.set(true);
    try {
      const saved = await this.data.createReport({
        period_from: from,
        period_to: to,
        previous_balance: r.inputs.previousBalance,
        income_total: r.income.total,
        expense_total: r.expense.total,
        net: r.net,
        expected_balance: r.expectedBalance,
        bank_balance: r.inputs.bankBalance,
        cash_balance: r.inputs.cashBalance,
        total_balance: r.declaredBalances,
        difference: r.difference,
        issued_by: this.auth.user()?.email ?? null,
        data: r,
      });
      await this.data.saveSettings({ bank_balance: r.inputs.bankBalance, bank_balance_date: to, cash_balance: r.inputs.cashBalance, cash_balance_date: to });
      const s = this.settings();
      generateReportPdf(r, s?.association_name ?? 'Associação', s?.report_footer ?? null, { draft: false, number: saved.number, issuedAt: saved.issued_at });
      this.ui.toast(`Relatório final n.º ${saved.number} emitido.`);
      await this.load();
      const next = this.suggestedStart();
      if (next) { this.from.set(next); this.to.set(new Date(next.getFullYear(), 11, 31)); }
    } catch (e) {
      this.ui.error(e);
    } finally {
      this.emitting.set(false);
    }
  }

  downloadIssued(rep: Report) {
    const s = this.settings();
    const data = rep.data as ReportData;
    if (!data?.income) { this.ui.error('Este relatório não tem os dados guardados.'); return; }
    generateReportPdf(data, s?.association_name ?? 'Associação', s?.report_footer ?? null, { draft: false, number: rep.number, issuedAt: rep.issued_at });
  }

  async cancelIssued(rep: Report) {
    const ok = await this.ui.confirm({
      title: 'Anular relatório final',
      message: `Anular o relatório final n.º ${rep.number} (${fmt(rep.period_from)} – ${fmt(rep.period_to)})? O saldo da gerência anterior voltará a ser calculado a partir do relatório anterior. Os saldos confirmados de conta e numerário não são alterados.`,
      confirmLabel: 'Anular',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.data.deleteReport(rep.id);
      this.ui.toast('Relatório anulado.');
      await this.load();
    } catch (e) {
      this.ui.error(e);
    }
  }
}

function fmt(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function prevDay(iso: string): string {
  const d = fromIsoDate(iso)!;
  d.setDate(d.getDate() - 1);
  return toIsoDate(d)!;
}
