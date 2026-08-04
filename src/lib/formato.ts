const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function compAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function compAnterior(c: string): string {
  let [a, m] = c.split('-').map(Number);
  m -= 1;
  if (m === 0) { m = 12; a -= 1; }
  return `${a}-${String(m).padStart(2, '0')}`;
}
export function compSeguinte(c: string): string {
  let [a, m] = c.split('-').map(Number);
  m += 1;
  if (m === 13) { m = 1; a += 1; }
  return `${a}-${String(m).padStart(2, '0')}`;
}
export function compRotulo(c: string): string {
  const [a, m] = c.split('-').map(Number);
  return `${MESES[m - 1].toUpperCase()}/${a}`;
}
export function brl(v: number): string {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
export function num(v: number, casas = 0): string {
  return (v || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}
export function m3(v: number): string {
  return num(v ?? 0, 3);
}

/** Prazo de leitura de uma competência. */
export function prazoDe(comp: string, prazo: { dia: number; ref: string }): Date {
  let [a, m] = comp.split('-').map(Number);
  if (prazo.ref === 'seguinte') { m += 1; if (m === 13) { m = 1; a += 1; } }
  return new Date(a, m - 1, Math.min(28, Math.max(1, prazo.dia || 5)), 23, 59, 59);
}
export function diasAtePrazo(comp: string, prazo: { dia: number; ref: string }): number {
  const d = prazoDe(comp, prazo);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - hoje.getTime()) / 86400000,
  );
}
export function dataBR(d: Date): string {
  return d.toLocaleDateString('pt-BR');
}
