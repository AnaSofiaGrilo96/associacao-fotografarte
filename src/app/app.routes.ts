import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'associados' },
      { path: 'associados', loadComponent: () => import('./features/members/members.page').then((m) => m.MembersPage) },
      { path: 'associados/:id', loadComponent: () => import('./features/members/member-detail.page').then((m) => m.MemberDetailPage) },
      { path: 'financas', loadComponent: () => import('./features/finance/finance.page').then((m) => m.FinancePage) },
      { path: 'listas', loadComponent: () => import('./features/lists/lists.page').then((m) => m.ListsPage) },
      { path: 'relatorios', loadComponent: () => import('./features/reports/reports.page').then((m) => m.ReportsPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
