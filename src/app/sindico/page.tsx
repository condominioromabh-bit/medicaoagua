'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthClient } from '@/lib/firebase/client';
import { useApp } from '@/lib/contexto';
import Topo from '@/components/Topo';
import Aviso from '@/components/Aviso';
import Carregando from '@/components/Carregando';
import SeletorComp from '@/components/SeletorComp';
import ConferenciaApto from '@/components/ConferenciaApto';
import AbaTarifa from '@/components/AbaTarifa';
import {
  estaAberta, garantirCompetencia, listaCompetencias, salvarConta, salvarPrazo,
  type ContaDoc, type Prazo,
} from '@/lib/dados';
import { alertasDoMedidor, fecharCompetencia, montarSerie, type UnidadeEntrada } from '@/lib/calculo';
import { brl, compRotulo, dataBR, diasAtePrazo, m3, num, prazoDe } from '@/lib/formato';

type Aba = 'coleta' | 'alertas' | 'conta' | 'tarifa' | 'fechamento' | 'cadastro';

export default function Sindico() {
  const { carregando, erro, sessao, base, comp, leituras, historico, recarregar } = useApp();
  const router = useRouter();
  const [aba, setAba] = useState<Aba>('coleta');
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: 'ok' | 'erro'; texto: string } | null>(null);
  const [conta, setConta] = useState<ContaDoc | null>(null);
  const [prazo, setPrazo] = useState<Prazo | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!carregando && !sessao) router.replace('/entrar');
    if (!carregando && sessao?.papel === 'morador') router.replace('/leitura');
  }, [carregando, sessao, router]);

  useEffect(() => {
    const c = base?.competencias.find((x) => x.id === comp);
    setConta(c?.conta ?? { valorTotal: 0, consumoM3: 0, vencimento: '', dataLeitura: '', numero: '', regra: 'igual' });
  }, [base, comp]);

  useEffect(() => {
    if (base) setPrazo(base.cfg.prazo);
  }, [base]);

  /** Leitura anterior de um medidor: última competência anterior que tenha valor. */
  const anteriorDe = useCallback(
    (medId: string, inicial: number): number => {
      const comps = Object.keys(historico).filter((c) => c < comp).sort();
      for (let i = comps.length - 1; i >= 0; i--) {
        const v = historico[comps[i]]?.[medId];
        if (typeof v === 'number') return v;
      }
      return inicial;
    },
    [historico, comp],
  );

  const entradas = useMemo<UnidadeEntrada[]>(() => {
    if (!base) return [];
    return base.unidades.map((u) => ({
      id: u.id,
      medidores: base.medidores
        .filter((m) => m.unidadeId === u.id)
        .map((m) => ({
          medidorId: m.id,
          rotulo: m.rotulo,
          anterior: anteriorDe(m.id, m.leituraInicial ?? 0),
          atual: leituras[m.id]?.valor ?? null,
        })),
    }));
  }, [base, leituras, anteriorDe]);

  const resultado = useMemo(() => {
    if (!base || !conta || !entradas.length) return null;
    try {
      return fecharCompetencia(entradas, conta, base.cfg.tarifa);
    } catch {
      return null;
    }
  }, [base, conta, entradas]);

  const alertas = useMemo(() => {
    if (!base) return [];
    return base.medidores
      .map((med) => {
        const porComp: Record<string, number | undefined> = {};
        for (const [c, l] of Object.entries(historico)) porComp[c] = l[med.id];
        const serie = montarSerie(porComp, med.leituraInicial ?? 0);
        const as = alertasDoMedidor(serie);
        const passado = serie.slice(0, -1);
        return {
          med,
          alertas: as,
          atual: serie.length ? serie[serie.length - 1].consumo : null,
          media: passado.length ? passado.reduce((a, b) => a + b.consumo, 0) / passado.length : null,
          meses: serie.length,
        };
      })
      .filter((x) => x.alertas.length > 0);
  }, [base, historico]);

  if (carregando) return <Carregando />;
  if (erro) return (<><Topo /><div className="wrap"><Aviso tipo="erro">{erro}</Aviso></div></>);
  if (!base || !conta || !prazo) return <Carregando />;

  const aberta = estaAberta(base.competencias, comp);
  const comps = listaCompetencias(base.competencias);
  const dias = prazo.ativo ? diasAtePrazo(comp, prazo) : null;

  const semLancar = base.unidades.filter(
    (u) => !base.medidores.filter((m) => m.unidadeId === u.id).every((m) => leituras[m.id]),
  );

  async function guardarConta() {
    setOcupado(true);
    try {
      await garantirCompetencia(comp);
      await salvarConta(comp, conta!);
      await recarregar();
      setMsg({ t: 'ok', texto: 'Conta salva. A reconciliação está na aba Fechamento.' });
      setAba('fechamento');
    } catch {
      setMsg({ t: 'erro', texto: 'Não foi possível salvar a conta. Tente de novo.' });
    } finally {
      setOcupado(false);
    }
  }

  async function guardarPrazo() {
    setOcupado(true);
    try {
      await salvarPrazo(prazo!);
      await recarregar();
      setMsg({ t: 'ok', texto: 'Prazo salvo.' });
    } catch {
      setMsg({ t: 'erro', texto: 'Não foi possível salvar o prazo.' });
    } finally {
      setOcupado(false);
    }
  }

  async function fechar() {
    if (!resultado) return;
    if (resultado.unidadesPendentes > 0) {
      const ok = window.confirm(
        `Há ${resultado.unidadesPendentes} apartamento(s) com leitura incompleta, com consumo estimado pela média. Fechar mesmo assim?`,
      );
      if (!ok) return;
    }
    setOcupado(true);
    try {
      const token = await getAuthClient().currentUser?.getIdToken();
      const r = await fetch('/api/fechar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ competencia: comp }),
      });
      const dados = await r.json();
      if (!r.ok) {
        setMsg({ t: 'erro', texto: dados.erro ?? 'Não foi possível fechar o mês.' });
        return;
      }
      await recarregar();
      setMsg({
        t: 'ok',
        texto: `Fechamento confirmado. Os valores estão congelados e ${compRotulo(comp)} sai da lista de meses abertos.`,
      });
    } catch {
      setMsg({ t: 'erro', texto: 'Falha de conexão ao fechar o mês.' });
    } finally {
      setOcupado(false);
    }
  }

  function cobrarNoWhatsApp() {
    const lista = semLancar.map((u) => `apto ${u.id}`).join(', ');
    const venc = prazo!.ativo ? ` Prazo: ${dataBR(prazoDe(comp, prazo!))}.` : '';
    const texto =
      `Leitura da água de ${compRotulo(comp)}.${venc} ` +
      `Ainda faltam lançar: ${lista}. Link: ${window.location.origin}/leitura`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
  }

  function baixarCSV() {
    if (!resultado) return;
    const L: Array<Array<string | number>> = [];
    L.push(['CONDOMINIO', base!.cfg.nome]);
    L.push(['COMPETENCIA', compRotulo(comp)]);
    L.push([]);
    L.push(['Apto', 'Medidores', 'Consumo (m3)', '% do total', 'Tarifa (R$)', 'Area comum (R$)', 'Total (R$)', 'Observacao']);
    for (const i of resultado.itens) {
      const qtd = base!.medidores.filter((m) => m.unidadeId === i.unidadeId).length;
      L.push([i.unidadeId, qtd, i.consumo.toFixed(3), i.percentual.toFixed(2),
        i.tarifado.toFixed(2), i.parcelaComum.toFixed(2), i.valor.toFixed(2), i.inconsistencias.join(' | ')]);
    }
    L.push([]);
    L.push(['LEITURAS POR MEDIDOR']);
    L.push(['Medidor', 'Mes anterior', 'Mes corrente', 'Consumo (m3)']);
    for (const e of entradas) {
      for (const m of e.medidores) {
        L.push([m.rotulo, m.anterior.toFixed(3), m.atual === null ? '' : m.atual.toFixed(3),
          m.atual === null ? '' : (m.atual - m.anterior).toFixed(3)]);
      }
    }
    L.push([]);
    L.push(['RECONCILIACAO']);
    L.push(['Consumo somado dos aptos (m3)', resultado.somaConsumo.toFixed(3)]);
    L.push(['Consumo faturado pela Copasa (m3)', resultado.consumoFaturado]);
    L.push(['Divergencia (m3)', resultado.diferencaM3.toFixed(3)]);
    L.push(['Soma das tarifas individuais (R$)', resultado.somaTarifada.toFixed(2)]);
    L.push(['Conta da Copasa (R$)', resultado.valorConta.toFixed(2)]);
    L.push(['Area comum + perdas (R$)', resultado.diferencaRS.toFixed(2)]);
    L.push(['Regra da diferenca', conta!.regra]);
    L.push(['Total cobrado dos moradores (R$)', resultado.totalCobrado.toFixed(2)]);
    L.push(['Fica com o condominio (R$)', resultado.aoCondominio.toFixed(2)]);

    const csv = '\ufeff' + L.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `rateio-agua-roma-${comp}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  const abas: Array<[Aba, string]> = [
    ['coleta', 'Coleta'],
    ['alertas', `Alertas${alertas.length ? ` (${alertas.length})` : ''}`],
    ['conta', 'Conta'],
    ['tarifa', 'Tarifa'],
    ['fechamento', 'Fechamento'],
    ['cadastro', 'Cadastro'],
  ];

  return (
    <>
      <Topo />
      <div className="wrap">
        <div className="abas">
          {abas.map(([k, r]) => (
            <button
              key={k}
              className={`aba${aba === k ? ' on' : ''}`}
              onClick={() => { setAba(k); setDetalhe(null); setMsg(null); }}
            >
              {r}
            </button>
          ))}
        </div>

        {msg && <Aviso tipo={msg.t}>{msg.texto}</Aviso>}

        {(aba === 'coleta' || aba === 'conta' || aba === 'fechamento') && comps.length > 1 && <SeletorComp />}

        {/* ---------- COLETA ---------- */}
        {aba === 'coleta' && !detalhe && resultado && (
          <>
            <div className="card">
              <span className="eyebrow">Andamento da coleta</span>
              <h2 className="disp">
                {base.unidades.length - resultado.unidadesPendentes} de {base.unidades.length} apartamentos
              </h2>
              <div className="barra">
                <i style={{ width: `${((base.unidades.length - resultado.unidadesPendentes) / base.unidades.length) * 100}%` }} />
              </div>
              <p className="sub">
                {resultado.unidadesPendentes
                  ? `${resultado.unidadesPendentes} apartamento(s) com leitura incompleta. `
                  : 'Todas as leituras chegaram. '}
                {alertas.length
                  ? `${alertas.length} medidor(es) precisam de conferência.`
                  : 'Nenhuma inconsistência encontrada.'}
              </p>
            </div>

            {dias !== null && aberta && (
              <Aviso tipo={dias <= 0 ? 'erro' : 'info'}>
                <strong>Prazo desta competência: {dataBR(prazoDe(comp, prazo))}.</strong>{' '}
                {dias < 0
                  ? semLancar.length
                    ? `Faltam lançar: ${semLancar.map((u) => `apto ${u.id}`).join(', ')}. Vencido há ${Math.abs(dias)} dia${Math.abs(dias) > 1 ? 's' : ''}.`
                    : 'Todos entregaram, ainda que alguns após o prazo.'
                  : dias === 0
                    ? 'Hoje é o último dia.'
                    : `Faltam ${dias} dia${dias > 1 ? 's' : ''}.`}
              </Aviso>
            )}

            {semLancar.length > 0 && (
              <>
                <button className="btn sec" onClick={cobrarNoWhatsApp}>
                  Cobrar pendentes no WhatsApp
                </button>
                <div style={{ height: 14 }} />
              </>
            )}

            <div className="lista">
              {resultado.itens.map((item) => {
                const u = base.unidades.find((x) => x.id === item.unidadeId)!;
                const meds = base.medidores.filter((m) => m.unidadeId === u.id);
                const lidos = meds.filter((m) => leituras[m.id]).length;
                const completo = lidos === meds.length;
                const temAlerta = alertas.some((a) => a.med.unidadeId === u.id);
                const atrasado = dias !== null && dias < 0 && !completo;
                return (
                  <button key={u.id} className="linha-u" onClick={() => setDetalhe(u.id)}>
                    <span className="nome">Apto {u.id}</span>
                    <span className="val">{completo ? `${m3(item.consumo)} m³` : '—'}</span>
                    {!completo ? (
                      <span className={`chip ${atrasado ? 'alerta' : 'pend'}`}>
                        {atrasado ? 'atrasado' : `${lidos}/${meds.length}`}
                      </span>
                    ) : temAlerta ? (
                      <span className="chip alerta">conferir</span>
                    ) : (
                      <span className="chip ok">completo</span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {aba === 'coleta' && detalhe && (
          <ConferenciaApto
            unidadeId={detalhe}
            aberta={aberta}
            onVoltar={() => setDetalhe(null)}
            onSalvo={(texto) => { setMsg({ t: 'ok', texto }); setDetalhe(null); }}
          />
        )}

        {/* ---------- ALERTAS ---------- */}
        {aba === 'alertas' && (
          Object.keys(historico).length < 2 ? (
            <div className="card">
              <span className="eyebrow">Alertas</span>
              <h2 className="disp">Falta histórico</h2>
              <p className="sub">
                A detecção de vazamento compara cada medidor com o próprio passado. Com{' '}
                {Object.keys(historico).length} mês(es) registrado(s) ainda não há base de
                comparação — a partir do segundo fechamento os alertas começam a aparecer.
              </p>
            </div>
          ) : alertas.length === 0 ? (
            <>
              <Aviso tipo="ok">
                <strong>Nenhum medidor fora do padrão.</strong> Os {base.medidores.length}{' '}
                hidrômetros estão dentro da própria média histórica.
              </Aviso>
              <div className="card">
                <span className="eyebrow">Como funciona</span>
                <h3 className="disp">O que dispara um alerta</h3>
                <p className="sub">
                  Consumo acima do dobro da média do próprio medidor, com diferença de pelo menos
                  1 m³; consumo zerado em medidor que sempre teve consumo; leitura menor que a
                  anterior; e três meses seguidos de alta terminando 50% acima da média anterior,
                  que é o padrão de vazamento lento.
                </p>
              </div>
            </>
          ) : (
            <>
              <Aviso tipo="erro">
                <strong>{alertas.length} medidor(es) precisam de conferência.</strong> Cada alerta
                compara o medidor com o próprio histórico, não com a média do prédio — é assim que
                um vazamento localizado aparece mesmo quando o consumo do apartamento inteiro parece
                normal.
              </Aviso>
              {alertas.map(({ med, alertas: as, atual, media, meses }) => (
                <div key={med.id} className="card" style={{ borderColor: 'var(--rubro)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                    <h3 className="disp" style={{ margin: 0 }}>Medidor {med.rotulo}</h3>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--fumo)' }}>
                      {meses} meses de histórico
                    </span>
                  </div>
                  <div style={{ height: 10 }} />
                  <div className="kpis" style={{ marginBottom: 6 }}>
                    <div className="kpi">
                      <span className="eyebrow">Consumo do mês</span>
                      <strong>{atual === null ? '—' : `${m3(atual)} m³`}</strong>
                    </div>
                    <div className="kpi">
                      <span className="eyebrow">Média do medidor</span>
                      <strong>{media === null ? '—' : `${m3(media)} m³`}</strong>
                    </div>
                  </div>
                  {as.map((a, i) => <Aviso key={i} tipo="erro">{a.mensagem}</Aviso>)}
                  <button
                    className="btn sec inline"
                    onClick={() => { setAba('coleta'); setDetalhe(med.unidadeId); }}
                  >
                    Abrir apto {med.unidadeId}
                  </button>
                </div>
              ))}
              <div className="card">
                <span className="eyebrow">Próximo passo</span>
                <h3 className="disp">Como confirmar um vazamento</h3>
                <p className="sub">
                  Feche todos os pontos de água que o medidor atende e observe o hidrômetro por
                  algumas horas. Se os dígitos vermelhos continuarem girando com tudo fechado, há
                  vazamento na tubulação daquele ramal. Vaso sanitário com boia desregulada é a causa
                  mais comum e a mais difícil de perceber, porque não faz barulho nem molha o piso.
                </p>
              </div>
            </>
          )
        )}

        {/* ---------- CONTA ---------- */}
        {aba === 'conta' && (
          <div className="card">
            <span className="eyebrow">Conta da Copasa · {compRotulo(comp)}</span>
            <h2 className="disp">Lançar a conta</h2>
            <p className="sub">
              Estes dados servem para reconciliar: o sistema já calcula a tarifa de cada apartamento
              pela tabela progressiva, e compara a soma com o que a Copasa cobrou do prédio.
            </p>
            <div style={{ height: 14 }} />
            <div className="campos">
              <label>
                <span className="eyebrow">Valor total da conta (R$)</span>
                <input type="number" step="0.01" value={conta.valorTotal || ''}
                  onChange={(e) => setConta({ ...conta, valorTotal: parseFloat(e.target.value) || 0 })} />
              </label>
              <label>
                <span className="eyebrow">Consumo faturado (m³)</span>
                <input type="number" step="0.001" value={conta.consumoM3 || ''}
                  onChange={(e) => setConta({ ...conta, consumoM3: parseFloat(e.target.value) || 0 })} />
              </label>
              <label>
                <span className="eyebrow">Vencimento</span>
                <input type="date" value={conta.vencimento}
                  onChange={(e) => setConta({ ...conta, vencimento: e.target.value })} />
              </label>
              <label>
                <span className="eyebrow">Data da leitura</span>
                <input type="date" value={conta.dataLeitura}
                  onChange={(e) => setConta({ ...conta, dataLeitura: e.target.value })} />
              </label>
              <label>
                <span className="eyebrow">Número da conta (opcional)</span>
                <input type="text" value={conta.numero}
                  onChange={(e) => setConta({ ...conta, numero: e.target.value })} />
              </label>
            </div>
            <div style={{ height: 14 }} />
            <label>
              <span className="eyebrow">
                Diferença entre a conta real e a soma das tarifas individuais
              </span>
              <select value={conta.regra}
                onChange={(e) => setConta({ ...conta, regra: e.target.value as ContaDoc['regra'] })}>
                <option value="igual">Dividir igualmente entre os 6 apartamentos</option>
                <option value="proporcional">Ratear proporcional à tarifa de cada apto</option>
                <option value="condominio">Não repassar — fica com o condomínio</option>
              </select>
            </label>
            <p className="sub" style={{ marginTop: 8 }}>
              Essa diferença é, na prática, o consumo da área comum mais as perdas: água que passou
              pelo hidrômetro da Copasa e não apareceu em nenhum medidor de apartamento.
            </p>
            <div style={{ height: 14 }} />
            <button className="btn" onClick={guardarConta} disabled={ocupado || !aberta}>
              {!aberta ? 'Mês fechado' : ocupado ? 'Salvando…' : 'Salvar conta'}
            </button>
          </div>
        )}

        {/* ---------- TARIFA ---------- */}
        {aba === 'tarifa' && (
          <AbaTarifa onMensagem={(t, texto) => setMsg({ t, texto })} />
        )}

        {/* ---------- FECHAMENTO ---------- */}
        {aba === 'fechamento' && resultado && (
          <>
            <div className="kpis">
              <div className="kpi">
                <span className="eyebrow">Consumo medido</span>
                <strong>{m3(resultado.somaConsumo)} m³</strong>
                <small>{base.medidores.length} hidrômetros</small>
              </div>
              <div className="kpi">
                <span className="eyebrow">Soma das tarifas</span>
                <strong>{brl(resultado.somaTarifada)}</strong>
                <small>escada progressiva</small>
              </div>
              <div className="kpi">
                <span className="eyebrow">Conta da Copasa</span>
                <strong>{resultado.valorConta ? brl(resultado.valorConta) : '—'}</strong>
                <small>{resultado.valorConta ? `${m3(resultado.consumoFaturado)} m³` : 'não lançada'}</small>
              </div>
              <div className="kpi">
                <span className="eyebrow">Área comum + perdas</span>
                <strong>{resultado.valorConta ? brl(resultado.diferencaRS) : '—'}</strong>
                <small>{resultado.valorConta ? `${m3(resultado.diferencaM3)} m³` : '—'}</small>
              </div>
            </div>

            <Aviso tipo={!resultado.valorConta ? 'info' : resultado.diferencaRS < 0 ? 'erro' : 'info'}>
              {!resultado.valorConta ? (
                'Lance a conta da Copasa para reconciliar a soma das tarifas individuais com o valor real cobrado do prédio.'
              ) : resultado.diferencaRS > 0 ? (
                <>
                  A Copasa cobrou <strong>{brl(resultado.diferencaRS)} a mais</strong> que a soma das
                  tarifas individuais. Essa diferença corresponde ao consumo da área comum e às
                  perdas — {m3(resultado.diferencaM3)} m³ que não apareceram em nenhum medidor de
                  apartamento.
                </>
              ) : (
                <>
                  A soma das tarifas individuais ficou{' '}
                  <strong>{brl(Math.abs(resultado.diferencaRS))} acima</strong> da conta real. Isso
                  acontece porque a escada progressiva aplicada apartamento a apartamento cobra mais
                  caro que a conta única do prédio. A sobra é crédito do condomínio.
                </>
              )}
            </Aviso>

            {resultado.unidadesPendentes > 0 && (
              <Aviso tipo="erro">
                <strong>{resultado.unidadesPendentes} apartamento(s) com leitura incompleta.</strong>{' '}
                O consumo foi estimado pela média e está marcado com asterisco.
              </Aviso>
            )}

            <div className="rolagem">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Unidade</th><th>Med.</th><th>Consumo</th><th>%</th>
                    <th>Tarifa</th><th>+ comum</th><th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.itens.map((i) => (
                    <tr key={i.unidadeId} className={i.inconsistencias.length ? 'alerta' : undefined}>
                      <td>Apto {i.unidadeId}{i.estimado ? ' *' : ''}</td>
                      <td>{base.medidores.filter((m) => m.unidadeId === i.unidadeId).length}</td>
                      <td>{m3(i.consumo)}</td>
                      <td>{num(i.percentual, 1)}%</td>
                      <td>{brl(i.tarifado)}</td>
                      <td>{brl(i.parcelaComum)}</td>
                      <td>{brl(i.valor)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td>{base.medidores.length}</td>
                    <td>{m3(resultado.somaConsumo)}</td>
                    <td>100%</td>
                    <td>{brl(resultado.somaTarifada)}</td>
                    <td>{brl(resultado.totalCobrado - resultado.somaTarifada)}</td>
                    <td>{brl(resultado.totalCobrado)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {Math.abs(resultado.aoCondominio) >= 0.01 && resultado.valorConta > 0 && (
              <Aviso tipo="info">
                Fica com o condomínio: <strong>{brl(resultado.aoCondominio)}</strong>.
              </Aviso>
            )}

            <div style={{ height: 14 }} />
            {aberta ? (
              <div className="campos">
                <button className="btn sec" onClick={baixarCSV}>Baixar planilha (CSV)</button>
                <button className="btn" onClick={fechar} disabled={ocupado}>
                  {ocupado ? 'Fechando…' : 'Confirmar fechamento'}
                </button>
              </div>
            ) : (
              <>
                <Aviso tipo="ok">
                  <strong>Mês fechado.</strong> Os valores estão congelados. Correção exige um
                  fechamento retificador.
                </Aviso>
                <button className="btn sec" onClick={baixarCSV}>Baixar planilha (CSV)</button>
              </>
            )}
          </>
        )}

        {/* ---------- CADASTRO ---------- */}
        {aba === 'cadastro' && (
          <>
            <div className="card">
              <span className="eyebrow">Prazo</span>
              <h2 className="disp">Data limite para a leitura</h2>
              <p className="sub">
                Define até quando os moradores podem lançar cada competência. O app marca quem
                atrasou e o lembrete por notificação usa essa data. Não bloqueia o envio — leitura
                atrasada ainda é melhor que estimativa.
              </p>
              <div style={{ height: 12 }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={prazo.ativo} style={{ width: 'auto' }}
                  onChange={(e) => setPrazo({ ...prazo, ativo: e.target.checked })} />
                <span style={{ fontSize: 14 }}>Cobrar prazo de entrega</span>
              </label>
              {prazo.ativo && (
                <>
                  <div style={{ height: 12 }} />
                  <div className="campos">
                    <label>
                      <span className="eyebrow">Dia limite</span>
                      <input type="number" min={1} max={28} value={prazo.dia}
                        onChange={(e) => setPrazo({ ...prazo, dia: Math.min(28, Math.max(1, parseInt(e.target.value, 10) || 5)) })} />
                    </label>
                    <label>
                      <span className="eyebrow">Referência</span>
                      <select value={prazo.ref}
                        onChange={(e) => setPrazo({ ...prazo, ref: e.target.value as Prazo['ref'] })}>
                        <option value="seguinte">do mês seguinte à competência</option>
                        <option value="mesmo">do próprio mês da competência</option>
                      </select>
                    </label>
                  </div>
                  <p className="sub" style={{ marginTop: 8 }}>
                    Com essa configuração, a leitura de {compRotulo(comp)} vence em{' '}
                    <strong>{dataBR(prazoDe(comp, prazo))}</strong>.
                  </p>
                </>
              )}
              <div style={{ height: 14 }} />
              <button className="btn" onClick={guardarPrazo} disabled={ocupado}>
                {ocupado ? 'Salvando…' : 'Salvar prazo'}
              </button>
            </div>

            <div className="card">
              <span className="eyebrow">Unidades</span>
              <h3 className="disp">Apartamentos e medidores</h3>
              <div className="rolagem">
                <table className="tabela">
                  <thead>
                    <tr><th>Apartamento</th><th>Hidrômetros</th><th>Lançados neste mês</th></tr>
                  </thead>
                  <tbody>
                    {base.unidades.map((u) => {
                      const meds = base.medidores.filter((m) => m.unidadeId === u.id);
                      const lidos = meds.filter((m) => leituras[m.id]).length;
                      return (
                        <tr key={u.id}>
                          <td>{u.id}</td>
                          <td>{meds.length}</td>
                          <td>{lidos}/{meds.length}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total</td>
                      <td>{base.medidores.length}</td>
                      <td>{Object.keys(leituras).length}/{base.medidores.length}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="sub" style={{ marginTop: 12 }}>
                Para incluir ou remover hidrômetro, edite a coleção <code>medidores</code> no console
                do Firebase. Mexer nisso com competência aberta muda a leitura anterior de todo
                mundo, por isso não fica exposto aqui.
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
}
