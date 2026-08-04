import { describe, it, expect } from 'vitest';
import { faturar, ratearCentavos } from '../src/lib/calculo/tarifa';
import { fecharCompetencia } from '../src/lib/calculo/rateio';
import { alertasDoMedidor, montarSerie } from '../src/lib/calculo/alertas';
import type { Conta, Tarifa, UnidadeEntrada } from '../src/lib/calculo/tipos';

/** Tabela que o condomínio usou em 2025. Fixas por economia: 135,60/6 e 100,26/6. */
const TARIFA_2025: Tarifa = {
  fixaAgua: 22.6,
  fixaEsgoto: 16.71,
  faixas: [
    { ate: 5, agua: 2.34, esgoto: 1.73 },
    { ate: 10, agua: 4.987, esgoto: 3.69 },
    { ate: 15, agua: 7.727, esgoto: 5.718 },
    { ate: 20, agua: 10.549, esgoto: 7.806 },
    { ate: 40, agua: 13.418, esgoto: 9.929 },
    { ate: null, agua: 13.418, esgoto: 9.929 },
  ],
};

/** Cria uma unidade com um único medidor, para testar consumo agregado. */
function unidade(id: string, consumo: number): UnidadeEntrada {
  return {
    id,
    medidores: [
      { medidorId: `${id}-1`, rotulo: `${id}-1`, anterior: 0, atual: consumo },
    ],
  };
}

describe('escada tarifária', () => {
  // valores conferidos linha a linha contra a planilha 06_junho_2025.xlsx
  const casos: Array<[string, number, number]> = [
    ['101', 6.899, 76.14],
    ['102', 30.93, 517.23],
    ['201', 14.461, 163.02],
    ['202', 10.621, 111.39],
    ['301', 26.85, 421.97],
    ['302', 13.694, 152.71],
  ];

  it.each(casos)('apto %s: %f m³ custa R$ %f', (_apto, consumo, esperado) => {
    expect(faturar(consumo, TARIFA_2025).total).toBeCloseTo(esperado, 2);
  });

  it('consumo zero paga só a tarifa fixa', () => {
    expect(faturar(0, TARIFA_2025).total).toBeCloseTo(39.31, 2);
  });

  it('consumo negativo é tratado como zero', () => {
    expect(faturar(-5, TARIFA_2025).total).toBeCloseTo(39.31, 2);
  });

  it('a última faixa não tem teto', () => {
    const alto = faturar(500, TARIFA_2025);
    const pouco = faturar(499, TARIFA_2025);
    expect(alto.total - pouco.total).toBeCloseTo(13.418 + 9.929, 2);
  });

  it('as linhas somam o total', () => {
    const f = faturar(23.5, TARIFA_2025);
    const soma = f.linhas.reduce((a, l) => a + l.valor, 0);
    expect(soma).toBeCloseTo(f.total, 2);
  });
});

describe('arredondamento por maior resto', () => {
  it('a soma fecha exatamente no alvo', () => {
    const exatos = [33.333333, 33.333333, 33.333334];
    const r = ratearCentavos(exatos, 100);
    expect(r.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10);
  });

  it('funciona quando sobra centavo para baixo', () => {
    const r = ratearCentavos([10.006, 10.006, 10.006], 30.02);
    expect(r.reduce((a, b) => a + b, 0)).toBeCloseTo(30.02, 10);
  });

  it('funciona com valores negativos de ajuste', () => {
    const r = ratearCentavos([10.005, 10.005], 20.0);
    expect(r.reduce((a, b) => a + b, 0)).toBeCloseTo(20.0, 10);
  });

  it('lista vazia não quebra', () => {
    expect(ratearCentavos([], 0)).toEqual([]);
  });
});

