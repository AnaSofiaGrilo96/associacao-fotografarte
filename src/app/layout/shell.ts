import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from '../core/auth.service';
import { DataService } from '../core/data.service';
import { ChangePasswordDialog } from '../features/auth/change-password.dialog';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatSidenavModule, MatToolbarModule, MatListModule, MatIconModule, MatButtonModule, MatMenuModule],
  template: `
    <mat-sidenav-container class="container">
      <mat-sidenav #nav [mode]="isSmall() ? 'over' : 'side'" [opened]="!isSmall()" class="sidenav">
        <div class="brand">
          <mat-icon>groups</mat-icon>
          <span>{{ associationName() }}</span>
        </div>
        <mat-nav-list>
          @for (item of navItems; track item.path) {
            <a mat-list-item [routerLink]="item.path" routerLinkActive="active" (click)="isSmall() && nav.close()">
              <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
              <span matListItemTitle>{{ item.label }}</span>
            </a>
          }
        </mat-nav-list>
      </mat-sidenav>
      <mat-sidenav-content>
        <mat-toolbar class="topbar">
          @if (isSmall()) {
            <button matIconButton (click)="nav.toggle()" aria-label="Menu"><mat-icon>menu</mat-icon></button>
          }
          <span class="spacer"></span>
          <button matButton [matMenuTriggerFor]="userMenu">
            <mat-icon>account_circle</mat-icon>
            <span class="email">{{ auth.user()?.email }}</span>
          </button>
          <mat-menu #userMenu="matMenu">
            <button mat-menu-item (click)="changePassword()"><mat-icon>key</mat-icon>Alterar password</button>
            <button mat-menu-item (click)="logout()"><mat-icon>logout</mat-icon>Sair</button>
          </mat-menu>
        </mat-toolbar>
        <router-outlet />
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: [`
    .container { height: 100vh; }
    .sidenav { width: 240px; border-right: none; }
    .brand { display: flex; align-items: center; gap: 10px; padding: 20px 16px 12px; font-weight: 500; font-size: 16px; }
    .topbar { background: var(--mat-sys-surface); border-bottom: 1px solid var(--mat-sys-outline-variant); position: sticky; top: 0; z-index: 10; }
    .email { margin-left: 6px; }
    a.active { background: var(--mat-sys-secondary-container); border-radius: 24px; }
    @media (max-width: 600px) { .email { display: none; } }
  `],
})
export class Shell {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly data = inject(DataService);
  private readonly dialog = inject(MatDialog);
  private readonly bp = inject(BreakpointObserver);

  readonly isSmall = toSignal(this.bp.observe('(max-width: 900px)').pipe(map((r) => r.matches)), { initialValue: false });
  readonly associationName = signal('Associação');

  readonly navItems = [
    { path: '/associados', icon: 'people', label: 'Associados' },
    { path: '/financas', icon: 'account_balance', label: 'Finanças' },
    { path: '/relatorios', icon: 'summarize', label: 'Relatórios' },
    { path: '/listas', icon: 'list_alt', label: 'Listas e definições' },
  ];

  constructor() {
    this.data.getSettings().then((s) => this.associationName.set(s.association_name)).catch(() => {});
  }

  changePassword() {
    this.dialog.open(ChangePasswordDialog, { width: '400px' });
  }

  async logout() {
    await this.auth.signOut();
    this.router.navigate(['/login']);
  }
}
