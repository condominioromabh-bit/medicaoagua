'use client';

import { useState } from 'react';
import { getAuthClient } from '@/lib/firebase/client';
import { useApp } from '@/lib/contexto';
import Aviso from './Aviso';
import { compRotulo } from '@/lib/formato';

interface Resposta {
  ok: boolean;
  aparelhos: number;
  enviados?: string[];
  falhas?: Array<{ unidade: string; motivo: string }>;
  diagnostico: string;
}

/**
 * Notificação manual disparada pelo síndico.
 *
 * O cron cobre a rotina, mas há casos em que é preciso avisar na hora: mudança
 * de prazo, leiturista da Copasa antecipado, conta que chegou mais cedo.
 */
export default function NotificarMoradores() {
  const { comp } = useApp();
  const [r, setR] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [personalizar, setPersonalizar] = useState(false);
  const [mensagem, setMensagem] = useState('');

  async function enviar(alvo: 'todos' | 'pendentes') {
    setErro(null);
    setR(null);
    setOcupado(alvo);
    try {
      const token = await getAuthClient().currentUser?.getIdToken();
      const resp = await fetch('/api/notificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          alvo,
          competencia: comp,
          mensagem: personalizar ? mensagem : undefined,
        }),
      });
      const dados = await resp.json();
      if (!resp.ok) {
        setErro(dados.erro ?? 'Não foi possível enviar.');
        return;
      }
      setR(dados);
    } catch {
      setErro('Falha de conexão ao enviar a notificação.');
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="card">
      <span className="eyebrow">Notificação</span>
      <h3 className="disp">Avisar os moradores agora</h3>
      <p className="sub">
        Chega como notificação no celular de quem ativou o lembrete. O texto padrão nomeia o
        apartamento de quem recebe — &quot;Realizar a leitura da água do apto 302&quot; — porque
        aviso genérico numa tela cheia passa batido.
      </p>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {r && (
        <>
          <Aviso tipo={r.ok ? 'ok' : 'erro'}>
            <strong>{r.aparelhos} aparelho(s) registrado(s).</strong> {r.diagnostico}
          </Aviso>
          {r.falhas && r.falhas.length > 0 && (
            <div className="rolagem">
              <table className="tabela">
                <thead><tr><th>Apartamento</th><th>Erro</th></tr></thead>
                <tbody>
                  {r.falhas.map((f, i) => (
                    <tr key={i}>
                      <td>{f.unidade === 'sindico' ? 'Você' : `Apto ${f.unidade}`}</td>
                      <td>{f.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div style={{ height: 12 }} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={personalizar}
          style={{ width: 'auto' }}
          onChange={(e) => setPersonalizar(e.target.checked)}
        />
        <span style={{ fontSize: 14 }}>Escrever uma mensagem própria</span>
      </label>

      {personalizar && (
        <>
          <div style={{ height: 10 }} />
          <textarea
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            maxLength={180}
            placeholder="Ex.: O leiturista da Copasa passa amanhã. Lancem a leitura hoje."
          />
          <p className="sub" style={{ marginTop: 6 }}>
            {mensagem.length}/180 caracteres. Sem texto próprio, vai a mensagem padrão com o número
            do apartamento e o prazo.
          </p>
        </>
      )}

      <div style={{ height: 14 }} />
      <div className="campos">
        <button
          className="btn"
          onClick={() => enviar('pendentes')}
          disabled={ocupado !== null || (personalizar && !mensagem.trim())}
        >
          {ocupado === 'pendentes' ? 'Enviando…' : 'Notificar só quem falta'}
        </button>
        <button
          className="btn sec"
          onClick={() => enviar('todos')}
          disabled={ocupado !== null || (personalizar && !mensagem.trim())}
        >
          {ocupado === 'todos' ? 'Enviando…' : 'Notificar a todos'}
        </button>
      </div>

      <p className="sub" style={{ marginTop: 12 }}>
        Competência {compRotulo(comp)}. Quem já entregou a leitura não recebe no primeiro botão —
        use o segundo apenas quando o aviso valer para o prédio inteiro, para a notificação não
        virar ruído e as pessoas desativarem.
      </p>
    </div>
  );
}
