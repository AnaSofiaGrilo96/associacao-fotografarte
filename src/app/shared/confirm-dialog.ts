import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

export interface ConfirmData { title: string; message: string; confirmLabel?: string; danger?: boolean; }

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>{{ data.message }}</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton (click)="ref.close(false)">Cancelar</button>
      <button matButton="filled" [class.danger]="data.danger" (click)="ref.close(true)">{{ data.confirmLabel || 'Confirmar' }}</button>
    </mat-dialog-actions>
  `,
  styles: [`.danger { --mat-button-filled-container-color: #b3261e; }`],
})
export class ConfirmDialog {
  readonly data = inject<ConfirmData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<ConfirmDialog>);
}
