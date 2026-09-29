import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DataService } from '../../core/data.service';
import { Member } from '../../core/models';
import { UiService } from '../../shared/ui.service';
import { MemberDialog } from './member.dialog';

@Component({
  selector: 'app-members',
  imports: [DatePipe, FormsModule, RouterLink, MatTableModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatProgressBarModule, MatTooltipModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Associados</h1>
        <span class="muted">{{ filtered().length }} de {{ members().length }}</span>
        <button matButton="filled" (click)="create()"><mat-icon>person_add</mat-icon> Novo associado</button>
      </div>

      <div class="toolbar">
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Pesquisar</mat-label>
          <input matInput [ngModel]="search()" (ngModelChange)="search.set($event)" placeholder="Nome, email, NIF, nº" />
          <mat-icon matSuffix>search</mat-icon>
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Estado</mat-label>
          <mat-select [ngModel]="status()" (ngModelChange)="status.set($event)">
            <mat-option value="all">Todos</mat-option>
            <mat-option value="active">Ativos</mat-option>
            <mat-option value="inactive">Inativos</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Quota de {{ currentYear }}</mat-label>
          <mat-select [ngModel]="feeFilter()" (ngModelChange)="feeFilter.set($event)">
            <mat-option value="all">Todos</mat-option>
            <mat-option value="paid">Paga</mat-option>
            <mat-option value="unpaid">Em falta</mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }

      <div class="table-wrap">
        <table mat-table [dataSource]="filtered()">
          <ng-container matColumnDef="photo">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let m">
              <div class="avatar">
                @if (photos()[m.photo_path]) { <img [src]="photos()[m.photo_path]" alt="" /> } @else { <mat-icon>person</mat-icon> }
              </div>
            </td>
          </ng-container>
          <ng-container matColumnDef="number">
            <th mat-header-cell *matHeaderCellDef>Nº</th>
            <td mat-cell *matCellDef="let m">{{ m.member_number ?? '—' }}</td>
          </ng-container>
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>Nome</th>
            <td mat-cell *matCellDef="let m"><a [routerLink]="['/associados', m.id]" class="link">{{ m.name }}</a></td>
          </ng-container>
          <ng-container matColumnDef="contacts">
            <th mat-header-cell *matHeaderCellDef>Contactos</th>
            <td mat-cell *matCellDef="let m">
              <div>{{ m.email || '' }}</div>
              <div class="muted">{{ m.phone || '' }}</div>
            </td>
          </ng-container>
          <ng-container matColumnDef="nif">
            <th mat-header-cell *matHeaderCellDef>NIF</th>
            <td mat-cell *matCellDef="let m">{{ m.nif || '—' }}</td>
          </ng-container>
          <ng-container matColumnDef="joined">
            <th mat-header-cell *matHeaderCellDef>Entrada</th>
            <td mat-cell *matCellDef="let m">{{ m.joined_at | date:'dd/MM/yyyy' }}</td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>Estado</th>
            <td mat-cell *matCellDef="let m">
              <span class="status-chip" [class]="'status-chip ' + m.status">{{ m.status === 'active' ? 'Ativo' : 'Inativo' }}</span>
              @if (m.status === 'inactive' && m.inactive_reason) { <div class="muted small">{{ m.inactive_reason.name }}</div> }
            </td>
          </ng-container>
          <ng-container matColumnDef="fees">
            <th mat-header-cell *matHeaderCellDef>Quotas pagas</th>
            <td mat-cell *matCellDef="let m">
              <span [matTooltip]="paidYears(m).join(', ')">{{ feeSummary(m) }}</span>
            </td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let m" class="num">
              <button matIconButton (click)="edit(m, $event)" matTooltip="Editar"><mat-icon>edit</mat-icon></button>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="cols"></tr>
          <tr mat-row *matRowDef="let row; columns: cols" (click)="open(row)" class="clickable"></tr>
        </table>
        @if (!loading() && filtered().length === 0) { <div class="empty">Sem associados para mostrar.</div> }
      </div>
    </div>
  `,
  styles: [`
    .link { color: inherit; font-weight: 500; text-decoration: none; }
    .link:hover { text-decoration: underline; }
    .small { font-size: 12px; }
    .clickable { cursor: pointer; }
    .avatar { width: 36px; height: 36px; border-radius: 50%; overflow: hidden; background: var(--mat-sys-surface-container-high); display: grid; place-items: center; }
    .avatar img { width: 100%; height: 100%; object-fit: cover; }
    .avatar mat-icon { color: var(--mat-sys-on-surface-variant); }
  `],
})
export class MembersPage {
  private readonly data = inject(DataService);
  private readonly ui = inject(UiService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  readonly cols = ['photo', 'number', 'name', 'contacts', 'nif', 'joined', 'status', 'fees', 'actions'];
  readonly currentYear = new Date().getFullYear();
  readonly members = signal<Member[]>([]);
  readonly photos = signal<Record<string, string>>({});
  readonly loading = signal(true);
  readonly search = signal('');
  readonly status = signal<'all' | 'active' | 'inactive'>('all');
  readonly feeFilter = signal<'all' | 'paid' | 'unpaid'>('all');

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const st = this.status();
    const ff = this.feeFilter();
    return this.members().filter((m) => {
      if (st !== 'all' && m.status !== st) return false;
      if (ff !== 'all') {
        const paid = (m.membership_fees ?? []).some((f) => f.year === this.currentYear);
        if (ff === 'paid' && !paid) return false;
        if (ff === 'unpaid' && paid) return false;
      }
      if (!q) return true;
      return [m.name, m.email, m.phone, m.nif, String(m.member_number ?? '')]
        .some((v) => (v ?? '').toLowerCase().includes(q));
    });
  });

  constructor() {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const members = await this.data.listMembers();
      this.members.set(members);
      this.photos.set(await this.data.photoUrls(members.map((m) => m.photo_path!).filter(Boolean)));
    } catch (e) {
      this.ui.error(e);
    } finally {
      this.loading.set(false);
    }
  }

  paidYears(m: Member): number[] {
    return (m.membership_fees ?? []).map((f) => f.year).sort((a, b) => a - b);
  }

  feeSummary(m: Member): string {
    const years = this.paidYears(m);
    if (!years.length) return '—';
    if (years.length <= 3) return years.join(', ');
    return `${years.length} anos (até ${years[years.length - 1]})`;
  }

  open(m: Member) {
    this.router.navigate(['/associados', m.id]);
  }

  create() {
    this.dialog.open(MemberDialog, { width: '720px', data: null }).afterClosed().subscribe((saved) => {
      if (saved) this.load();
    });
  }

  edit(m: Member, ev: Event) {
    ev.stopPropagation();
    this.dialog.open(MemberDialog, { width: '720px', data: m }).afterClosed().subscribe((saved) => {
      if (saved) this.load();
    });
  }
}
