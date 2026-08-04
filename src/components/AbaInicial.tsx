'use client';

import { useMemo, useState } from 'react';
import { useApp } from '@/lib/contexto';
import Aviso from './Aviso';
import { salvarLeiturasIniciais } from '@/lib/dados';
import { m3 } from '@/lib/formato';

/**
 * Lançamento das leituras iniciais.
 *
 * Sem isso, o primeiro fechamento trataria a leitura anterior como zero e
 * cobraria o hidrômetro inteiro desde a instalação. Aqui o síndico informa o
 * número que cada medidor marcava no fechamento anterior — normalmente a
 * planilha do mês passado — e o primeiro consumo passa a ser a diferença certa.
 *
 * Só aparece enquanto nenhuma competência foi fechada. Depois disso a leitura
 * anterior vem sempre do fechamento, e mexer aqui distorceria o histórico.
 */
export default function AbaInicial({
  onMensagem,
}: {
  onMensagem: (t: 'ok' | 'erro', texto: string) => void;
}) {
  const { base, recarregar } = useApp();
  const [valores, setValores] = useState<Record<string, string>>({});
  const [colar, setColar] = useState('');
  const [unidadeColar, setUnidadeColar] = useState<string>('');
  const [ocupado, setOcupado] = useState(false);

  const jaFechou = useMemo(
    () => (base?.competencias ?? []).some((c) => c.status === 'fechada'),
    [base],
  );

  if (!base) return null;

  if (jaFechou) {
    return (
      <div className="card">
        <span className="eyebrow">Leituras iniciais</span>
        <h2 className="disp">Já não se aplica</h2>
        <p className="sub">
          Como já existe um mês fechado, a leitura anterior de cada medidor passa a vir do
          fechamento — é assim que o histórico se mantém consistente. Para corrigir uma leitura
          específica, use a aba Coleta, abrindo o apartamento.
        </p>
      </div>
    );
  }

  const valorDe = (medId: string, inicial: number) =>
    valores[medId] ?? (inicial ? String(inicial.toFixed(3)) : '');

  const preenchidos = base.medidores.filter((m) => {
    const v = valorDe(m.id, m.leituraInicial ?? 0);
    return v !== '' && !Number.isNaN(parseFloat(v.replace(',', '.')));
  }).length;

  /** Cola uma coluna inteira de valores, um por linha, na ordem dos medidores. */
  function aplicarColagem() {
    if (!unidadeColar) {
      onMensagem('erro', 'Escolha o apartamento antes de colar os valores.');
      return;
    }
    const meds = base!.medidores.filter((m) => m.unidadeId === unidadeColar);
    const nums = colar
      .split(/[\n\t;,]+/)
      .map((x) => x.trim().replace(',', '.'))
      .filter((x) => x !== '')
      .map((x) => parseFloat(x));

    if (nums.some((n) => Number.isNaN(n))) {
      onMensagem('erro', 'Há algo que não é número na lista colada. Confira antes de aplicar.');
      return;
    }
    if (nums.length !== meds.length) {
      onMensagem(
        'erro',
        `Foram encontrados ${nums.length} valores, mas o apto ${unidadeColar} tem ${meds.length} medidores.`,
      );
      return;
    }
    const novos = { ...valores };
    meds.forEach((m, i) => { novos[m.id] = String(nums[i]); });
    setValores(novos);
    setColar('');
    onMensagem('ok', `${nums.length} leituras preenchidas no apto ${unidadeColar}. Confira e salve.`);
  }

  async function salvar() {
    const mapa: Record<string, number> = {};
    const faltando: string[] = [];

    for (const m of base!.medidores) {
      const bruto = valorDe(m.id, m.leituraInicial ?? 0);
      if (bruto === '') { faltando.push(m.rotulo); continue; }
      const n = parseFloat(bruto.replace(',', '.'));
      if (Number.isNaN(n) || n < 0) {
        onMensagem('erro', `O medidor ${m.rotulo} está com valor inválido.`);
        return;
      }
      mapa[m.id] = Math.round(n * 1000) / 1000;
    }

    if (faltando.length) {
      onMensagem(
        'erro',
        `Faltam ${faltando.length} medidor(es): ${faltando.slice(0, 5).join(', ')}${faltando.length > 5 ? '…' : ''}`,
      );
      return;
    }

    setOcupado(true);
    try {
      await salvarLeiturasIniciais(mapa);
      await recarregar();
      setValores({});
      onMensagem('ok', 'Leituras iniciais salvas. O primeiro fechamento já parte desses números.');
    } catch {
      onMensagem('erro', 'Não foi possível salvar as leituras iniciais.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <Aviso tipo="info">
        <strong>Faça isto antes do primeiro fechamento.</strong> Informe o número que cada
        hidrômetro marcava no fechamento anterior — o da planilha do mês passado. Sem isso o sistema
        trata a leitura anterior como zero e o primeiro consumo sai gigante, cobrando o hidrômetro
        inteiro desde que foi instalado.
      </Aviso>

      <div className="card">
        <span className="eyebrow">Atalho</span>
        <h3 className="disp">Colar uma coluna inteira</h3>
        <p className="sub">
          Se você tem os valores numa planilha, selecione a coluna de um apartamento, copie e cole
          aqui — um valor por linha, na ordem dos medidores.
        </p>
        <div style={{ height: 12 }} />
        <label>
          <span className="eyebrow">Apartamento</span>
          <select value={unidadeColar} onChange={(e) => setUnidadeColar(e.target.value)}>
            <option value="">escolha…</option>
            {base.unidades.map((u) => (
              <option key={u.id} value={u.id}>
                Apto {u.id} — {base.medidores.filter((m) => m.unidadeId === u.id).length} medidores
              </option>
            ))}
          </select>
        </label>
        <div style={{ height: 10 }} />
        <textarea
          value={colar}
          onChange={(e) => setColar(e.target.value)}
          placeholder={'118.450\n204.000\n87.320\n…'}
        />
        <div style={{ height: 10 }} />
        <button className="btn sec" onClick={aplicarColagem} disabled={!colar.trim()}>
          Aplicar ao apartamento
        </button>
      </div>

      <div className="card">
        <span className="eyebrow">
          {preenchidos} de {base.medidores.length} medidores preenchidos
        </span>
        <h2 className="disp">Leitura de cada hidrômetro</h2>
        <p className="sub">
          O valor em m³, com as casas decimais se houver. Este é o número do mostrador, não o
          consumo do mês.
        </p>

        {base.unidades.map((u) => {
          const meds = base.medidores.filter((m) => m.unidadeId === u.id);
          return (
            <div key={u.id} style={{ marginTop: 18 }}>
              <span className="eyebrow">Apto {u.id} · {meds.length} medidores</span>
              <div style={{ height: 8 }} />
              <div className="rolagem">
                <table className="tabela">
                  <thead>
                    <tr><th>Medidor</th><th>Leitura no fechamento anterior (m³)</th></tr>
                  </thead>
                  <tbody>
                    {meds.map((m) => (
                      <tr key={m.id}>
                        <td>{m.rotulo}</td>
                        <td>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="0,000"
                            value={valorDe(m.id, m.leituraInicial ?? 0)}
                            onChange={(e) =>
                              setValores((v) => ({ ...v, [m.id]: e.target.value }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        <div style={{ height: 16 }} />
        <button className="btn" onClick={salvar} disabled={ocupado}>
          {ocupado ? 'Salvando…' : `Salvar as ${base.medidores.length} leituras iniciais`}
        </button>
      </div>

      <div className="card">
        <span className="eyebrow">Depois</span>
        <h3 className="disp">O que acontece a partir daqui</h3>
        <p className="sub">
          Os moradores lançam a leitura do mês atual, e o consumo de cada um passa a ser a diferença
          para os números que você acabou de informar. A partir do primeiro fechamento confirmado,
          esta aba deixa de aparecer — a leitura anterior passa a vir sempre do mês fechado.
        </p>
      </div>
    </>
  );
}
