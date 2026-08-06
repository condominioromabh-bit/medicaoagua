'use client';

import { useState } from 'react';
import { getAuthClient } from '@/lib/firebase/client';
import { useApp } from '@/lib/contexto';
import Aviso from './Aviso';
import AtivarPush from './AtivarPush';
import { compRotulo, dataBR, diasAtePrazo, prazoDe } from '@/lib/formato';

interface Resposta {
  ok: boolean;
  aparelhos: number;
  enviados?: string[];
  falhas?: Array<{ unidade: string; motivo: string }>;
  diagnostico: string;
}

/**
 * Diagnóstico das notificações.
 *
 * O cron roda uma vez por dia, então testar esperando ele é lento e não diz
 * onde está o problema. Aqui o síndico vê quantos aparelhos estão registrados e
 * dispara um envio na hora.
 */
export default function DiagnosticoPush() {
  const { base, comp } = useApp();
  const [r, setR] = useState<Resposta | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!base) return null;

  const prazo = base.cfg.prazo;
  const dias = prazo?.ativo ? diasAtePrazo(comp, prazo) : null;

  // a mesma regra usada pelo cron
  const avisaHoje =
    dias !== null && (dias === 3 || dias === 1 || dias === 0 || (dias < 0 && dias >= -14 && dias % 2 === 0));

  function proximoAviso(): string {
    if (dias === null) return 'Prazo desativado no cadastro — nenhum lembrete é enviado.';
    if (dias > 3) return `Em ${dias - 3} dia(s), quando faltarem 3 dias para o prazo.`;
    if (dias === 3 || dias === 1 || dias === 0) return 'Hoje, às 9h.';
    if (dias === 2) return 'Amanhã, quando faltar 1 dia.';
    if (dias < 0 && dias >= -14) return avisaHoje ? 'Hoje, às 9h.' : 'Amanhã — depois do vencimento o aviso vai a cada dois dias.';
    return 'Já passaram mais de 14 dias do vencimento; os lembretes pararam.';
  }

  async function testar() {
    setErro(null);
    setOcupado(true);
    try {
      const token = await getAuthClient().currentUser?.getIdToken();
      const resp = await fetch('/api/push-teste', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const dados = await resp.json();
      if (!resp.ok) {
        setErro(dados.erro ?? 'Falha ao disparar o teste.');
        return;
      }
      setR(dados);
    } catch {
      setErro('Falha de conexão ao disparar o teste.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="card">
      <span className="eyebrow">Notificações</span>
      <h3 className="disp">Diagnóstico do lembrete</h3>
      <p className="sub">
        O lembrete é enviado às 9h, apenas para quem ainda não lançou, em três momentos: 3 dias antes
        do prazo, 1 dia antes e no dia. Depois de vencido, a cada dois dias, parando após duas
        semanas.
      </p>

      <div style={{ height: 14 }} />
      <div className="kpis">
        <div className="kpi">
          <span className="eyebrow">Competência</span>
          <strong>{compRotulo(comp)}</strong>
          <small>{prazo?.ativo ? `vence ${dataBR(prazoDe(comp, prazo))}` : 'sem prazo'}</small>
        </div>
        <div className="kpi">
          <span className="eyebrow">Dias até o prazo</span>
          <strong>{dias === null ? '—' : dias}</strong>
          <small>{avisaHoje ? 'dia de aviso' : 'fora da janela'}</small>
        </div>
        <div className="kpi">
          <span className="eyebrow">Próximo lembrete</span>
          <strong style={{ fontSize: 13 }}>{proximoAviso()}</strong>
        </div>
      </div>

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
                    <tr key={i}><td>Apto {f.unidade}</td><td>{f.motivo}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div style={{ height: 12 }} />
      <button className="btn sec" onClick={testar} disabled={ocupado}>
        {ocupado ? 'Enviando…' : 'Enviar notificação de teste agora'}
      </button>

      <div style={{ height: 16 }} />
      <AtivarPush />

      <div style={{ height: 16 }} />
      <p className="sub">
        <strong>Se o teste diz que enviou mas nada chega:</strong> o bloqueio está no aparelho.
        Verifique se a notificação do site está permitida nas configurações do navegador, se o modo
        Não Perturbe está ligado, e se a economia de bateria está limitando o app.
        <br /><br />
        <strong>Se diz que não há aparelho registrado:</strong> ninguém ativou ainda. Cada pessoa
        precisa abrir o app e tocar em &quot;Ativar lembrete neste aparelho&quot;, inclusive você. No
        iPhone só funciona depois de adicionar o app à Tela de Início pelo Safari — pelo navegador
        comum o iOS não entrega notificação de site.
      </p>
    </div>
  );
}
