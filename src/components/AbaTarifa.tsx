'use client';

import { useMemo, useState } from 'react';
import { useApp } from '@/lib/contexto';
import Aviso from './Aviso';
import { salvarTarifa } from '@/lib/dados';
import { faturar, type Faixa, type Tarifa } from '@/lib/calculo';
import { brl, m3, num } from '@/lib/formato';

/**
 * Edição da tabela tarifária, com um conferidor contra uma conta real.
 *
 * O conferidor testa as duas hipóteses de faturamento de prédio com várias
 * economias: escada única sobre o total, ou consumo dividido pelo número de
 * economias antes de aplicar as faixas. A diferença entre as duas chega a
 * centenas de reais, e só uma conta real revela qual a Copasa usa.
 */
export default function AbaTarifa({
  onMensagem,
}: {
  onMensagem: (t: 'ok' | 'erro', texto: string) => void;
}) {
  const { base, recarregar } = useApp();
  const [tarifa, setTarifa] = useState<Tarifa | null>(base?.cfg.tarifa ?? null);
  const [sim, setSim] = useState({ consumo: '', valor: '', economias: '6' });
  const [ocupado, setOcupado] = useState(false);

  const conferencia = useMemo(() => {
    if (!tarifa) return null;
    const c = parseFloat(sim.consumo);
    if (!c || Number.isNaN(c)) return null;
    const n = Math.max(1, parseInt(sim.economias, 10) || 1);
    const real = parseFloat(sim.valor);

    const direta = faturar(c, tarifa);
    const porEconomia = faturar(c / n, tarifa);
    const media = Math.round(porEconomia.total * n * 100) / 100;

    if (!real || Number.isNaN(real)) {
      return { direta, media, n, real: null, difA: null, difB: null, bate: null };
    }
    const difA = Math.round((direta.total - real) * 100) / 100;
    const difB = Math.round((media - real) * 100) / 100;
    const bate = Math.abs(difA) < 0.5 ? 'A' : Math.abs(difB) < 0.5 ? 'B' : null;
    return { direta, media, n, real, difA, difB, bate };
  }, [tarifa, sim]);

  if (!tarifa) return null;

  function mudarFaixa(i: number, campo: keyof Faixa, valor: string) {
    const faixas = tarifa!.faixas.map((f, k) => {
      if (k !== i) return f;
      if (campo === 'ate') return { ...f, ate: valor === '' ? null : parseFloat(valor) || 0 };
      return { ...f, [campo]: parseFloat(valor) || 0 };
    });
    setTarifa({ ...tarifa!, faixas });
  }

  function adicionarFaixa() {
    const f = tarifa!.faixas;
    const ultima = f[f.length - 1];
    const penultima = f.length > 1 ? f[f.length - 2] : null;
    const base_ = penultima?.ate ?? 0;
    const novas = [...f];
    novas.splice(f.length - 1, 0, { ate: base_ + 5, agua: ultima.agua, esgoto: ultima.esgoto });
    setTarifa({ ...tarifa!, faixas: novas });
  }

  function removerFaixa(i: number) {
    if (tarifa!.faixas.length <= 2) {
      onMensagem('erro', 'A tabela precisa de pelo menos duas faixas.');
      return;
    }
    setTarifa({ ...tarifa!, faixas: tarifa!.faixas.filter((_, k) => k !== i) });
  }

  async function guardar() {
    setOcupado(true);
    try {
      await salvarTarifa(tarifa!);
      await recarregar();
      onMensagem('ok', 'Tabela tarifária salva.');
    } catch {
      onMensagem('erro', 'Não foi possível salvar a tabela.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <Aviso tipo="erro">
        <strong>Confira estes valores antes do primeiro fechamento.</strong> A Arsae-MG reconstruiu a
        estrutura tarifária da Copasa em 22/01/2026, com reposicionamento de 4,04% e efeito médio de
        6,56% — cada faixa variou de forma diferente, então não dá para atualizar multiplicando por
        um percentual. Copie os valores da conta atual.
      </Aviso>

      <div className="card">
        <span className="eyebrow">Tabela tarifária</span>
        <h2 className="disp">Faixas de consumo</h2>
        <p className="sub">
          A tarifa fixa é cobrada por economia, ou seja, uma vez para cada apartamento. As faixas são
          progressivas e aplicadas ao consumo de cada unidade.
        </p>
        <div style={{ height: 14 }} />
        <div className="campos">
          <label>
            <span className="eyebrow">Tarifa fixa água (R$/apto)</span>
            <input type="number" step="0.01" value={tarifa.fixaAgua}
              onChange={(e) => setTarifa({ ...tarifa, fixaAgua: parseFloat(e.target.value) || 0 })} />
          </label>
          <label>
            <span className="eyebrow">Tarifa fixa esgoto (R$/apto)</span>
            <input type="number" step="0.01" value={tarifa.fixaEsgoto}
              onChange={(e) => setTarifa({ ...tarifa, fixaEsgoto: parseFloat(e.target.value) || 0 })} />
          </label>
        </div>

        <div style={{ height: 14 }} />
        <div className="rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Faixa (m³)</th><th>Teto</th><th>R$/m³ água</th>
                <th>R$/m³ esgoto</th><th>Soma</th><th />
              </tr>
            </thead>
            <tbody>
              {tarifa.faixas.map((f, i) => (
                <tr key={i}>
                  <td>{i === 0 ? '0' : tarifa.faixas[i - 1].ate} a {f.ate === null ? '+' : f.ate}</td>
                  <td>
                    <input type="number" step="0.001" placeholder="sem teto"
                      value={f.ate === null ? '' : f.ate}
                      onChange={(e) => mudarFaixa(i, 'ate', e.target.value)} />
                  </td>
                  <td>
                    <input type="number" step="0.0001" value={f.agua}
                      onChange={(e) => mudarFaixa(i, 'agua', e.target.value)} />
                  </td>
                  <td>
                    <input type="number" step="0.0001" value={f.esgoto}
                      onChange={(e) => mudarFaixa(i, 'esgoto', e.target.value)} />
                  </td>
                  <td>{num(f.agua + f.esgoto, 3)}</td>
                  <td><button className="cam" onClick={() => removerFaixa(i)}>remover</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ height: 12 }} />
        <button className="btn sec" onClick={adicionarFaixa}>Adicionar faixa</button>
        <div style={{ height: 12 }} />
        <button className="btn" onClick={guardar} disabled={ocupado}>
          {ocupado ? 'Salvando…' : 'Salvar tabela'}
        </button>
      </div>

      <div className="card">
        <span className="eyebrow">Conferência</span>
        <h2 className="disp">Testar contra uma conta real</h2>
        <p className="sub">
          Pegue uma conta da Copasa, informe o consumo e o valor, e veja se a tabela configurada
          reproduz o mesmo número. Se bater, a tabela está certa. Se não bater, alguma faixa está
          errada.
        </p>
        <div style={{ height: 14 }} />
        <div className="campos">
          <label>
            <span className="eyebrow">Consumo da conta (m³)</span>
            <input type="number" step="0.001" value={sim.consumo}
              onChange={(e) => setSim({ ...sim, consumo: e.target.value })} />
          </label>
          <label>
            <span className="eyebrow">Valor da conta (R$)</span>
            <input type="number" step="0.01" value={sim.valor}
              onChange={(e) => setSim({ ...sim, valor: e.target.value })} />
          </label>
        </div>
        <div style={{ height: 12 }} />
        <label>
          <span className="eyebrow">Nº de economias na conta</span>
          <input type="number" min={1} step={1} value={sim.economias}
            onChange={(e) => setSim({ ...sim, economias: e.target.value })} />
        </label>
        <p className="sub" style={{ marginTop: 6 }}>
          Para a conta do prédio use 6. Para uma casa comum, 1.
        </p>

        {conferencia && (
          <>
            <div style={{ height: 14 }} />
            <div className="rolagem">
              <table className="tabela">
                <thead><tr><th>Faixa</th><th>Volume</th><th>Valor</th></tr></thead>
                <tbody>
                  {conferencia.direta.linhas.map((l, i) => (
                    <tr key={i}>
                      <td>{l.faixa}</td>
                      <td>{l.volume === null ? '—' : m3(l.volume)}</td>
                      <td>{brl(l.valor)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td>Total pela tabela</td><td /><td>{brl(conferencia.direta.total)}</td></tr>
                </tfoot>
              </table>
            </div>

            {conferencia.real !== null && (
              <>
                <div style={{ height: 14 }} />
                <div className="rolagem">
                  <table className="tabela">
                    <thead>
                      <tr><th>Hipótese</th><th>Valor calculado</th><th>Diferença</th></tr>
                    </thead>
                    <tbody>
                      <tr className={conferencia.bate === 'A' ? 'destaque' : undefined}>
                        <td>A · escada única sobre o consumo total</td>
                        <td>{brl(conferencia.direta.total)}</td>
                        <td>{brl(conferencia.difA!)}</td>
                      </tr>
                      {conferencia.n > 1 && (
                        <tr className={conferencia.bate === 'B' ? 'destaque' : undefined}>
                          <td>B · consumo ÷ {conferencia.n} economias, escada, × {conferencia.n}</td>
                          <td>{brl(conferencia.media)}</td>
                          <td>{brl(conferencia.difB!)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {conferencia.bate ? (
                  <Aviso tipo="ok">
                    <strong>A tabela reproduz a conta pela hipótese {conferencia.bate}.</strong> Pode
                    confiar nos valores configurados e usar esse critério no fechamento.
                  </Aviso>
                ) : (
                  <Aviso tipo="erro">
                    <strong>Nenhuma hipótese bateu com a conta.</strong> Confira as faixas e as
                    tarifas fixas — ou a conta pode ter itens fora da tarifa, como serviços avulsos
                    ou parcelamento.
                  </Aviso>
                )}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
