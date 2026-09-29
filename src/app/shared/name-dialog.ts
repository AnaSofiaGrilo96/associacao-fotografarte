import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

export interface NameDialogData { title: string; label?: string; value?: string; }

@Component({
  selector: 'app-name-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <mat-form-field class="full">
        <mat-label>{{ data.label || 'Nome' }}</mat-label>
        <input matInput [(ngModel)]="value" cdkFocusInitial (keyup.enter)="ok()" />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Cancelar</button>
      <button matButton="filled" [disabled]="!value.trim()" (click)="ok()">Guardar</button>
    </mat-dialog-actions>
  `,
  styles: [`.full { width: 100%; margin-top: 8px; }`],
})
export class NameDialog {
  readonly data = inject<NameDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<NameDialog>);
  value = this.data.value ?? '';
  ok() { if (this.value.trim()) this.ref.close(this.value.trim()); }
}
