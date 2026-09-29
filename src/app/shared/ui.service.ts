import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { ConfirmData, ConfirmDialog } from './confirm-dialog';

@Injectable({ providedIn: 'root' })
export class UiService {
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  toast(message: string) {
    this.snack.open(message, 'OK', { duration: 3000 });
  }

  error(err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(err);
    this.snack.open(`Erro: ${msg}`, 'Fechar', { duration: 6000 });
  }

  confirm(data: ConfirmData): Promise<boolean> {
    const ref = this.dialog.open(ConfirmDialog, { data, width: '420px' });
    return firstValueFrom(ref.afterClosed()).then((v) => !!v);
  }
}
