/** Formats a Date as yyyy-mm-dd in local time (what Postgres `date` columns expect). */
export function toIsoDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parses yyyy-mm-dd into a local Date (avoids the UTC shift of `new Date('yyyy-mm-dd')`). */
export function fromIsoDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function today(): string {
  return toIsoDate(new Date())!;
}

export const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function monthLabel(isoDate: string): string {
  const [y, m] = isoDate.split('-').map(Number);
  return `${MONTHS_PT[m - 1]} ${y}`;
}

export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7); // yyyy-mm
}
