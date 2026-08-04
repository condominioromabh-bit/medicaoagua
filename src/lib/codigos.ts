import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Códigos de acesso são guardados como hash, nunca em texto puro.
 * Só roda no servidor — nunca importe isto num componente de cliente.
 */
export function hashCodigo(codigo: string): string {
  const sal = process.env.SAL_CODIGOS || 'roma';
  return createHash('sha256').update(`${sal}:${codigo.trim().toUpperCase()}`).digest('hex');
}

/** Comparação de tempo constante: não deixa vazar o código por latência. */
export function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
