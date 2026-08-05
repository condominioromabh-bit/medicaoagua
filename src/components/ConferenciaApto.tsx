'use client';

import { useCallback, useMemo, useState } from 'react';
import { useApp } from '@/lib/contexto';
import Aviso from './Aviso';
import { carregarFoto, salvarLeituras } from '@/lib/dados';
import { alertasDoMedidor, faturar, montarSerie } from '@/lib/calculo';
import { brl, m3 } from '@/lib/formato';

/** Conferência de um apartamento: leituras, média histórica, foto e correção. */
export default function ConferenciaApto({
  unidadeId, aberta, onVoltar, onSalvo,
}: {
  unidadeId: string;
  aberta: boolean;
  onVoltar: () => void;
  onSalvo: (texto: string) => void;
}) {
  const { base, comp, leituras, historico, sessao, recarregar } = useApp();
  const [edicao, setEdicao] = useState<Record<string, string>>({});
  const [foto, setFoto] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

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

  const linhas = medidores.map((med) => {
    const anterior = anteriorDe(med.id, med.leituraInicial ?? 0);
    const bruto = edicao[med.id] ?? (leituras[med.id] ? String(leituras[med.id].valor.toFixed(3)) : '');
    const atual = bruto === '' ? null : parseFloat(bruto.replace(',', '.'));
    const consumo = atual === null || Number.isNaN(atual) ? null : Math.round((atual - anterior) * 1000) / 1000;

    const porComp: Record<string, number | undefined> = {};
    for (const [c, l] of Object.entries(historico)) porComp[c] = l[med.id];
    const serie = montarSerie(porComp, med.leituraInicial ?? 0);
    const passado = serie.filter((p) => p.competencia < comp);
    const media = passado.length ? passado.reduce((a, b) => a + b.consumo, 0) / passado.length : null;

    return { med, anterior, bruto, consumo, media, alertas: alertasDoMedidor(serie) };
  });

  const completo = linhas.every((l) => l.consumo !== null);
  const consumoTotal = completo
    ? Math.round(linhas.reduce((a, l) => a + Math.max(0, l.consumo!), 0) * 1000) / 1000
    : null;
  const fatura = completo && base ? faturar(consumoTotal!, base.cfg.tarifa) : null;

  async function verFoto(medId: string) {
    if (!leituras[medId]?.temFoto) return;
    setFoto(null);
    try {
      const img = await carregarFoto(comp, medId);
      if (img) setFoto(img);
      else setErro('Foto não encontrada. Fotos com mais de 6 meses são apagadas automaticamente; as leituras e os valores continuam guardados.');
    } catch {
      setErro('Não foi possível carregar a foto agora.');
    }
  }

  async function salvar() {
    if (!sessao) return;
    const valores: Record<string, number> = {};
    for (const l of linhas) {
      const n = parseFloat((edicao[l.med.id] ?? '').replace(',', '.'));
      if (edicao[l.med.id] === undefined) continue; // não mexeu
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
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <div style={{ height: 10 }} />
        <div className="rolagem">
          <table className="tabela">
            <thead>
              <tr><th>Medidor</th><th>Anterior</th><th>Atual</th><th>Consumo</th><th>Média</th><th>Foto</th></tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <>
                  <tr key={l.med.id} className={l.alertas.length || (l.consumo ?? 0) < 0 ? 'alerta' : undefined}>
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
                    <td>
                      {leituras[l.med.id]?.temFoto
                        ? <button className="cam" onClick={() => verFoto(l.med.id)}>ver</button>
                        : '—'}
                    </td>
                  </tr>
                  {l.alertas.length > 0 && (
                    <tr key={`${l.med.id}-al`}>
                      <td colSpan={6} style={{
                        textAlign: 'left', background: 'var(--rubro-claro)', color: '#8A2A1D',
                        fontFamily: 'Public Sans, sans-serif', fontSize: 12.5,
                      }}>
                        {l.alertas.map((a) => a.mensagem).join(' · ')}
                      </td>
                    </tr>
                  )}
                </>
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

        <div style={{ height: 12 }} />
        <button className="btn" onClick={salvar} disabled={!aberta || ocupado}>
          {!aberta ? 'Mês fechado' : ocupado ? 'Salvando…' : 'Salvar leituras corrigidas'}
        </button>

        {foto && <img className="det-foto" src={foto} alt={`Hidrômetro do apto ${unidadeId}`} />}

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
