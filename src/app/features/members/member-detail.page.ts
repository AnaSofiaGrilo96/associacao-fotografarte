import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { DataService } from '../../core/data.service';
import { Member, MembershipFee, Settings } from '../../core/models';
import { UiService } from '../../shared/ui.service';
import { resizeImage } from '../../shared/images';
import { MemberDialog } from './member.dialog';
import { FeeDialog, FeeDialogData } from './fee.dialog';
import { JoiningFeeDialog, JoiningFeeDialogData } from './joining-fee.dialog';

@Component({
  selector: 'app-member-detail',
  imports: [DatePipe, CurrencyPipe, RouterLink, MatTableModule, MatButtonModule, MatIconModule, MatProgressBarModule, MatTooltipModule, MatMenuModule],
  template: `
    <div class="page">
      <div class="page-header">
        <a matIconButton routerLink="/associados" aria-label="Voltar"><mat-icon>arrow_back</mat-icon></a>
        <h1>{{ member()?.name || 'Associado' }}</h1>
        @if (member(); as m) {
          <span class="status-chip" [class]="'status-chip ' + m.status">{{ m.status === 'active' ? 'Ativo' : 'Inativo' }}</span>
          <button matButton (click)="edit()"><mat-icon>edit</mat-icon> Editar</button>
          <button matButton (click)="remove()" class="danger"><mat-icon>delete</mat-icon> Eliminar</button>
        }
      </div>

      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }

      @if (member(); as m) {
        <div class="grid">
          <div class="card">
            <div class="photo-row">
              <div class="photo" [class.empty]="!photoUrl()">
                @if (photoUrl()) { <img [src]="photoUrl()" alt="Foto de {{ m.name }}" /> } @else { <mat-icon>person</mat-icon> }
                @if (uploading()) { <mat-progress-bar mode="indeterminate" class="photo-progress" /> }
              </div>
              <div class="photo-actions">
                <button matButton (click)="fileInput.click()" [disabled]="uploading()"><mat-icon>add_a_photo</mat-icon> {{ m.photo_path ? 'Substituir foto' : 'Adicionar foto' }}</button>
                @if (m.photo_path) { <button matButton (click)="removePhoto()" [disabled]="uploading()"><mat-icon>no_photography</mat-icon> Remover</button> }
                <input #fileInput type="file" accept="image/jpeg,image/png,image/webp" hidden (change)="onPhotoSelected($event)" />
              </div>
            </div>

            <h2>Dados</h2>
            <dl>
              <dt>Nº de associado</dt><dd>{{ m.member_number ?? '—' }}</dd>
              <dt>Email</dt><dd>{{ m.email || '—' }}</dd>
              <dt>Telefone</dt><dd>{{ m.phone || '—' }}</dd>
              <dt>NIF</dt><dd>{{ m.nif || '—' }}</dd>
              <dt>Morada</dt><dd>{{ m.address || '—' }}</dd>
              <dt>Data de entrada</dt><dd>{{ m.joined_at | date:'dd/MM/yyyy' }}</dd>
              @if (m.status === 'inactive') {
                <dt>Motivo</dt><dd>{{ m.inactive_reason?.name || '—' }}</dd>
                <dt>Data de saída</dt><dd>{{ m.inactive_at ? (m.inactive_at | date:'dd/MM/yyyy') : '—' }}</dd>
              }
              @if (m.notes) { <dt>Notas</dt><dd class="pre">{{ m.notes }}</dd> }
            </dl>
          </div>

          <div class="card">
            <div class="page-header">
              <h2>Quotas</h2>
              <button matButton="filled" (click)="addFee()"><mat-icon>payments</mat-icon> Registar pagamento</button>
            </div>

            <div class="joia" [class.paid]="m.joining_fee_paid_on">
              <mat-icon>{{ m.joining_fee_paid_on ? 'verified' : 'radio_button_unchecked' }}</mat-icon>
              <div class="joia-text">
                @if (m.joining_fee_paid_on) {
                  <strong>Joia paga</strong> em {{ m.joining_fee_paid_on | date:'dd/MM/yyyy' }} · {{ m.joining_fee_amount | currency:'EUR' }}
                  @if (joiningMethod()) { <span class="muted">· {{ joiningMethod() }}</span> }
                } @else {
                  <strong>Joia</strong>&nbsp;<span class="muted">ainda não registada</span>
                }
              </div>
              <button matIconButton [matMenuTriggerFor]="joiaMenu" aria-label="Opções da joia"><mat-icon>more_vert</mat-icon></button>
              <mat-menu #joiaMenu="matMenu">
                <button mat-menu-item (click)="editJoiningFee()"><mat-icon>edit</mat-icon>{{ m.joining_fee_paid_on ? 'Editar joia' : 'Registar joia' }}</button>
                @if (m.joining_fee_paid_on) { <button mat-menu-item (click)="removeJoiningFee()"><mat-icon>delete</mat-icon>Remover joia</button> }
              </mat-menu>
            </div>

            @if (unpaidYears().length) {
              <p class="muted">Quotas em falta: {{ unpaidYears().join(', ') }}</p>
            }
            <table mat-table [dataSource]="fees()">
              <ng-container matColumnDef="year">
                <th mat-header-cell *matHeaderCellDef>Ano</th>
                <td mat-cell *matCellDef="let f"><strong>{{ f.year }}</strong></td>
              </ng-container>
              <ng-container matColumnDef="paid_on">
                <th mat-header-cell *matHeaderCellDef>Pago em</th>
                <td mat-cell *matCellDef="let f">{{ f.paid_on | date:'dd/MM/yyyy' }}</td>
              </ng-container>
              <ng-container matColumnDef="amount">
                <th mat-header-cell *matHeaderCellDef class="num">Valor</th>
                <td mat-cell *matCellDef="let f" class="num">{{ f.amount | currency:'EUR' }}</td>
              </ng-container>
              <ng-container matColumnDef="method">
                <th mat-header-cell *matHeaderCellDef>Método</th>
                <td mat-cell *matCellDef="let f">{{ f.payment_method?.name || '—' }}</td>
              </ng-container>
              <ng-container matColumnDef="notes">
                <th mat-header-cell *matHeaderCellDef>Notas</th>
                <td mat-cell *matCellDef="let f" class="muted">{{ f.notes || '' }}</td>
              </ng-container>
              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef></th>
                <td mat-cell *matCellDef="let f" class="num actions">
                  <button matIconButton (click)="editFee(f)" matTooltip="Editar"><mat-icon>edit</mat-icon></button>
                  <button matIconButton (click)="removeFee(f)" matTooltip="Eliminar"><mat-icon>delete</mat-icon></button>
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="feeCols"></tr>
              <tr mat-row *matRowDef="let row; columns: feeCols"></tr>
            </table>
            @if (!fees().length) { <div class="empty">Ainda não há quotas registadas.</div> }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .grid { display: grid; grid-template-columns: 1fr 1.4fr; gap: 16px; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
    h2 { font-size: 17px; font-weight: 500; margin: 0 0 12px; flex: 1; }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 16px; margin: 0; }
    dt { color: var(--mat-sys-on-surface-variant); }
    dd { margin: 0; }
    .pre { white-space: pre-wrap; }
    .danger { color: #b3261e; }
    .actions { white-space: nowrap; }
    .photo-row { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
    .photo { position: relative; width: 120px; height: 120px; border-radius: 50%; overflow: hidden; background: var(--mat-sys-surface-container-high); display: grid; place-items: center; flex-shrink: 0; }
    .photo img { width: 100%; height: 100%; object-fit: cover; }
    .photo mat-icon { font-size: 64px; width: 64px; height: 64px; color: var(--mat-sys-on-surface-variant); }
    .photo-progress { position: absolute; bottom: 0; left: 0; right: 0; }
    .photo-actions { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
    .joia { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 8px; background: var(--mat-sys-surface-container); margin-bottom: 12px; }
    .joia mat-icon { color: var(--mat-sys-on-surface-variant); }
    .joia.paid mat-icon { color: #1b7f3b; }
    .joia-text { flex: 1; }
  `],
})
export class MemberDetailPage {
  readonly id = input.required<string>();
  private readonly data = inject(DataService);
  private readonly ui = inject(UiService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  readonly feeCols = ['year', 'paid_on', 'amount', 'method', 'notes', 'actions'];
  readonly member = signal<Member | null>(null);
  readonly loading = signal(true);
  readonly uploading = signal(false);
  readonly settings = signal<Settings | null>(null);
  readonly photoUrl = signal<string | null>(null);
  readonly joiningMethod = signal<string | null>(null);

  readonly fees = computed(() => [...(this.member()?.membership_fees ?? [])].sort((a, b) => b.year - a.year));
  readonly unpaidYears = computed(() => {
    const m = this.member();
    if (!m || m.status !== 'active') return [];
    const start = Number(m.joined_at.slice(0, 4));
    const now = new Date().getFullYear();
    const paid = new Set(this.fees().map((f) => f.year));
    const out: number[] = [];
    for (let y = start; y <= now; y++) if (!paid.has(y)) out.push(y);
    return out;
  });

  constructor() {
    this.data.getSettings().then((s) => this.settings.set(s)).catch(() => {});
    // Reload whenever the route id changes (the component is reused between members).
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
  }

  async load(id: string = this.id()) {
    this.loading.set(true);
    try {
      const m = await this.data.getMember(id);
      this.member.set(m);
      if (m.photo_path) {
        const urls = await this.data.photoUrls([m.photo_path]);
        this.photoUrl.set(urls[m.photo_path] ?? null);
      } else {
        this.photoUrl.set(null);
      }
      if (m.joining_fee_payment_method_id) {
        const methods = await this.data.listPaymentMethods(true);
        this.joiningMethod.set(methods.find((x) => x.id === m.joining_fee_payment_method_id)?.name ?? null);
      } else {
        this.joiningMethod.set(null);
      }
    } catch (e) {
      this.ui.error(e);
    } finally {
      this.loading.set(false);
    }
  }

  edit() {
    this.dialog.open(MemberDialog, { width: '720px', data: this.member() }).afterClosed().subscribe((s) => s && this.load());
  }

  async remove() {
    const m = this.member()!;
    const ok = await this.ui.confirm({
      title: 'Eliminar associado',
      message: `Eliminar "${m.name}" e todas as suas quotas? Os movimentos financeiros das quotas e da joia também serão removidos. Esta ação não pode ser anulada.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      if (m.photo_path) await this.data.removeMemberPhoto(m).catch(() => {});
      await this.data.deleteMember(m.id);
      this.ui.toast('Associado eliminado.');
      this.router.navigate(['/associados']);
    } catch (e) {
      this.ui.error(e);
    }
  }

  // ---- Photo ----
  async onPhotoSelected(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.uploading.set(true);
    try {
      const blob = await resizeImage(file, 600);
      await this.data.uploadMemberPhoto(this.member()!, blob, 'jpg');
      this.ui.toast('Foto guardada.');
      await this.load();
    } catch (e) {
      this.ui.error(e);
    } finally {
      this.uploading.set(false);
    }
  }

  async removePhoto() {
    const ok = await this.ui.confirm({ title: 'Remover foto', message: 'Remover a foto deste associado?', confirmLabel: 'Remover', danger: true });
    if (!ok) return;
    this.uploading.set(true);
    try {
      await this.data.removeMemberPhoto(this.member()!);
      await this.load();
    } catch (e) {
      this.ui.error(e);
    } finally {
      this.uploading.set(false);
    }
  }

  // ---- Joining fee ----
  editJoiningFee() {
    const data: JoiningFeeDialogData = { member: this.member()!, defaultAmount: this.settings()?.default_joining_fee_amount ?? 0 };
    this.dialog.open(JoiningFeeDialog, { width: '520px', data }).afterClosed().subscribe((s) => s && this.load());
  }

  async removeJoiningFee() {
    const ok = await this.ui.confirm({ title: 'Remover joia', message: 'Remover o registo da joia? O movimento correspondente nas finanças também será removido.', confirmLabel: 'Remover', danger: true });
    if (!ok) return;
    try {
      await this.data.saveMember({ id: this.member()!.id, joining_fee_paid_on: null, joining_fee_amount: null, joining_fee_payment_method_id: null });
      this.ui.toast('Joia removida.');
      this.load();
    } catch (e) {
      this.ui.error(e);
    }
  }

  // ---- Fees ----
  addFee() {
    this.openFee(null);
  }

  editFee(f: MembershipFee) {
    this.openFee(f);
  }

  private openFee(fee: MembershipFee | null) {
    const s = this.settings();
    const data: FeeDialogData = { member: this.member()!, fee, defaultAmount: s?.default_fee_amount ?? 0, defaultJoiningFee: s?.default_joining_fee_amount ?? 0 };
    this.dialog.open(FeeDialog, { width: '600px', data }).afterClosed().subscribe((s) => s && this.load());
  }

  async removeFee(f: MembershipFee) {
    const ok = await this.ui.confirm({
      title: 'Eliminar pagamento',
      message: `Eliminar o pagamento da quota de ${f.year}? O movimento correspondente nas finanças também será removido.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.data.deleteFee(f.id);
      this.ui.toast('Pagamento eliminado.');
      this.load();
    } catch (e) {
      this.ui.error(e);
    }
  }
}
