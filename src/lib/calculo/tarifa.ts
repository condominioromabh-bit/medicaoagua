import type { Fatura, LinhaFatura, Tarifa } from './tipos';

/** Arredonda para 3 casas, evitando ruído de ponto flutuante nas leituras. */
export function r3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Arredonda para centavos. */
export function rc(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Aplica a escada progressiva a um consumo.
 *
 * A tarifa fixa é cobrada por economia — uma vez por apartamento — e as faixas
 * são cumulativas: um consumo de 12 m³ paga 5 m³ na primeira faixa, 5 m³ na
 * segunda e 2 m³ na terceira.
 */
export function faturar(consumo: number, tarifa: Tarifa): Fatura {
  const linhas: LinhaFatura[] = [];
  const fixa = rc(tarifa.fixaAgua + tarifa.fixaEsgoto);
  let total = fixa;
  linhas.push({ faixa: 'Tarifa fixa', volume: null, valor: fixa });

  const c = Math.max(0, consumo);
  let base = 0;

  for (const f of tarifa.faixas) {
    const teto = f.ate === null || f.ate === undefined ? Infinity : f.ate;
    const volume = Math.max(0, Math.min(c, teto) - base);
    if (volume > 0) {
      const valor = volume * (f.agua + f.esgoto);
      total += valor;
      linhas.push({
        faixa: `${base === 0 ? '0' : base} a ${teto === Infinity ? '+' : teto} m³`,
        volume: r3(volume),
        valor: rc(valor),
      });
    }
    base = teto;
    if (c <= teto) break;
  }

  return { total: rc(total), linhas };
}

/**
 * Distribui centavos pelo método do maior resto.
 *
 * Rateio proporcional quase nunca fecha exatamente no total: somar os valores
 * arredondados individualmente dá alguns centavos a mais ou a menos. Aqui todos
 * são truncados para baixo e os centavos restantes vão para quem tem o maior
 * resto decimal, garantindo que a soma bata no centavo com o alvo.
 */
export function ratearCentavos(exatos: number[], alvo: number): number[] {
  if (exatos.length === 0) return [];
  const centavos = exatos.map((v) => Math.floor(v * 100 + 1e-9));
  const soma = centavos.reduce((a, b) => a + b, 0);
  let sobra = Math.round(alvo * 100) - soma;

  const ordem = exatos
    .map((v, i) => ({ i, resto: v * 100 - Math.floor(v * 100 + 1e-9) }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);

  let k = 0;
  while (sobra > 0) {
    centavos[ordem[k % ordem.length].i] += 1;
    sobra -= 1;
    k += 1;
  }
  while (sobra < 0) {
    centavos[ordem[k % ordem.length].i] -= 1;
    sobra += 1;
    k += 1;
  }
  return centavos.map((c) => c / 100);
}
