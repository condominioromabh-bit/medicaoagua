'use client';

import { useState } from 'react';
import { getAuthClient } from '@/lib/firebase/client';
import { useApp } from '@/lib/contexto';
import Aviso from './Aviso';

interface Resultado {
  codigos: Record<string, string>;
  senhaSindico?: string;
  aviso: string;
}

type Alvo = 'todos' | 'moradores' | 'sindico';

/**
 * Geração de novos códigos de acesso.
 *
 * Formato Roma_XXX, com letras sorteadas. O sorteio existe para que conhecer o
 * próprio código não permita deduzir o dos vizinhos — um padrão como Roma_101,
 * Roma_102 seria adivinhado por qualquer morador.
 */
export default function CodigosAcesso() {
  const { base } = useApp();
  const [r, setR] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<Alvo | null>(null);
  const [copiado, setCopiado] = useState(false);

  if (!base) return null;

  async function gerar(alvo: Alvo) {
    const oQue =
      alvo === 'todos'
        ? 'todos os códigos, incluindo a sua senha de síndico'
        : alvo === 'sindico'
          ? 'a sua senha de síndico'
          : 'os códigos dos seis apartamentos';

    if (!window.confirm(`Isto substitui ${oQue}. Os atuais param de funcionar imediatamente. Continuar?`)) {
      return;
    }

    setErro(null);
    setOcupado(alvo);
    try {
      const token = await getAuthClient().currentUser?.getIdToken();
      const resp = await fetch('/api/codigos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ alvo }),
      });
      const dados = await resp.json();
      if (!resp.ok) {
        setErro(dados.erro ?? 'Não foi possível gerar os códigos.');
        return;
      }
      setR(dados);
      setCopiado(false);
    } catch {
      setErro('Falha de conexão ao gerar os códigos.');
    } finally {
      setOcupado(null);
    }
  }

  const texto = r
    ? [
        'CONDOMÍNIO ROMA — ACESSOS',
        '',
        ...(r.senhaSindico ? [`Síndico: ${r.senhaSindico}`, ''] : []),
        ...Object.entries(r.codigos).map(([apto, cod]) => `Apto ${apto}: ${cod}`),
      ].join('\n')
    : '';

  async function copiar() {
    await navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  return (
    <div className="card">
      <span className="eyebrow">Acesso</span>
      <h3 className="disp">Códigos dos moradores</h3>
      <p className="sub">
        Formato <strong>Roma_XXX</strong>, com três letras sorteadas. O sorteio importa: se os
        códigos seguissem o número do apartamento, qualquer morador deduziria o dos vizinhos a
        partir do próprio. A senha do síndico tem cinco letras, porque é o acesso que altera
        leituras e confirma fechamentos.
      </p>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {r && (
        <>
          <Aviso tipo="erro">
            <strong>Copie agora.</strong> {r.aviso}
          </Aviso>
          <div className="rolagem">
            <table className="tabela">
              <thead>
                <tr><th>Quem</th><th>Código</th></tr>
              </thead>
              <tbody>
                {r.senhaSindico && (
                  <tr className="destaque">
                    <td>Síndico</td>
                    <td style={{ letterSpacing: '0.1em', fontWeight: 700 }}>{r.senhaSindico}</td>
                  </tr>
                )}
                {Object.entries(r.codigos).map(([apto, cod]) => (
                  <tr key={apto}>
                    <td>Apto {apto}</td>
                    <td style={{ letterSpacing: '0.1em', fontWeight: 700 }}>{cod}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ height: 12 }} />
          <button className="btn" onClick={copiar}>
            {copiado ? 'Copiado' : 'Copiar tudo'}
          </button>
          <p className="sub" style={{ marginTop: 12 }}>
            Mande cada código em conversa individual, nunca no grupo — é o código que identifica a
            pessoa no sistema. Se você trocou a própria senha, ela vale a partir do próximo login.
          </p>
          <div style={{ height: 16 }} />
        </>
      )}

      <div className="campos">
        <button className="btn sec" onClick={() => gerar('moradores')} disabled={ocupado !== null}>
          {ocupado === 'moradores' ? 'Gerando…' : 'Novos códigos dos moradores'}
        </button>
        <button className="btn sec" onClick={() => gerar('sindico')} disabled={ocupado !== null}>
          {ocupado === 'sindico' ? 'Gerando…' : 'Nova senha do síndico'}
        </button>
      </div>
      <div style={{ height: 10 }} />
      <button className="btn perigo" onClick={() => gerar('todos')} disabled={ocupado !== null}>
        {ocupado === 'todos' ? 'Gerando…' : 'Gerar todos de uma vez'}
      </button>
    </div>
  );
}
