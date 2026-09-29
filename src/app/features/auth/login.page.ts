import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    <div class="wrap">
      <mat-card class="card">
        @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
        <mat-card-header>
          <mat-icon mat-card-avatar class="avatar">groups</mat-icon>
          <mat-card-title>Gestão da Associação</mat-card-title>
          <mat-card-subtitle>Inicie sessão para continuar</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="submit()">
            <mat-form-field class="full">
              <mat-label>Email</mat-label>
              <input matInput type="email" formControlName="email" autocomplete="username" />
            </mat-form-field>
            <mat-form-field class="full">
              <mat-label>Password</mat-label>
              <input matInput [type]="show() ? 'text' : 'password'" formControlName="password" autocomplete="current-password" />
              <button matIconButton matSuffix type="button" (click)="show.set(!show())" aria-label="Mostrar password">
                <mat-icon>{{ show() ? 'visibility_off' : 'visibility' }}</mat-icon>
              </button>
            </mat-form-field>
            @if (error()) { <p class="error">{{ error() }}</p> }
            <button matButton="filled" class="full" type="submit" [disabled]="form.invalid || loading()">Entrar</button>
          </form>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: 16px; }
    .card { width: 100%; max-width: 400px; padding: 8px; }
    .avatar { font-size: 40px; width: 40px; height: 40px; }
    form { display: flex; flex-direction: column; margin-top: 16px; }
    .full { width: 100%; }
    .error { color: #b3261e; margin: 0 0 12px; }
  `],
})
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(false);
  readonly show = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  async submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    const { email, password } = this.form.getRawValue();
    const err = await this.auth.signIn(email, password);
    this.loading.set(false);
    if (err) {
      this.error.set(/invalid/i.test(err) ? 'Email ou password incorretos.' : err);
      return;
    }
    const redirect = this.route.snapshot.queryParamMap.get('redirect') || '/associados';
    this.router.navigateByUrl(redirect);
  }
}
