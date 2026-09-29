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
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from '../core/auth.service';
import { THEMES, ThemeService } from '../core/theme.service';
import { DataService } from '../core/data.service';
import { ChangePasswordDialog } from '../features/auth/change-password.dialog';
import { ExportService } from '../features/export/export.service';
import { UiService } from '../shared/ui.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatSidenavModule, MatToolbarModule, MatListModule, MatIconModule, MatButtonModule, MatMenuModule, MatTooltipModule],
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
          <button matIconButton [matMenuTriggerFor]="themeMenu" matTooltip="Tema" aria-label="Tema"><mat-icon>palette</mat-icon></button>
          <mat-menu #themeMenu="matMenu" class="theme-menu">
            <div class="theme-grid" (click)="$event.stopPropagation()">
              @for (t of themes; track t.id) {
                <button type="button" class="swatch" [class.selected]="themeSvc.theme() === t.id" [style.background]="t.color" (click)="themeSvc.theme.set(t.id)" [matTooltip]="t.label" [attr.aria-label]="t.label"></button>
              }
            </div>
            <button mat-menu-item (click)="themeSvc.dark.set(!themeSvc.dark()); $event.stopPropagation()">
              <mat-icon>{{ themeSvc.dark() ? 'light_mode' : 'dark_mode' }}</mat-icon>{{ themeSvc.dark() ? 'Modo claro' : 'Modo escuro' }}
            </button>
          </mat-menu>
          <button matButton [matMenuTriggerFor]="userMenu">
            <mat-icon>account_circle</mat-icon>
            <span class="email">{{ auth.user()?.email }}</span>
          </button>
          <mat-menu #userMenu="matMenu">
            <button mat-menu-item (click)="changePassword()"><mat-icon>key</mat-icon>Alterar password</button>
            <button mat-menu-item (click)="exportAll()" [disabled]="exporting()"><mat-icon>download</mat-icon>{{ exporting() ? 'A exportar…' : 'Exportar tudo para Excel' }}</button>
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
    .theme-grid { display: grid; grid-template-columns: repeat(4, 32px); gap: 10px; padding: 12px 16px; }
    .swatch { width: 32px; height: 32px; border-radius: 50%; border: 3px solid transparent; cursor: pointer; padding: 0; }
    .swatch.selected { border-color: var(--mat-sys-on-surface); box-shadow: 0 0 0 2px var(--mat-sys-surface); }
  `],
})
export class Shell {
  readonly auth = inject(AuthService);
  readonly themeSvc = inject(ThemeService);
  readonly themes = THEMES;
  private readonly router = inject(Router);
  private readonly data = inject(DataService);
  private readonly dialog = inject(MatDialog);
  private readonly bp = inject(BreakpointObserver);

  readonly isSmall = toSignal(this.bp.observe('(max-width: 900px)').pipe(map((r) => r.matches)), { initialValue: false });
  readonly associationName = signal('Associação');
  readonly exporting = signal(false);
  private readonly exportSvc = inject(ExportService);
  private readonly ui = inject(UiService);

  readonly navItems = [
    { path: '/associados', icon: 'people', label: 'Associados' },
    { path: '/financas', icon: 'account_balance', label: 'Finanças' },
    { path: '/relatorios', icon: 'summarize', label: 'Relatórios' },
    { path: '/listas', icon: 'list_alt', label: 'Listas e definições' },
  ];

  constructor() {
    this.data.getSettings().then((s) => this.associationName.set(s.association_name)).catch(() => {});
  }

  async exportAll() {
    this.exporting.set(true);
    try {
      await this.exportSvc.exportAll();
      this.ui.toast('Ficheiro Excel gerado.');
    } catch (e) {
      this.ui.error(e);
    } finally {
      this.exporting.set(false);
    }
  }

  changePassword() {
    this.dialog.open(ChangePasswordDialog, { width: '400px' });
  }

  async logout() {
    await this.auth.signOut();
    this.router.navigate(['/login']);
  }
}
