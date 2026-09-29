const fmt = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });

export function formatMoney(value: number | null | undefined): string {
  return fmt.format(value ?? 0);
}

export function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}
