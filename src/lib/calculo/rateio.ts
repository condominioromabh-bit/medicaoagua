import { faturar, r3, rc, ratearCentavos } from './tarifa';
import type {
  Conta,
  Fechamento,
  ItemFechamento,
  Tarifa,
  UnidadeEntrada,
} from './tipos';

/**
 * Fecha uma competência.
 *
 * O método é o que o Condomínio ROMA já usava em planilha: cada apartamento é
 * tarifado como se fosse um cliente independente da concessionária, com a
 * escada progressiva aplicada ao consumo próprio. A soma dessas tarifas quase
 * nunca é igual à conta real do prédio — a diferença é o consumo da área comum
 * mais as perdas, e o síndico escolhe como distribuí-la.
 */
export function fecharCompetencia(
  unidades: UnidadeEntrada[],
  conta: Conta,
  tarifa: Tarifa,
): Fechamento {
  const n = unidades.length;
  if (n === 0) throw new Error('Nenhuma unidade cadastrada');

  // 1. consumo bruto por unidade
  const base = unidades.map((u) => {
    const inconsistencias: string[] = [];
    let soma = 0;
    let faltando = 0;

    for (const m of u.medidores) {
      if (m.atual === null) {
        faltando += 1;
        continue;
      }
      const c = r3(m.atual - m.anterior);
      if (c < 0) {
        inconsistencias.push(
          `Medidor ${m.rotulo}: leitura ${m.atual} menor que a anterior ${m.anterior}`,
        );
        continue; // não soma consumo negativo
      }
      soma += c;
    }

    return {
      unidadeId: u.id,
      consumoMedido: faltando === u.medidores.length ? null : r3(soma),
      completo: faltando === 0,
      medidoresFaltando: faltando,
      inconsistencias,
    };
  });

  // 2. estimativa para quem ficou incompleto — média dos que entregaram tudo
  const completos = base.filter((b) => b.completo);
  const media = completos.length
    ? completos.reduce((a, b) => a + (b.consumoMedido ?? 0), 0) / completos.length
    : 0;

  const comConsumo = base.map((b) => {
    if (b.completo) return { ...b, consumo: b.consumoMedido as number, estimado: false };
    const inconsistencias = [
      ...b.inconsistencias,
      `${b.medidoresFaltando} medidor(es) sem leitura — consumo estimado pela média das unidades completas`,
    ];
    return { ...b, consumo: r3(media), estimado: true, inconsistencias };
  });

  const somaConsumo = r3(comConsumo.reduce((a, b) => a + b.consumo, 0));

  // 3. tarifa individual pela escada progressiva
  const tarifados = comConsumo.map((b) => {
    const f = faturar(b.consumo, tarifa);
    return { ...b, tarifado: f.total, detalhe: f.linhas };
  });
  const somaTarifada = rc(tarifados.reduce((a, b) => a + b.tarifado, 0));

  // 4. reconciliação com a conta real
  const consumoFaturado = conta.consumoM3 || 0;
  const valorConta = conta.valorTotal || 0;
  const diferencaM3 = consumoFaturado > 0 ? r3(consumoFaturado - somaConsumo) : 0;
  const diferencaRS = valorConta > 0 ? rc(valorConta - somaTarifada) : 0;

  let exatos: number[];
  if (valorConta <= 0 || conta.regra === 'condominio') {
    exatos = tarifados.map((b) => b.tarifado);
  } else if (conta.regra === 'igual') {
    exatos = tarifados.map((b) => b.tarifado + diferencaRS / n);
  } else {
    exatos = tarifados.map((b) =>
      somaTarifada > 0
        ? b.tarifado + diferencaRS * (b.tarifado / somaTarifada)
        : b.tarifado + diferencaRS / n,
    );
  }

  const alvo = rc(exatos.reduce((a, b) => a + b, 0));
  const valores = ratearCentavos(exatos, alvo);

  const itens: ItemFechamento[] = tarifados.map((b, i) => ({
    unidadeId: b.unidadeId,
    consumo: b.consumo,
    estimado: b.estimado,
    medidoresFaltando: b.medidoresFaltando,
    tarifado: b.tarifado,
    parcelaComum: rc(valores[i] - b.tarifado),
    valor: valores[i],
    percentual: somaConsumo > 0 ? (b.consumo / somaConsumo) * 100 : 0,
    detalhe: b.detalhe,
    inconsistencias: b.inconsistencias,
  }));

  const totalCobrado = rc(valores.reduce((a, b) => a + b, 0));

  return {
    itens,
    somaConsumo,
    somaTarifada,
    consumoFaturado,
    valorConta,
    diferencaM3,
    diferencaRS,
    totalCobrado,
    aoCondominio: rc(valorConta - totalCobrado),
    unidadesPendentes: base.filter((b) => !b.completo).length,
  };
}
