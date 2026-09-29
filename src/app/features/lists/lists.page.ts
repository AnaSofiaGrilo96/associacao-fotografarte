import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { fromIsoDate, toIsoDate } from '../../shared/dates';
import { round2 } from '../../shared/money';
import { firstValueFrom } from 'rxjs';
import { DataService } from '../../core/data.service';
import { Category, InactiveReason, PaymentMethod, Settings, TransactionType } from '../../core/models';
import { UiService } from '../../shared/ui.service';
import { NameDialog, NameDialogData } from '../../shared/name-dialog';
import { ListItem, SecondaryAction, SimpleList } from './simple-list';

@Component({
  selector: 'app-lists',
  imports: [ReactiveFormsModule, MatTabsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatDatepickerModule, SimpleList],
  template: `
    <div class="page">
      <div class="page-header"><h1>Listas e definições</h1></div>
      <mat-tab-group>
        <mat-tab label="Categorias financeiras">
          <div class="two">
            <app-simple-list title="Receitas" [items]="incomeCats()"
              (add)="addCategory('income')" (rename)="renameCategory($event)" (toggle)="toggleCategory($event)" (remove)="removeCategory($event)" />
            <app-simple-list title="Despesas" [items]="expenseCats()"
              (add)="addCategory('expense')" (rename)="renameCategory($event)" (toggle)="toggleCategory($event)" (remove)="removeCategory($event)" />
          </div>
        </mat-tab>
        <mat-tab label="Motivos de inatividade">
          <div class="one">
            <app-simple-list title="Motivos (desistência, falta de pagamento, …)" [items]="reasons()"
              (add)="addReason()" (rename)="renameReason($event)" (toggle)="toggleReason($event)" (remove)="removeReason($event)" />
          </div>
        </mat-tab>
        <mat-tab label="Métodos de pagamento">
          <div class="one">
            <p class="muted hint">Cada método está associado à conta bancária ou ao numerário; é isso que determina em que conta cada movimento entra ou sai. Use o botão de cada linha para trocar.</p>
            <app-simple-list title="Métodos (numerário, transferência, …)" [items]="methods()" [subtitleOf]="methodSubtitle" [secondaryAction]="methodAccountAction"
              (add)="addMethod()" (rename)="renameMethod($event)" (toggle)="toggleMethod($event)" (remove)="removeMethod($event)" (secondary)="toggleMethodAccount($event)" />
          </div>
        </mat-tab>
        <mat-tab label="Definições">
          <div class="one">
            <div class="card">
              <form [formGroup]="settingsForm" (ngSubmit)="saveSettings()" class="form-grid">
                <mat-form-field class="full">
                  <mat-label>Nome da associação</mat-label>
                  <input matInput formControlName="association_name" />
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Valor da quota anual (por defeito)</mat-label>
                  <input matInput type="number" step="0.01" min="0" formControlName="default_fee_amount" />
                  <span matTextSuffix>€</span>
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Valor da joia de novo associado</mat-label>
                  <input matInput type="number" step="0.01" min="0" formControlName="default_joining_fee_amount" />
                  <span matTextSuffix>€</span>
                </mat-form-field>
                <div class="full section">Saldos iniciais <span class="muted">— o que havia quando a app começou a ser usada; os movimentos posteriores à data de referência somam-se a estes valores. Enquanto não houver relatórios finais, a soma serve de saldo da gerência anterior.</span></div>
                <mat-form-field>
                  <mat-label>Saldo inicial em conta bancária</mat-label>
                  <input matInput type="number" step="0.01" formControlName="bank_balance" />
                  <span matTextSuffix>€</span>
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Saldo inicial em numerário</mat-label>
                  <input matInput type="number" step="0.01" formControlName="cash_balance" />
                  <span matTextSuffix>€</span>
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Data de referência</mat-label>
                  <input matInput [matDatepicker]="dp" formControlName="balance_date" />
                  <mat-datepicker-toggle matSuffix [for]="dp" />
                  <mat-datepicker #dp />
                  <mat-hint>Movimentos até esta data (inclusive) não contam</mat-hint>
                </mat-form-field>
                <mat-form-field class="full">
                  <mat-label>Rodapé do relatório (opcional)</mat-label>
                  <input matInput formControlName="report_footer" placeholder="Ex.: NIPC, morada, contactos" />
                </mat-form-field>
                <div class="full"><button matButton="filled" type="submit" [disabled]="settingsForm.invalid">Guardar definições</button></div>
              </form>
            </div>
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: [`
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding-top: 16px; }
    .one { padding-top: 16px; max-width: 760px; }
    .hint { margin: 0 0 12px; font-size: 13px; }
    .section { font-weight: 500; margin: 8px 0 4px; }
    .section .muted { font-weight: 400; font-size: 13px; }
    @media (max-width: 900px) { .two { grid-template-columns: 1fr; } }
  `],
})
export class ListsPage {
  private readonly data = inject(DataService);
  private readonly ui = inject(UiService);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);

  readonly categories = signal<Category[]>([]);
  readonly reasons = signal<InactiveReason[]>([]);
  readonly methods = signal<PaymentMethod[]>([]);
  readonly methodSubtitle = (it: ListItem) => (it.account === 'cash' ? 'Numerário' : 'Conta bancária');
  readonly methodAccountAction: SecondaryAction = {
    icon: (it) => (it.account === 'cash' ? 'payments' : 'account_balance'),
    tooltip: (it) => (it.account === 'cash' ? 'Passar a conta bancária' : 'Passar a numerário'),
  };
  readonly incomeCats = computed(() => this.categories().filter((c) => c.type === 'income'));
  readonly expenseCats = computed(() => this.categories().filter((c) => c.type === 'expense'));

  readonly settingsForm = this.fb.nonNullable.group({
    association_name: ['', Validators.required],
    default_fee_amount: [0, [Validators.required, Validators.min(0)]],
    default_joining_fee_amount: [0, [Validators.required, Validators.min(0)]],
    bank_balance: [0, Validators.required],
    cash_balance: [0, Validators.required],
    balance_date: [null as Date | null],
    report_footer: [''],
  });

  constructor() {
    this.loadAll();
  }

  async loadAll() {
    try {
      const [c, r, pm, s] = await Promise.all([this.data.listCategories(true), this.data.listReasons(true), this.data.listPaymentMethods(true), this.data.getSettings()]);
      this.categories.set(c);
      this.reasons.set(r);
      this.methods.set(pm);
      this.settingsForm.patchValue({
        association_name: s.association_name,
        default_fee_amount: s.default_fee_amount,
        default_joining_fee_amount: s.default_joining_fee_amount,
        bank_balance: s.bank_balance,
        cash_balance: s.cash_balance,
        balance_date: fromIsoDate(s.bank_balance_date ?? s.cash_balance_date),
        report_footer: s.report_footer ?? '',
      });
    } catch (e) {
      this.ui.error(e);
    }
  }

  private ask(data: NameDialogData): Promise<string | undefined> {
    return firstValueFrom(this.dialog.open(NameDialog, { width: '420px', data }).afterClosed());
  }

  private async run(fn: () => Promise<unknown>, msg = 'Guardado.') {
    try { await fn(); this.ui.toast(msg); await this.loadAll(); } catch (e) { this.ui.error(e); }
  }

  // Categories
  async addCategory(type: TransactionType) {
    const name = await this.ask({ title: type === 'income' ? 'Nova categoria de receita' : 'Nova categoria de despesa' });
    if (name) this.run(() => this.data.saveCategory({ name, type, active: true, is_system: false, sort_order: 100 }));
  }
  async renameCategory(it: ListItem) {
    const name = await this.ask({ title: 'Renomear categoria', value: it.name });
    if (name) this.run(() => this.data.saveCategory({ id: it.id, name }));
  }
  toggleCategory(it: ListItem) {
    this.run(() => this.data.saveCategory({ id: it.id, active: !it.active }));
  }
  async removeCategory(it: ListItem) {
    if (await this.ui.confirm({ title: 'Eliminar categoria', message: `Eliminar "${it.name}"? Só é possível se não existirem movimentos com esta categoria; em alternativa, desative-a.`, confirmLabel: 'Eliminar', danger: true })) {
      this.run(() => this.data.deleteCategory(it.id), 'Categoria eliminada.');
    }
  }

  // Reasons
  async addReason() {
    const name = await this.ask({ title: 'Novo motivo de inatividade' });
    if (name) this.run(() => this.data.saveReason({ name, active: true, sort_order: 100 }));
  }
  async renameReason(it: ListItem) {
    const name = await this.ask({ title: 'Renomear motivo', value: it.name });
    if (name) this.run(() => this.data.saveReason({ id: it.id, name }));
  }
  toggleReason(it: ListItem) {
    this.run(() => this.data.saveReason({ id: it.id, active: !it.active }));
  }
  async removeReason(it: ListItem) {
    if (await this.ui.confirm({ title: 'Eliminar motivo', message: `Eliminar "${it.name}"? Só é possível se nenhum associado o estiver a usar; em alternativa, desative-o.`, confirmLabel: 'Eliminar', danger: true })) {
      this.run(() => this.data.deleteReason(it.id), 'Motivo eliminado.');
    }
  }

  // Payment methods
  async addMethod() {
    const name = await this.ask({ title: 'Novo método de pagamento' });
    if (name) this.run(() => this.data.savePaymentMethod({ name, account: 'bank', active: true, sort_order: 100 }));
  }
  async renameMethod(it: ListItem) {
    const name = await this.ask({ title: 'Renomear método', value: it.name });
    if (name) this.run(() => this.data.savePaymentMethod({ id: it.id, name }));
  }
  toggleMethod(it: ListItem) {
    this.run(() => this.data.savePaymentMethod({ id: it.id, active: !it.active }));
  }
  toggleMethodAccount(it: ListItem) {
    this.run(() => this.data.savePaymentMethod({ id: it.id, account: it.account === 'cash' ? 'bank' : 'cash' }));
  }
  async removeMethod(it: ListItem) {
    if (await this.ui.confirm({ title: 'Eliminar método', message: `Eliminar "${it.name}"? Só é possível se não estiver a ser usado em pagamentos; em alternativa, desative-o.`, confirmLabel: 'Eliminar', danger: true })) {
      this.run(() => this.data.deletePaymentMethod(it.id), 'Método eliminado.');
    }
  }

  // Settings
  saveSettings() {
    if (this.settingsForm.invalid) return;
    const v = this.settingsForm.getRawValue();
    const payload: Partial<Settings> = {
      association_name: v.association_name.trim(),
      default_fee_amount: Number(v.default_fee_amount),
      default_joining_fee_amount: Number(v.default_joining_fee_amount),
      bank_balance: Number(v.bank_balance),
      cash_balance: Number(v.cash_balance),
      bank_balance_date: toIsoDate(v.balance_date),
      cash_balance_date: toIsoDate(v.balance_date),
      initial_balance: round2(Number(v.bank_balance) + Number(v.cash_balance)),
      report_footer: v.report_footer.trim() || null,
    };
    this.run(() => this.data.saveSettings(payload), 'Definições guardadas.');
  }
}
