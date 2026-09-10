'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/lib/contexto';
import { getAuthClient } from '@/lib/firebase/client';
import Aviso from './Aviso';
import { carregarFoto, comprimirFoto, salvarLeituras, trocarFoto } from '@/lib/dados';
import { alertasDoMedidor, faturar, montarSerie } from '@/lib/calculo';
import { brl, compRotulo, m3 } from '@/lib/formato';

type Vista = 'tabela' | 'fotos';

/**
 * Conferência de um apartamento pelo síndico.
 *
 * A vista de fotos existe porque conferir leitura é comparar duas coisas: o
 * número digitado e o mostrador fotografado. Abrir uma foto por vez, numa área
 * separada do campo, tornava isso lento — o síndico perdia de vista qual
 * medidor estava conferindo. Aqui a foto fica acima do campo correspondente.
 */
export default function ConferenciaApto({
  unidadeId, aberta, onVoltar, onSalvo,
}: {
  unidadeId: string;
  aberta: boolean;
  onVoltar: () => void;
  onSalvo: (texto: string) => void;
}) {
  const { base, comp, leituras, historico, sessao, recarregar } = useApp();
  const [vista, setVista] = useState<Vista>('tabela');
  const [edicao, setEdicao] = useState<Record<string, string>>({});
  const [fotos, setFotos] = useState<Record<string, string | null>>({});
  const [carregandoFotos, setCarregandoFotos] = useState(false);
  const [trocando, setTrocando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [limpando, setLimpando] = useState(false);

  const medidores = useMemo(
    () => (base ? base.medidores.filter((m) => m.unidadeId === unidadeId) : []),
    [base, unidadeId],
  );

  const anteriorDe = useCallback(
    (medId: string, inicial: number) => {
      const comps = Object.keys(historico).filter((c) => c < comp).sort();
      for (let i = comps.length - 1; i >= 0; i--) {
        const v = historico[comps[i]]?.[medId];
        if (typeof v === 'number') return v;
      }
      return inicial;
    },
    [historico, comp],
  );

  // ao abrir a vista de fotos, busca todas de uma vez
  useEffect(() => {
    if (vista !== 'fotos' || !medidores.length) return;
    let vivo = true;
    setCarregandoFotos(true);
    (async () => {
      const out: Record<string, string | null> = {};
      for (const med of medidores) {
        if (!leituras[med.id]?.temFoto) { out[med.id] = null; continue; }
        try {
          out[med.id] = await carregarFoto(comp, med.id);
        } catch {
          out[med.id] = null;
        }
      }
      if (vivo) { setFotos(out); setCarregandoFotos(false); }
    })();
    return () => { vivo = false; };
  }, [vista, medidores, leituras, comp]);

  const linhas = medidores.map((med) => {
    const anterior = anteriorDe(med.id, med.leituraInicial ?? 0);
    const bruto = edicao[med.id] ?? (leituras[med.id] ? leituras[med.id].valor.toFixed(3) : '');
    const atual = bruto === '' ? null : parseFloat(bruto.replace(',', '.'));
    const consumo =
      atual === null || Number.isNaN(atual) ? null : Math.round((atual - anterior) * 1000) / 1000;

    const porComp: Record<string, number | undefined> = {};
    for (const [c, l] of Object.entries(historico)) porComp[c] = l[med.id];
    const serie = montarSerie(porComp, med.leituraInicial ?? 0);
    const passado = serie.filter((p) => p.competencia < comp);
    const media = passado.length ? passado.reduce((a, b) => a + b.consumo, 0) / passado.length : null;

    return {
      med, anterior, bruto, consumo, media,
      alertas: alertasDoMedidor(serie),
      temFoto: !!leituras[med.id]?.temFoto,
    };
  });

  const completo = linhas.every((l) => l.consumo !== null);
  const consumoTotal = completo
    ? Math.round(linhas.reduce((a, l) => a + Math.max(0, l.consumo!), 0) * 1000) / 1000
    : null;
  const fatura = completo && base ? faturar(consumoTotal!, base.cfg.tarifa) : null;
  const semFoto = linhas.filter((l) => !l.temFoto).length;

  async function substituirFoto(medId: string, file: File | undefined) {
    if (!file) return;
    setTrocando(medId);
    setErro(null);
    try {
      const url = await comprimirFoto(file);
      await trocarFoto(comp, medId, unidadeId, url);
      setFotos((f) => ({ ...f, [medId]: url }));
      await recarregar();
    } catch (e) {
      setErro(
        e instanceof Error && e.message.includes('grande')
          ? e.message
          : 'Não foi possível substituir a foto.',
      );
    } finally {
      setTrocando(null);
    }
  }

  /** Devolve o apartamento a pendente — usado quando alguém lançou no mês errado. */
  async function limpar() {
    const lancados = linhas.filter((l) => leituras[l.med.id]).length;
    if (!lancados) {
      setErro('Este apartamento ainda não tem leitura nesta competência.');
      return;
    }
    const texto =
      `Apagar as ${lancados} leitura(s) e fotos do apto ${unidadeId} em ${compRotulo(comp)}?\n\n` +
      'Ele volta a constar como pendente e o morador poderá lançar de novo. Isso não pode ser desfeito.';
    if (!window.confirm(texto)) return;

    setErro(null);
    setLimpando(true);
    try {
      const token = await getAuthClient().currentUser?.getIdToken();
      const resp = await fetch('/api/limpar-leitura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ competencia: comp, unidadeId }),
      });
      const dados = await resp.json();
      if (!resp.ok) {
        setErro(dados.erro ?? 'Não foi possível apagar as leituras.');
        return;
      }
      setEdicao({});
      setFotos({});
      await recarregar();
      onSalvo(dados.aviso);
    } catch {
      setErro('Falha de conexão ao apagar as leituras.');
    } finally {
      setLimpando(false);
    }
  }

  async function salvar() {
    if (!sessao) return;
    const valores: Record<string, number> = {};
    for (const l of linhas) {
      if (edicao[l.med.id] === undefined) continue; // não mexeu
      const n = parseFloat(edicao[l.med.id].replace(',', '.'));
      if (Number.isNaN(n)) {
        setErro(`O medidor ${l.med.rotulo} está com valor inválido.`);
        return;
      }
      valores[l.med.id] = Math.round(n * 1000) / 1000;
    }
    if (!Object.keys(valores).length) {
      setErro('Nenhuma leitura foi alterada.');
      return;
    }
    setOcupado(true);
    try {
      await salvarLeituras(comp, unidadeId, valores, {}, sessao.uid, true);
      await recarregar();
      onSalvo(`Leituras do apto ${unidadeId} atualizadas.`);
    } catch {
      setErro('Não foi possível salvar a correção.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <button className="btn sec inline" onClick={onVoltar}>← Voltar à coleta</button>
      <div style={{ height: 12 }} />

      <div className="card">
        <span className="eyebrow">Conferência</span>
        <h2 className="disp">Apto {unidadeId}</h2>

        <div className="abas" style={{ marginTop: 12 }}>
          <button
            className={`aba${vista === 'tabela' ? ' on' : ''}`}
            onClick={() => setVista('tabela')}
          >
            Tabela
          </button>
          <button
            className={`aba${vista === 'fotos' ? ' on' : ''}`}
            onClick={() => setVista('fotos')}
          >
            Conferir fotos ({medidores.length - semFoto}/{medidores.length})
          </button>
        </div>

        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {semFoto > 0 && (
          <Aviso tipo="erro">
            {semFoto} medidor(es) sem foto. O morador pode anexar pelo próprio app até o fechamento,
            sem reenviar os números — ou você anexa aqui.
          </Aviso>
        )}

        {vista === 'fotos' &&
          (carregandoFotos ? (
            <div className="carregando"><span className="eyebrow">Carregando fotos…</span></div>
          ) : (
            <div style={{ marginTop: 14 }}>
              {linhas.map((l) => (
                <div
                  key={l.med.id}
                  className="card"
                  style={{ borderColor: l.alertas.length ? 'var(--rubro)' : undefined }}
                >
                  <div
                    style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'baseline', gap: 10,
                    }}
                  >
                    <h3 className="disp" style={{ margin: 0, fontSize: 15 }}>{l.med.rotulo}</h3>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--fumo)' }}>
                      anterior {m3(l.anterior)}
                    </span>
                  </div>

                  <div style={{ height: 10 }} />
                  {fotos[l.med.id] ? (
                    <img className="det-foto" src={fotos[l.med.id]!} alt={`Hidrômetro ${l.med.rotulo}`} />
                  ) : (
                    <Aviso tipo="info">
                      Sem foto. Ou o morador não anexou, ou a imagem passou dos 6 meses de guarda e
                      foi apagada automaticamente.
                    </Aviso>
                  )}

                  <div style={{ height: 12 }} />
                  <div className="campos">
                    <label>
                      <span className="eyebrow">Leitura informada (m³)</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={l.bruto}
                        disabled={!aberta}
                        placeholder="—"
                        onChange={(e) => setEdicao((x) => ({ ...x, [l.med.id]: e.target.value }))}
                      />
                    </label>
                    <div>
                      <span className="eyebrow">Consumo · média do medidor</span>
                      <div style={{ height: 6 }} />
                      <span className="mono" style={{ fontSize: 15 }}>
                        {l.consumo === null ? '—' : `${m3(l.consumo)} m³`}
                        <span style={{ color: 'var(--fumo)', fontSize: 12 }}>
                          {'  ·  '}
                          {l.media === null ? 'sem média' : `${m3(l.media)} m³`}
                        </span>
                      </span>
                    </div>
                  </div>

                  {l.alertas.length > 0 && (
                    <>
                      <div style={{ height: 10 }} />
                      {l.alertas.map((a, i) => <Aviso key={i} tipo="erro">{a.mensagem}</Aviso>)}
                    </>
                  )}

                  <div style={{ height: 10 }} />
                  <label
                    className="btn sec"
                    style={{ textAlign: 'center', cursor: aberta ? 'pointer' : 'not-allowed' }}
                  >
                    {trocando === l.med.id
                      ? 'Salvando…'
                      : l.temFoto
                        ? 'Substituir esta foto'
                        : 'Anexar foto'}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={!aberta || trocando !== null}
                      style={{ display: 'none' }}
                      onChange={(e) => substituirFoto(l.med.id, e.target.files?.[0])}
                    />
                  </label>
                </div>
              ))}
            </div>
          ))}

        {vista === 'tabela' && (
          <>
            <div style={{ height: 10 }} />
            <div className="rolagem">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Medidor</th><th>Anterior</th><th>Atual</th>
                    <th>Consumo</th><th>Média</th><th>Foto</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr
                      key={l.med.id}
                      className={l.alertas.length || (l.consumo ?? 0) < 0 ? 'alerta' : undefined}
                    >
                      <td>{l.med.rotulo}{l.alertas.length ? ' ⚠' : ''}</td>
                      <td>{m3(l.anterior)}</td>
                      <td>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={l.bruto}
                          disabled={!aberta}
                          placeholder="—"
                          onChange={(e) => setEdicao((x) => ({ ...x, [l.med.id]: e.target.value }))}
                        />
                      </td>
                      <td>{l.consumo === null ? '—' : m3(l.consumo)}</td>
                      <td>{l.media === null ? '—' : m3(l.media)}</td>
                      <td>{l.temFoto ? '✓' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Consumo total</td><td /><td />
                    <td>{consumoTotal === null ? '—' : m3(consumoTotal)}</td>
                    <td /><td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}

        <div style={{ height: 14 }} />
        <button className="btn" onClick={salvar} disabled={!aberta || ocupado}>
          {!aberta ? 'Mês fechado' : ocupado ? 'Salvando…' : 'Salvar leituras corrigidas'}
        </button>

        {aberta && linhas.some((l) => leituras[l.med.id]) && (
          <>
            <div style={{ height: 22 }} />
            <span className="eyebrow">Lançado no mês errado?</span>
            <p className="sub" style={{ marginTop: 6 }}>
              Apagar devolve o apartamento a pendente em {compRotulo(comp)}, e o morador lança de
              novo na competência certa. As leituras dos outros meses não são afetadas.
            </p>
            <div style={{ height: 10 }} />
            <button className="btn perigo" onClick={limpar} disabled={limpando}>
              {limpando ? 'Apagando…' : `Apagar a leitura deste apartamento em ${compRotulo(comp)}`}
            </button>
          </>
        )}

        {fatura && (
          <>
            <div style={{ height: 20 }} />
            <span className="eyebrow">Como a cobrança é montada</span>
            <div style={{ height: 8 }} />
            <div className="rolagem">
              <table className="tabela">
                <thead><tr><th>Faixa</th><th>Volume</th><th>Valor</th></tr></thead>
                <tbody>
                  {fatura.linhas.map((l, i) => (
                    <tr key={i}>
                      <td>{l.faixa}</td>
                      <td>{l.volume === null ? '—' : m3(l.volume)}</td>
                      <td>{brl(l.valor)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td>Tarifa do apartamento</td><td /><td>{brl(fatura.total)}</td></tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
