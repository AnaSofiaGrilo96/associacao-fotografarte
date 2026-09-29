import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatRadioModule } from '@angular/material/radio';
import { DataService } from '../../core/data.service';
import { InactiveReason, Member } from '../../core/models';
import { UiService } from '../../shared/ui.service';
import { fromIsoDate, toIsoDate } from '../../shared/dates';

@Component({
  selector: 'app-member-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatDatepickerModule, MatRadioModule],
  template: `
    <h2 mat-dialog-title>{{ isNew ? 'Novo associado' : 'Editar associado' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="memberForm" (ngSubmit)="save()" class="form-grid">
        <mat-form-field>
          <mat-label>Nº de associado</mat-label>
          <input matInput type="number" formControlName="member_number" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>Data de entrada</mat-label>
          <input matInput [matDatepicker]="dp" formControlName="joined_at" />
          <mat-datepicker-toggle matSuffix [for]="dp" />
          <mat-datepicker #dp />
        </mat-form-field>
        <mat-form-field class="full">
          <mat-label>Nome</mat-label>
          <input matInput formControlName="name" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>Email</mat-label>
          <input matInput type="email" formControlName="email" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>Telefone</mat-label>
          <input matInput formControlName="phone" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>NIF</mat-label>
          <input matInput formControlName="nif" maxlength="9" />
          @if (form.controls.nif.hasError('pattern')) { <mat-error>O NIF tem 9 dígitos</mat-error> }
        </mat-form-field>
        <mat-form-field>
          <mat-label>Morada</mat-label>
          <input matInput formControlName="address" />
        </mat-form-field>

        <div class="full status-row">
          <span class="label">Estado da ficha</span>
          <mat-radio-group formControlName="status">
            <mat-radio-button value="active">Ativo</mat-radio-button>
            <mat-radio-button value="inactive">Inativo</mat-radio-button>
          </mat-radio-group>
        </div>
        @if (form.controls.status.value === 'inactive') {
          <mat-form-field>
            <mat-label>Motivo</mat-label>
            <mat-select formControlName="inactive_reason_id">
              @for (r of reasons(); track r.id) { <mat-option [value]="r.id">{{ r.name }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Data de saída</mat-label>
            <input matInput [matDatepicker]="dp2" formControlName="inactive_at" />
            <mat-datepicker-toggle matSuffix [for]="dp2" />
            <mat-datepicker #dp2 />
          </mat-form-field>
        }
        <mat-form-field class="full">
          <mat-label>Notas</mat-label>
          <textarea matInput formControlName="notes" rows="2"></textarea>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Cancelar</button>
      <button matButton="filled" form="memberForm" type="submit" [disabled]="form.invalid || saving()">Guardar</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .status-row { display: flex; align-items: center; gap: 16px; margin: 0 0 16px; }
    .label { color: var(--mat-sys-on-surface-variant); }
  `],
})
export class MemberDialog {
  private readonly fb = inject(FormBuilder);
  private readonly data = inject(DataService);
  private readonly ui = inject(UiService);
  private readonly ref = inject(MatDialogRef<MemberDialog>);
  readonly member = inject<Member | null>(MAT_DIALOG_DATA);
  readonly isNew = !this.member;
  readonly saving = signal(false);
  readonly reasons = signal<InactiveReason[]>([]);

  readonly form = this.fb.group({
    member_number: [this.member?.member_number ?? null as number | null],
    name: [this.member?.name ?? '', Validators.required],
    email: [this.member?.email ?? '', Validators.email],
    phone: [this.member?.phone ?? ''],
    nif: [this.member?.nif ?? '', Validators.pattern(/^\d{9}$/)],
    address: [this.member?.address ?? ''],
    joined_at: [fromIsoDate(this.member?.joined_at) ?? new Date(), Validators.required],
    status: [this.member?.status ?? 'active', Validators.required],
    inactive_reason_id: [this.member?.inactive_reason_id ?? null as string | null],
    inactive_at: [fromIsoDate(this.member?.inactive_at)],
    notes: [this.member?.notes ?? ''],
  });

  constructor() {
    this.data.listReasons().then((r) => this.reasons.set(r)).catch((e) => this.ui.error(e));
    if (this.isNew) {
      this.data.nextMemberNumber().then((n) => {
        if (this.form.controls.member_number.value == null) this.form.controls.member_number.setValue(n);
      }).catch(() => {});
    }
    this.form.controls.status.valueChanges.subscribe((s) => {
      if (s === 'inactive' && !this.form.controls.inactive_at.value) this.form.controls.inactive_at.setValue(new Date());
    });
  }

  async save() {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const inactive = v.status === 'inactive';
    const payload: Partial<Member> = {
      id: this.member?.id,
      member_number: v.member_number ?? null,
      name: v.name!.trim(),
      email: v.email?.trim() || null,
      phone: v.phone?.trim() || null,
      nif: v.nif?.trim() || null,
      address: v.address?.trim() || null,
      joined_at: toIsoDate(v.joined_at)!,
      status: v.status as Member['status'],
      inactive_reason_id: inactive ? v.inactive_reason_id : null,
      inactive_at: inactive ? toIsoDate(v.inactive_at) : null,
      notes: v.notes?.trim() || null,
    };
    this.saving.set(true);
    try {
      const saved = await this.data.saveMember(payload);
      this.ui.toast(this.isNew ? 'Associado criado.' : 'Associado atualizado.');
      this.ref.close(saved);
    } catch (e) {
      this.ui.error(e);
    } finally {
      this.saving.set(false);
    }
  }
}
