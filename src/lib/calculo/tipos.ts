/**
 * Tipos do domínio de rateio de água.
 * Este módulo é puro: não conhece Firebase, React nem rede.
 */

/** Uma faixa da escada progressiva. `ate: null` é a última faixa, sem teto. */
export interface Faixa {
  ate: number | null;
  agua: number;
  esgoto: number;
}

/** Tabela tarifária da concessionária. As fixas são por economia (apartamento). */
export interface Tarifa {
  fixaAgua: number;
  fixaEsgoto: number;
  faixas: Faixa[];
}

/** O que fazer com a diferença entre a conta real e a soma das tarifas individuais. */
export type RegraDiferenca = 'igual' | 'proporcional' | 'condominio';

export interface Conta {
  valorTotal: number;
  consumoM3: number;
  regra: RegraDiferenca;
}

export interface LeituraMedidor {
  medidorId: string;
  rotulo: string;
  anterior: number;
  /** null = ainda não lançada */
  atual: number | null;
}

export interface UnidadeEntrada {
  id: string;
  medidores: LeituraMedidor[];
}

export interface LinhaFatura {
  faixa: string;
  volume: number | null;
  valor: number;
}

export interface Fatura {
  total: number;
  linhas: LinhaFatura[];
}

export interface ItemFechamento {
  unidadeId: string;
  /** consumo somado dos medidores da unidade */
  consumo: number;
  /** true quando houve medidor faltando e o consumo foi estimado */
  estimado: boolean;
  medidoresFaltando: number;
  /** valor pela escada progressiva aplicada ao consumo próprio */
  tarifado: number;
  /** parcela da área comum e perdas repassada a esta unidade */
  parcelaComum: number;
  /** tarifado + parcelaComum, já arredondado para fechar no total */
  valor: number;
  percentual: number;
  detalhe: LinhaFatura[];
  inconsistencias: string[];
}

export interface Fechamento {
  itens: ItemFechamento[];
  /** soma dos consumos das unidades */
  somaConsumo: number;
  /** soma das tarifas individuais, antes da diferença */
  somaTarifada: number;
  consumoFaturado: number;
  valorConta: number;
  /** consumoFaturado - somaConsumo: área comum e perdas, em m³ */
  diferencaM3: number;
  /** valorConta - somaTarifada: área comum e perdas, em R$ */
  diferencaRS: number;
  /** soma efetivamente cobrada dos moradores */
  totalCobrado: number;
  /** o que sobra para o condomínio (positivo) ou falta (negativo) */
  aoCondominio: number;
  unidadesPendentes: number;
}

/** Um ponto da série histórica de um medidor. */
export interface PontoSerie {
  competencia: string;
  leitura: number;
  consumo: number;
}

export type TipoAlerta =
  | 'leitura_regressiva'
  | 'consumo_zerado'
  | 'consumo_alto'
  | 'vazamento_progressivo';

export interface Alerta {
  tipo: TipoAlerta;
  /** 'bloqueante' impede o fechamento sem justificativa */
  severidade: 'bloqueante' | 'aviso';
  mensagem: string;
}