describe('fechamento de junho/2025', () => {
  const unidades = [
    unidade('101', 6.899),
    unidade('102', 30.93),
    unidade('201', 14.461),
    unidade('202', 10.621),
    unidade('301', 26.85),
    unidade('302', 13.694),
  ];

  it('reproduz o consumo e a soma das tarifas da planilha', () => {
    const conta: Conta = { valorTotal: 0, consumoM3: 106, regra: 'igual' };
    const f = fecharCompetencia(unidades, conta, TARIFA_2025);
    expect(f.somaConsumo).toBeCloseTo(103.455, 3);
    expect(f.diferencaM3).toBeCloseTo(2.545, 3);

    // A planilha exibe 1442,47 porque soma os valores SEM arredondar
    // (1442,4656). Aqui cada apartamento é arredondado para centavos antes de
    // somar, porque é isso que se cobra de fato — e a soma do cobrável é
    // 1442,46. O centavo de diferença não existe no mundo real.
    expect(f.somaTarifada).toBeCloseTo(1442.46, 2);
    const somaItens = f.itens.reduce((a, i) => a + i.tarifado, 0);
    expect(somaItens).toBeCloseTo(f.somaTarifada, 2);
  });

  it('com a conta lançada, o cobrado fecha no centavo com o total', () => {
    const conta: Conta = { valorTotal: 1600, consumoM3: 106, regra: 'igual' };
    const f = fecharCompetencia(unidades, conta, TARIFA_2025);
    expect(f.totalCobrado).toBeCloseTo(1600, 2);
    expect(f.aoCondominio).toBeCloseTo(0, 2);
  });

  it('rateio proporcional também fecha no total', () => {
    const conta: Conta = { valorTotal: 1600, consumoM3: 106, regra: 'proporcional' };
    const f = fecharCompetencia(unidades, conta, TARIFA_2025);
    expect(f.totalCobrado).toBeCloseTo(1600, 2);
  });

  it('regra condomínio não repassa a diferença aos moradores', () => {
    const conta: Conta = { valorTotal: 1600, consumoM3: 106, regra: 'condominio' };
    const f = fecharCompetencia(unidades, conta, TARIFA_2025);
    expect(f.totalCobrado).toBeCloseTo(1442.46, 2);
    expect(f.aoCondominio).toBeCloseTo(157.54, 2);
    f.itens.forEach((i) => expect(i.parcelaComum).toBeCloseTo(0, 2));
  });

  it('diferença negativa vira crédito do condomínio', () => {
    const conta: Conta = { valorTotal: 1300, consumoM3: 106, regra: 'igual' };
    const f = fecharCompetencia(unidades, conta, TARIFA_2025);
    expect(f.diferencaRS).toBeLessThan(0);
    expect(f.totalCobrado).toBeCloseTo(1300, 2);
    f.itens.forEach((i) => expect(i.parcelaComum).toBeLessThan(0));
  });
});

describe('casos de borda do fechamento', () => {
  it('unidade incompleta é estimada pela média das completas', () => {
    const us: UnidadeEntrada[] = [
      unidade('101', 10),
      unidade('102', 20),
      {
        id: '201',
        medidores: [
          { medidorId: '201-1', rotulo: '201-1', anterior: 0, atual: null },
        ],
      },
    ];
    const f = fecharCompetencia(us, { valorTotal: 0, consumoM3: 0, regra: 'igual' }, TARIFA_2025);
    const est = f.itens.find((i) => i.unidadeId === '201')!;
    expect(est.estimado).toBe(true);
    expect(est.consumo).toBeCloseTo(15, 3);
    expect(f.unidadesPendentes).toBe(1);
  });

  it('leitura regressiva não gera consumo negativo e é registrada', () => {
    const us: UnidadeEntrada[] = [
      {
        id: '101',
        medidores: [
          { medidorId: '101-1', rotulo: '101-1', anterior: 100, atual: 90 },
          { medidorId: '101-2', rotulo: '101-2', anterior: 10, atual: 15 },
        ],
      },
    ];
    const f = fecharCompetencia(us, { valorTotal: 0, consumoM3: 0, regra: 'igual' }, TARIFA_2025);
    expect(f.itens[0].consumo).toBeCloseTo(5, 3);
    expect(f.itens[0].inconsistencias[0]).toContain('101-1');
  });

  it('consumo total zero não divide por zero', () => {
    const us = [unidade('101', 0), unidade('102', 0)];
    const f = fecharCompetencia(us, { valorTotal: 200, consumoM3: 0, regra: 'proporcional' }, TARIFA_2025);
    expect(Number.isFinite(f.totalCobrado)).toBe(true);
    expect(f.totalCobrado).toBeCloseTo(200, 2);
  });

  it('sem unidades, lança erro em vez de devolver lixo', () => {
    expect(() =>
      fecharCompetencia([], { valorTotal: 100, consumoM3: 10, regra: 'igual' }, TARIFA_2025),
    ).toThrow();
  });
});

