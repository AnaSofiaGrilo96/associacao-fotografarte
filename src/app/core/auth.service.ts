import { Injectable, inject, signal } from '@angular/core';
import { Session, User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly sb = inject(SupabaseService).client;

  readonly session = signal<Session | null>(null);
  readonly user = signal<User | null>(null);
  readonly ready = signal(false);

  private readyPromise: Promise<void>;

  constructor() {
    this.readyPromise = this.sb.auth.getSession().then(({ data }) => {
      this.setSession(data.session);
      this.ready.set(true);
    });
    this.sb.auth.onAuthStateChange((_event, session) => this.setSession(session));
  }

  private setSession(session: Session | null) {
    this.session.set(session);
    this.user.set(session?.user ?? null);
  }

  async waitUntilReady(): Promise<void> {
    await this.readyPromise;
  }

  async signIn(email: string, password: string): Promise<string | null> {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  }

  async signOut(): Promise<void> {
    await this.sb.auth.signOut();
  }

  async changePassword(newPassword: string): Promise<string | null> {
    const { error } = await this.sb.auth.updateUser({ password: newPassword });
    return error ? error.message : null;
  }
}
