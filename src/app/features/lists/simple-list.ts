import { Component, input, output } from '@angular/core';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface ListItem { id: string; name: string; active: boolean; is_system?: boolean; }

@Component({
  selector: 'app-simple-list',
  imports: [MatListModule, MatIconModule, MatButtonModule, MatTooltipModule],
  template: `
    <div class="card">
      <div class="page-header">
        <h2>{{ title() }}</h2>
        <button matButton (click)="add.emit()"><mat-icon>add</mat-icon> Adicionar</button>
      </div>
      <mat-list>
        @for (it of items(); track it.id) {
          <mat-list-item>
            <span matListItemTitle [class.muted]="!it.active">{{ it.name }} @if (!it.active) { <em>(inativa)</em> } @if (it.is_system) { <mat-icon class="lock" matTooltip="Usada automaticamente pela aplicação">lock</mat-icon> }</span>
            <span matListItemMeta class="meta">
              <button matIconButton (click)="rename.emit(it)" matTooltip="Renomear"><mat-icon>edit</mat-icon></button>
              <button matIconButton (click)="toggle.emit(it)" [matTooltip]="it.active ? 'Desativar (deixa de aparecer nas escolhas)' : 'Reativar'"><mat-icon>{{ it.active ? 'visibility_off' : 'visibility' }}</mat-icon></button>
              <button matIconButton (click)="remove.emit(it)" [disabled]="it.is_system" matTooltip="Eliminar"><mat-icon>delete</mat-icon></button>
            </span>
          </mat-list-item>
        } @empty {
          <div class="empty">Lista vazia.</div>
        }
      </mat-list>
    </div>
  `,
  styles: [`
    h2 { font-size: 17px; font-weight: 500; margin: 0; flex: 1; }
    .meta { display: flex; }
    .lock { font-size: 14px; width: 14px; height: 14px; vertical-align: middle; margin-left: 4px; }
  `],
})
export class SimpleList {
  readonly title = input.required<string>();
  readonly items = input.required<ListItem[]>();
  readonly add = output<void>();
  readonly rename = output<ListItem>();
  readonly toggle = output<ListItem>();
  readonly remove = output<ListItem>();
}
