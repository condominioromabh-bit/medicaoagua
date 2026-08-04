import type { Alerta, PontoSerie } from './tipos';

export interface LimiaresAlerta {
  /** múltiplo da média própria que dispara "consumo alto" */
  fatorAlto: number;
  /** diferença mínima em m³ para não alarmar em medidor de baixo consumo */
  deltaMinimo: number;
  /** múltiplo da média anterior no teste de vazamento progressivo */
  fatorProgressivo: number;
}

export const LIMIARES_PADRAO: LimiaresAlerta = {
  fatorAlto: 2,
  deltaMinimo: 1,
  fatorProgressivo: 1.5,
};

/**
 * Analisa a série de um medidor e devolve os alertas do mês corrente.
 *
 * A comparação é sempre contra o histórico do PRÓPRIO medidor, nunca contra a
 * média do prédio. É isso que permite achar um vaso sanitário vazando num
 * apartamento cujo consumo total parece normal: o medidor daquele banheiro
 * destoa sozinho, mesmo diluído na soma da unidade.
 */
export function alertasDoMedidor(
  serie: PontoSerie[],
  limiares: LimiaresAlerta = LIMIARES_PADRAO,
): Alerta[] {
  const alertas: Alerta[] = [];
  if (serie.length === 0) return alertas;

  const atual = serie[serie.length - 1];
  const anteriores = serie.slice(0, -1);

  if (atual.consumo < 0) {
    alertas.push({
      tipo: 'leitura_regressiva',
      severidade: 'bloqueante',
      mensagem: 'Leitura menor que a do mês anterior — verificar troca de hidrômetro',
    });
  }

  if (anteriores.length === 0) return alertas;

  const media =
    anteriores.reduce((a, b) => a + b.consumo, 0) / anteriores.length;

  if (media > 0.5 && atual.consumo === 0) {
    alertas.push({
      tipo: 'consumo_zerado',
      severidade: 'bloqueante',
      mensagem: `Consumo zerado, mas a média deste medidor é ${media.toFixed(3)} m³`,
    });
  }

  if (
    media > 0 &&
    atual.consumo > media * limiares.fatorAlto &&
    atual.consumo - media >= limiares.deltaMinimo
  ) {
    alertas.push({
      tipo: 'consumo_alto',
      severidade: 'aviso',
      mensagem: `Consumo ${(atual.consumo / media).toFixed(1)}× a média deste medidor (${media.toFixed(3)} m³) — possível vazamento`,
    });
  }

  // três meses seguidos de alta terminando acima da média anterior:
  // assinatura de vazamento lento, que cresce sem salto visível
  if (serie.length >= 4) {
    const [a, b, c] = serie.slice(-3);
    const anteriorAoTrecho = serie.slice(0, -3);
    const mediaBase =
      anteriorAoTrecho.reduce((x, y) => x + y.consumo, 0) / anteriorAoTrecho.length;
    if (
      a.consumo < b.consumo &&
      b.consumo < c.consumo &&
      mediaBase > 0 &&
      c.consumo >= mediaBase * limiares.fatorProgressivo
    ) {
      alertas.push({
        tipo: 'vazamento_progressivo',
        severidade: 'aviso',
        mensagem: 'Três meses seguidos de alta — padrão típico de vazamento lento',
      });
    }
  }

  return alertas;
}

/**
 * Monta a série de um medidor a partir das leituras por competência.
 * Meses sem leitura são pulados, e o consumo é sempre contra a última
 * leitura disponível — não contra o mês calendário anterior.
 */
export function montarSerie(
  leiturasPorCompetencia: Record<string, number | undefined>,
  leituraInicial: number,
): PontoSerie[] {
  const comps = Object.keys(leiturasPorCompetencia).sort();
  const out: PontoSerie[] = [];
  let anterior = leituraInicial;
  for (const c of comps) {
    const v = leiturasPorCompetencia[c];
    if (v === undefined || v === null) continue;
    out.push({
      competencia: c,
      leitura: v,
      consumo: Math.round((v - anterior) * 1000) / 1000,
    });
    anterior = v;
  }
  return out;
}
