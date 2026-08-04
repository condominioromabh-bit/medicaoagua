'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/contexto';
import Topo from '@/components/Topo';
import Aviso from '@/components/Aviso';
import Carregando from '@/components/Carregando';
import { alertasDoMedidor, montarSerie } from '@/lib/calculo';
import { carregarItensFechados, type ItemFechado } from '@/lib/dados';
import { brl, compRotulo, m3 } from '@/lib/formato';

export default function Historico() {
  const { carregando, sessao, base, historico } = useApp();
  const router = useRouter();
  const [fechados, setFechados] = useState<Array<{ comp: string; item: ItemFechado }>>([]);

  useEffect(() => {
    if (!carregando && !sessao) router.replace('/entrar');
  }, [carregando, sessao, router]);

  const unidadeId = sessao?.unidadeId;

  const meusMedidores = useMemo(
    () => (base && unidadeId ? base.medidores.filter((m) => m.unidadeId === unidadeId) : []),
    [base, unidadeId],
  );

  // valores já cobrados nos meses fechados
  useEffect(() => {
    if (!base || !unidadeId) return;
    const comps = base.competencias.filter((c) => c.status === 'fechada').map((c) => c.id).sort();
    Promise.all(
      comps.map(async (c) => {
        const itens = await carregarItensFechados(c);
        const item = itens.find((i) => i.unidadeId === unidadeId);
        return item ? { comp: c, item } : null;
      }),
    ).then((r) => setFechados(r.filter(Boolean) as Array<{ comp: string; item: ItemFechado }>));
  }, [base, unidadeId]);

  const series = useMemo(() => {
    return meusMedidores.map((med) => {
      const porComp: Record<string, number | undefined> = {};
      for (const [c, leituras] of Object.entries(historico)) porComp[c] = leituras[med.id];
      const serie = montarSerie(porComp, med.leituraInicial ?? 0);
      return { med, serie, alertas: alertasDoMedidor(serie) };
    });
  }, [meusMedidores, historico]);

  if (carregando) return <Carregando />;
  if (!base || !unidadeId) return <Carregando />;

  const colunas = Object.keys(historico)
    .filter((c) => meusMedidores.some((m) => historico[c]?.[m.id] !== undefined))
    .sort()
    .slice(-8);

  const todosAlertas = series.flatMap(({ med, alertas }) =>
    alertas.map((a) => ({ rotulo: med.rotulo, ...a })),
  );

  const ano = String(new Date().getFullYear());
  const acumulado = fechados
    .filter((f) => f.comp.startsWith(ano))
    .reduce((a, b) => a + b.item.valor, 0);

  if (!colunas.length) {
    return (
      <>
        <Topo subtitulo={`Histórico · Apto ${unidadeId}`} />
        <div className="wrap">
          <div className="card">
            <span className="eyebrow">Histórico</span>
            <h2 className="disp">Ainda não há meses lançados</h2>
            <p className="sub">
              Assim que você enviar a primeira leitura, o histórico começa a montar a comparação mês
              a mês de cada medidor.
            </p>
          </div>
          <Link className="btn sec" href="/leitura">Voltar ao lançamento</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <Topo subtitulo={`Histórico · Apto ${unidadeId}`} />
      <div className="wrap">
        <div className="kpis">
          <div className="kpi">
            <span className="eyebrow">Medidores</span>
            <strong>{meusMedidores.length}</strong>
            <small>apto {unidadeId}</small>
          </div>
          <div className="kpi">
            <span className="eyebrow">Meses registrados</span>
            <strong>{colunas.length}</strong>
          </div>
          <div className="kpi">
            <span className="eyebrow">Pago em {ano}</span>
            <strong>{brl(acumulado)}</strong>
            <small>{fechados.filter((f) => f.comp.startsWith(ano)).length} fechamento(s)</small>
          </div>
        </div>

        {todosAlertas.length > 0 ? (
          <div className="card" style={{ borderColor: 'var(--rubro)' }}>
            <span className="eyebrow">Atenção</span>
            <h3 className="disp">{todosAlertas.length} ponto(s) para conferir</h3>
            {todosAlertas.map((a, i) => (
              <Aviso key={i} tipo="erro">
                <strong>Medidor {a.rotulo}:</strong> {a.mensagem}
              </Aviso>
            ))}
            <p className="sub">
              Um único medidor destoando do próprio histórico costuma indicar vazamento no ponto que
              ele mede — vaso sanitário, torneira ou tubulação daquele cômodo. Feche todos os pontos
              daquele registro por algumas horas e veja se o hidrômetro continua girando.
            </p>
          </div>
        ) : (
          <Aviso tipo="ok">
            Nenhum medidor deste apartamento está fora do próprio padrão histórico.
          </Aviso>
        )}

        <div className="card">
          <span className="eyebrow">Consumo por medidor, mês a mês (m³)</span>
          <h2 className="disp">Onde a água está indo</h2>
          <p className="sub">
            Cada linha é um hidrômetro. Um número em vermelho está muito acima da média daquele
            medidor específico.
          </p>
          <div style={{ height: 12 }} />
          <div className="rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Medidor</th>
                  {colunas.map((c) => <th key={c}>{compRotulo(c)}</th>)}
                </tr>
              </thead>
              <tbody>
                {series.map(({ med, serie, alertas }) => (
                  <tr key={med.id} className={alertas.length ? 'alerta' : undefined}>
                    <td>{med.rotulo}{alertas.length ? ' ⚠' : ''}</td>
                    {colunas.map((c) => {
                      const p = serie.find((x) => x.competencia === c);
                      if (!p) return <td key={c}>—</td>;
                      const antes = serie.filter((x) => x.competencia < c);
                      const media = antes.length
                        ? antes.reduce((a, b) => a + b.consumo, 0) / antes.length
                        : 0;
                      const alto = media > 0 && p.consumo > media * 2 && p.consumo - media >= 1;
                      return (
                        <td key={c} style={alto ? { color: 'var(--rubro)', fontWeight: 700 } : undefined}>
                          {m3(p.consumo)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total do apto</td>
                  {colunas.map((c) => {
                    let soma = 0;
                    let completo = true;
                    for (const { serie } of series) {
                      const p = serie.find((x) => x.competencia === c);
                      if (p) soma += p.consumo; else completo = false;
                    }
                    return <td key={c}>{completo ? m3(Math.round(soma * 1000) / 1000) : '—'}</td>;
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {fechados.length > 0 && (
          <div className="card">
            <span className="eyebrow">Fechamentos</span>
            <h3 className="disp">O que você já pagou</h3>
            <div className="rolagem">
              <table className="tabela">
                <thead>
                  <tr><th>Mês</th><th>Consumo</th><th>Tarifa</th><th>Área comum</th><th>Total</th></tr>
                </thead>
                <tbody>
                  {fechados.map(({ comp, item }) => (
                    <tr key={comp}>
                      <td>{compRotulo(comp)}</td>
                      <td>{m3(item.consumo)} m³</td>
                      <td>{brl(item.tarifado)}</td>
                      <td>{brl(item.parcelaComum)}</td>
                      <td>{brl(item.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <Link className="btn sec" href="/leitura">Voltar ao lançamento</Link>
      </div>
    </>
  );
}
