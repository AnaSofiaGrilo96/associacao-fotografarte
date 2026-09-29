import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { DataService } from '../../core/data.service';
import { AccountKind, Category, PaymentMethod, Settings, Transaction, TransactionType } from '../../core/models';
import { forecastBalance, unallocated } from '../../shared/balances';
import { BalanceDialog, BalanceDialogData } from './balance.dialog';
import { UiService } from '../../shared/ui.service';
import { toIsoDate } from '../../shared/dates';
import { round2 } from '../../shared/money';
import { TransactionDialog, TransactionDialogData } from './transaction.dialog';

interface Row extends Transaction { balance: number; }

@Component({
  selector: 'app-finance',
  imports: [CurrencyPipe, DatePipe, FormsModule, MatTableModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule, MatProgressBarModule, MatTooltipModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Finanças</h1>
        <button matButton="filled" (click)="create()"><mat-icon>add</mat-icon> Novo movimento</button>
      </div>

      <div class="balances">
        @for (b of forecasts(); track b.account) {
          <div class="card balance">
            <div class="balance-head">
              <mat-icon>{{ b.account === 'bank' ? 'account_balance' : 'payments' }}</mat-icon>
              <span>{{ b.account === 'bank' ? 'Conta bancária' : 'Numerário' }}</span>
              <span class="spacer"></span>
              <button matButton (click)="confirmBalance(b.account)"><mat-icon>fact_check</mat-icon> Confirmar saldo</button>
            </div>
            <div class="balance-main"><span class="muted">Saldo atual</span><strong>{{ b.forecast | currency:'EUR' }}</strong></div>
            <div class="muted small">
              @if (b.storedDate) {
                Saldo confirmado de {{ b.stored | currency:'EUR' }} em {{ b.storedDate | date:'dd/MM/yyyy' }}
                + {{ b.count }} {{ b.count === 1 ? 'movimento' : 'movimentos' }} desde então ({{ b.movements | currency:'EUR' }})
              } @else {
                Sem saldo confirmado · calculado só a partir dos {{ b.count }} {{ b.count === 1 ? 'movimento' : 'movimentos' }} ({{ b.movements | currency:'EUR' }})
              }
            </div>
          </div>
        }
        @if (unallocatedCount() > 0) {
          <div class="card balance warn">
            <div class="balance-head"><mat-icon>help_outline</mat-icon><span>Sem método de pagamento</span></div>
            <div class="balance-main"><span class="muted">Movimentos</span><strong>{{ unallocatedCount() }}</strong></div>
            <div class="muted small">Não entram no saldo de nenhuma conta. Edite-os e indique o método de pagamento.</div>
          </div>
        }
      </div>

      <div class="tiles">
        <div class="card tile"><span class="muted">Receitas (período)</span><strong class="income">{{ totals().income | currency:'EUR' }}</strong></div>
        <div class="card tile"><span class="muted">Despesas (período)</span><strong class="expense">{{ totals().expense | currency:'EUR' }}</strong></div>
        <div class="card tile"><span class="muted">Apuramento (período)</span><strong [class.expense]="totals().net < 0">{{ totals().net | currency:'EUR' }}</strong></div>
        <div class="card tile"><span class="muted">Acumulado dos movimentos (histórico)</span><strong>{{ overallBalance() | currency:'EUR' }}</strong></div>
      </div>

      <div class="toolbar">
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Período</mat-label>
          <mat-date-range-input [rangePicker]="rp">
            <input matStartDate [ngModel]="from()" (ngModelChange)="from.set($event)" placeholder="Início" />
            <input matEndDate [ngModel]="to()" (ngModelChange)="to.set($event)" placeholder="Fim" />
          </mat-date-range-input>
          <mat-datepicker-toggle matSuffix [for]="rp" />
          <mat-date-range-picker #rp />
        </mat-form-field>
        <button matButton (click)="setYear(currentYear)">{{ currentYear }}</button>
        <button matButton (click)="setYear(currentYear - 1)">{{ currentYear - 1 }}</button>
        <button matButton (click)="from.set(null); to.set(null)">Tudo</button>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Tipo</mat-label>
          <mat-select [ngModel]="type()" (ngModelChange)="type.set($event)">
            <mat-option [value]="null">Todos</mat-option>
            <mat-option value="income">Receitas</mat-option>
            <mat-option value="expense">Despesas</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Categoria</mat-label>
          <mat-select [ngModel]="categoryId()" (ngModelChange)="categoryId.set($event)">
            <mat-option [value]="null">Todas</mat-option>
            @for (c of categories(); track c.id) { <mat-option [value]="c.id">{{ c.name }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Pesquisar</mat-label>
          <input matInput [ngModel]="search()" (ngModelChange)="search.set($event)" />
          <mat-icon matSuffix>search</mat-icon>
        </mat-form-field>
      </div>

      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }

      <div class="table-wrap">
        <table mat-table [dataSource]="rows()">
          <ng-container matColumnDef="date">
            <th mat-header-cell *matHeaderCellDef>Data</th>
            <td mat-cell *matCellDef="let t">{{ t.date | date:'dd/MM/yyyy' }}</td>
          </ng-container>
          <ng-container matColumnDef="description">
            <th mat-header-cell *matHeaderCellDef>Descrição</th>
            <td mat-cell *matCellDef="let t">
              {{ t.description }}
              @if (t.fee_id || t.joining_fee_member_id) { <mat-icon class="fee-icon" [matTooltip]="t.fee_id ? 'Gerado por pagamento de quota' : 'Gerado por pagamento de joia'">card_membership</mat-icon> }
              @if (t.notes) { <div class="muted small">{{ t.notes }}</div> }
            </td>
          </ng-container>
          <ng-container matColumnDef="category">
            <th mat-header-cell *matHeaderCellDef>Categoria</th>
            <td mat-cell *matCellDef="let t">
              {{ t.category?.name }}
              @if (t.payment_method) { <div class="muted small">{{ t.payment_method.name }}</div> }
            </td>
          </ng-container>
          <ng-container matColumnDef="income">
            <th mat-header-cell *matHeaderCellDef class="num">Receita</th>
            <td mat-cell *matCellDef="let t" class="num income">{{ t.type === 'income' ? (t.amount | currency:'EUR') : '' }}</td>
          </ng-container>
          <ng-container matColumnDef="expense">
            <th mat-header-cell *matHeaderCellDef class="num">Despesa</th>
            <td mat-cell *matCellDef="let t" class="num expense">{{ t.type === 'expense' ? (t.amount | currency:'EUR') : '' }}</td>
          </ng-container>
          <ng-container matColumnDef="balance">
            <th mat-header-cell *matHeaderCellDef class="num">Saldo</th>
            <td mat-cell *matCellDef="let t" class="num muted">{{ t.balance | currency:'EUR' }}</td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let t" class="num actions">
              <button matIconButton (click)="edit(t)" matTooltip="Editar"><mat-icon>edit</mat-icon></button>
              <button matIconButton (click)="remove(t)" [disabled]="!!t.fee_id || !!t.joining_fee_member_id" matTooltip="Eliminar"><mat-icon>delete</mat-icon></button>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="cols"></tr>
          <tr mat-row *matRowDef="let row; columns: cols"></tr>
        </table>
        @if (!loading() && rows().length === 0) { <div class="empty">Sem movimentos para mostrar.</div> }
      </div>
    </div>
  `,
  styles: [`
    .balances { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin-bottom: 12px; }
    .balance-head { display: flex; align-items: center; gap: 8px; font-weight: 500; }
    .balance-main { display: flex; align-items: baseline; gap: 10px; margin: 6px 0 2px; }
    .balance-main strong { font-size: 22px; }
    .balance.warn { border-left: 4px solid #e0a800; }
    .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .tile { display: flex; flex-direction: column; gap: 4px; }
    .tile strong { font-size: 20px; }
    .small { font-size: 12px; }
    .fee-icon { font-size: 16px; width: 16px; height: 16px; vertical-align: middle; margin-left: 4px; color: var(--mat-sys-on-surface-variant); }
    .actions { white-space: nowrap; }
  `],
})
export class FinancePage {
  private readonly data = inject(DataService);
  private readonly ui = inject(UiService);
  private readonly dialog = inject(MatDialog);

  readonly cols = ['date', 'description', 'category', 'income', 'expense', 'balance', 'actions'];
  readonly currentYear = new Date().getFullYear();
  readonly loading = signal(true);
  readonly all = signal<Transaction[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly paymentMethods = signal<PaymentMethod[]>([]);
  readonly settings = signal<Settings | null>(null);

  readonly forecasts = computed(() => {
    const s = this.settings();
    if (!s) return [];
    return (['bank', 'cash'] as AccountKind[]).map((a) => forecastBalance(a, s, this.all()));
  });
  readonly unallocatedCount = computed(() => {
    const s = this.settings();
    const after = s ? [s.bank_balance_date, s.cash_balance_date].filter(Boolean).sort()[0] ?? null : null;
    return unallocated(this.all(), after).length;
  });

  readonly from = signal<Date | null>(new Date(this.currentYear, 0, 1));
  readonly to = signal<Date | null>(new Date(this.currentYear, 11, 31));
  readonly type = signal<TransactionType | null>(null);
  readonly categoryId = signal<string | null>(null);
  readonly search = signal('');

  /** All transactions, newest first, with running balance computed from the oldest. */
  private readonly withBalance = computed<Row[]>(() => {
    const asc = [...this.all()].sort((a, b) => a.date.localeCompare(b.date) || (a.created_at ?? '').localeCompare(b.created_at ?? ''));
    let bal = 0;
    const rows: Row[] = asc.map((t) => {
      bal = round2(bal + (t.type === 'income' ? t.amount : -t.amount));
      return { ...t, balance: bal };
    });
    return rows.reverse();
  });

  readonly overallBalance = computed(() => this.withBalance()[0]?.balance ?? 0);

  readonly rows = computed(() => {
    const from = toIsoDate(this.from());
    const to = toIsoDate(this.to());
    const type = this.type();
    const cat = this.categoryId();
    const q = this.search().trim().toLowerCase();
    return this.withBalance().filter((t) => {
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      if (type && t.type !== type) return false;
      if (cat && t.category_id !== cat) return false;
      if (q && !`${t.description} ${t.notes ?? ''} ${t.category?.name ?? ''} ${t.payment_method?.name ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  readonly totals = computed(() => {
    let income = 0, expense = 0;
    for (const t of this.rows()) t.type === 'income' ? (income += t.amount) : (expense += t.amount);
    return { income: round2(income), expense: round2(expense), net: round2(income - expense) };
  });

  constructor() {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const [tx, cats, pms, st] = await Promise.all([this.data.listTransactions(), this.data.listCategories(true), this.data.listPaymentMethods(), this.data.getSettings()]);
      this.all.set(tx);
      this.categories.set(cats);
      this.paymentMethods.set(pms);
      this.settings.set(st);
    } catch (e) {
      this.ui.error(e);
    } finally {
      this.loading.set(false);
    }
  }

  confirmBalance(account: AccountKind) {
    const forecast = this.forecasts().find((f) => f.account === account)!;
    const data: BalanceDialogData = { account, forecast };
    this.dialog.open(BalanceDialog, { width: '560px', data }).afterClosed().subscribe((s) => s && this.load());
  }

  setYear(y: number) {
    this.from.set(new Date(y, 0, 1));
    this.to.set(new Date(y, 11, 31));
  }

  create() {
    this.openDialog(null);
  }

  edit(t: Transaction) {
    this.openDialog(t);
  }

  private openDialog(transaction: Transaction | null) {
    const data: TransactionDialogData = { transaction, categories: this.categories(), paymentMethods: this.paymentMethods() };
    this.dialog.open(TransactionDialog, { width: '640px', data }).afterClosed().subscribe((s) => s && this.load());
  }

  async remove(t: Transaction) {
    const ok = await this.ui.confirm({ title: 'Eliminar movimento', message: `Eliminar "${t.description}"?`, confirmLabel: 'Eliminar', danger: true });
    if (!ok) return;
    try {
      await this.data.deleteTransaction(t.id);
      this.ui.toast('Movimento eliminado.');
      this.load();
    } catch (e) {
      this.ui.error(e);
    }
  }
}