describe('alertas por medidor', () => {
  it('não alarma sem histórico', () => {
    const s = montarSerie({ '2026-07': 10 }, 0);
    expect(alertasDoMedidor(s)).toHaveLength(0);
  });

  it('detecta salto de consumo num medidor', () => {
    const s = montarSerie(
      { '2026-04': 2, '2026-05': 4, '2026-06': 6, '2026-07': 20 },
      0,
    );
    const a = alertasDoMedidor(s);
    expect(a.some((x) => x.tipo === 'consumo_alto')).toBe(true);
  });

  it('ignora salto proporcional em medidor de baixíssimo consumo', () => {
    // 0,02 -> 0,08 m³ é 4x, mas são 60 litros: não é vazamento
    const s = montarSerie(
      { '2026-05': 0.02, '2026-06': 0.04, '2026-07': 0.12 },
      0,
    );
    expect(alertasDoMedidor(s).some((x) => x.tipo === 'consumo_alto')).toBe(false);
  });

  it('detecta vazamento progressivo', () => {
    const s = montarSerie(
      {
        '2026-01': 5,
        '2026-02': 10,
        '2026-03': 15,
        '2026-04': 21,
        '2026-05': 29,
        '2026-06': 40,
      },
      0,
    );
    expect(
      alertasDoMedidor(s).some((x) => x.tipo === 'vazamento_progressivo'),
    ).toBe(true);
  });

  it('detecta consumo zerado em medidor que sempre consumiu', () => {
    const s = montarSerie(
      { '2026-04': 5, '2026-05': 10, '2026-06': 15, '2026-07': 15 },
      0,
    );
    expect(alertasDoMedidor(s).some((x) => x.tipo === 'consumo_zerado')).toBe(true);
  });

  it('detecta leitura regressiva', () => {
    const s = montarSerie({ '2026-06': 100, '2026-07': 90 }, 0);
    expect(
      alertasDoMedidor(s).some((x) => x.tipo === 'leitura_regressiva'),
    ).toBe(true);
  });

  it('a série pula meses sem leitura em vez de zerar o consumo', () => {
    const s = montarSerie({ '2026-05': 10, '2026-06': undefined, '2026-07': 18 }, 0);
    expect(s).toHaveLength(2);
    expect(s[1].consumo).toBeCloseTo(8, 3);
  });
});

describe('primeiro fechamento com leituras iniciais', () => {
  it('o consumo é a diferença para a leitura inicial, não o valor do mostrador', () => {
    // apto que já tinha 118,450 m³ acumulados e agora marca 127,300
    const us: UnidadeEntrada[] = [
      {
        id: '101',
        medidores: [
          { medidorId: '101-1', rotulo: '101-1', anterior: 118.45, atual: 127.3 },
          { medidorId: '101-2', rotulo: '101-2', anterior: 204.0, atual: 206.5 },
        ],
      },
    ];
    const f = fecharCompetencia(us, { valorTotal: 0, consumoM3: 0, regra: 'igual' }, TARIFA_2025);
    expect(f.somaConsumo).toBeCloseTo(11.35, 3);
  });

  it('sem leitura inicial informada, o consumo vira o mostrador inteiro', () => {
    // este é o cenário que a aba de leituras iniciais existe para evitar
    const us: UnidadeEntrada[] = [
      {
        id: '101',
        medidores: [{ medidorId: '101-1', rotulo: '101-1', anterior: 0, atual: 127.3 }],
      },
    ];
    const f = fecharCompetencia(us, { valorTotal: 0, consumoM3: 0, regra: 'igual' }, TARIFA_2025);
    expect(f.somaConsumo).toBeCloseTo(127.3, 3);
    expect(f.itens[0].tarifado).toBeGreaterThan(2000);
  });
});
