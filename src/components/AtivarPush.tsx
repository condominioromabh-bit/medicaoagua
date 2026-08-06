'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/contexto';
import { ativarPush, estadoPush, type EstadoPush } from '@/lib/firebase/push';
import { condoId } from '@/lib/firebase/client';

/**
 * Ativação do lembrete por notificação.
 *
 * O caso do iPhone é tratado explicitamente: no iOS o push web só funciona se o
 * site tiver sido adicionado à Tela de Início. Pedir permissão pelo Safari
 * comum não dá erro visível — simplesmente nunca chega notificação. Por isso a
 * instrução aparece em vez do botão.
 */
export default function AtivarPush() {
  const { sessao } = useApp();
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    estadoPush().then(setEstado);
  }, []);

  if (!estado || estado === 'indisponivel' || !sessao) return null;
  const alvo = sessao.unidadeId ?? 'sindico';

  if (estado === 'ativo') {
    return (
      <div className="aviso ok">
        Lembrete ativado neste aparelho. Você recebe aviso 3 dias antes do prazo, na véspera e no dia.
      </div>
    );
  }

  if (estado === 'precisa_instalar') {
    return (
      <div className="card">
        <span className="eyebrow">Lembrete</span>
        <h3 className="disp">Para receber aviso no iPhone</h3>
        <p className="sub">
          O iPhone só entrega notificação de site quando o app está na Tela de Início. Toque no botão
          de compartilhar do Safari, escolha <strong>Adicionar à Tela de Início</strong> e abra o app
          por lá — o botão de ativar aparece.
        </p>
      </div>
    );
  }

  if (estado === 'negado') {
    return (
      <div className="card">
        <span className="eyebrow">Lembrete</span>
        <h3 className="disp">Notificação bloqueada</h3>
        <p className="sub">
          Você negou a permissão neste aparelho. Para reativar, abra as configurações do site no
          navegador e permita notificações.
        </p>
      </div>
    );
  }

  async function ativar() {
    setOcupado(true);
    setErro(null);
    try {
      const r = await ativarPush(condoId(), alvo);
      setEstado(r.estado);
      if (!r.ok && r.erro) setErro(r.erro);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha inesperada ao ativar o lembrete.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="card">
      <span className="eyebrow">Lembrete</span>
      <h3 className="disp">Quer ser avisado do prazo?</h3>
      <p className="sub">
        O aviso chega 3 dias antes do vencimento, na véspera e no dia — só se você ainda não tiver
        lançado. Nada além disso.
      </p>
      {erro && <div className="aviso erro">{erro}</div>}
      <div style={{ height: 12 }} />
      <button className="btn sec" onClick={ativar} disabled={ocupado}>
        {ocupado ? 'Ativando…' : 'Ativar lembrete neste aparelho'}
      </button>
    </div>
  );
}
