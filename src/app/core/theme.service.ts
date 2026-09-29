import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';

export interface ThemeOption { id: string; label: string; color: string; }

export const THEMES: ThemeOption[] = [
  { id: 'azul', label: 'Azul', color: '#005cbb' },
  { id: 'verde', label: 'Verde', color: '#1b6d2f' },
  { id: 'ciano', label: 'Ciano', color: '#006874' },
  { id: 'violeta', label: 'Violeta', color: '#6750a4' },
  { id: 'rosa', label: 'Rosa', color: '#a3245e' },
  { id: 'laranja', label: 'Laranja', color: '#9a4400' },
  { id: 'amarelo', label: 'Amarelo', color: '#6a5f00' },
];

const KEY = 'app-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);
  readonly theme = signal<string>('azul');
  readonly dark = signal<boolean>(false);

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (saved?.theme && THEMES.some((t) => t.id === saved.theme)) this.theme.set(saved.theme);
      if (typeof saved?.dark === 'boolean') this.dark.set(saved.dark);
      else this.dark.set(window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
    } catch { /* ignore */ }

    effect(() => {
      const html = this.doc.documentElement;
      for (const c of [...html.classList]) if (c.startsWith('theme-')) html.classList.remove(c);
      if (this.theme() !== 'azul') html.classList.add(`theme-${this.theme()}`);
      html.classList.toggle('dark', this.dark());
      try { localStorage.setItem(KEY, JSON.stringify({ theme: this.theme(), dark: this.dark() })); } catch { /* ignore */ }
    });
  }
}
