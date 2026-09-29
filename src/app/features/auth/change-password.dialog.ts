import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../core/auth.service';
import { UiService } from '../../shared/ui.service';

@Component({
  selector: 'app-change-password',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Alterar password</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="pwForm" (ngSubmit)="save()">
        <mat-form-field class="full">
          <mat-label>Nova password</mat-label>
          <input matInput type="password" formControlName="password" autocomplete="new-password" />
          <mat-hint>Mínimo 8 caracteres</mat-hint>
        </mat-form-field>
        <mat-form-field class="full">
          <mat-label>Confirmar password</mat-label>
          <input matInput type="password" formControlName="confirm" autocomplete="new-password" />
          @if (form.hasError('mismatch') && form.controls.confirm.touched) { <mat-error>As passwords não coincidem</mat-error> }
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Cancelar</button>
      <button matButton="filled" form="pwForm" type="submit" [disabled]="form.invalid || saving()">Guardar</button>
    </mat-dialog-actions>
  `,
  styles: [`.full { width: 100%; display: block; margin-top: 8px; }`],
})
export class ChangePasswordDialog {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly ui = inject(UiService);
  private readonly ref = inject(MatDialogRef<ChangePasswordDialog>);
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group(
    { password: ['', [Validators.required, Validators.minLength(8)]], confirm: ['', Validators.required] },
    { validators: (g) => (g.get('password')?.value === g.get('confirm')?.value ? null : { mismatch: true }) },
  );

  async save() {
    if (this.form.invalid) return;
    this.saving.set(true);
    const err = await this.auth.changePassword(this.form.getRawValue().password);
    this.saving.set(false);
    if (err) return this.ui.error(err);
    this.ui.toast('Password alterada.');
    this.ref.close();
  }
}
