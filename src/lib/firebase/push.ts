'use client';

import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { doc, setDoc } from 'firebase/firestore';
import { getDb, getFirebaseApp } from './client';

export type EstadoPush =
  | 'ativo'
  | 'negado'
  | 'nao_pedido'
  | 'precisa_instalar' // iPhone sem o app na tela de início
  | 'indisponivel';

/** iOS só entrega push web quando o site foi adicionado à Tela de Início. */
function ehIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}
function estaInstalado(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // @ts-expect-error: propriedade não padrão do Safari iOS
    window.navigator.standalone === true
  );
}

export async function estadoPush(): Promise<EstadoPush> {
  if (typeof window === 'undefined') return 'indisponivel';
  if (!(await isSupported())) return 'indisponivel';
  if (ehIOS() && !estaInstalado()) return 'precisa_instalar';
  if (Notification.permission === 'granted') return 'ativo';
  if (Notification.permission === 'denied') return 'negado';
  return 'nao_pedido';
}

/**
 * Pede permissão e registra o token do aparelho.
 * Um mesmo morador pode ter vários aparelhos: guardamos um documento por token.
 */
export async function ativarPush(
  condoId: string,
  unidadeId: string,
): Promise<{ ok: boolean; estado: EstadoPush }> {
  const estado = await estadoPush();
  if (estado === 'indisponivel' || estado === 'precisa_instalar' || estado === 'negado') {
    return { ok: false, estado };
  }

  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') return { ok: false, estado: 'negado' };

  const registro = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const token = await getToken(getMessaging(getFirebaseApp()), {
    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registro,
  });
  if (!token) return { ok: false, estado: 'indisponivel' };

  // id do documento derivado do token: reativar no mesmo aparelho não duplica
  const id = token.slice(-40).replace(/[^a-zA-Z0-9]/g, '');
  await setDoc(doc(getDb(), 'condominios', condoId, 'tokens', id), {
    token,
    unidadeId,
    userAgent: navigator.userAgent.slice(0, 200),
    atualizadoEm: new Date().toISOString(),
  });

  return { ok: true, estado: 'ativo' };
}

/** Notificação com o app aberto: o SW não dispara, então mostramos na tela. */
export async function ouvirEmPrimeiroPlano(cb: (t: string, c: string) => void) {
  if (!(await isSupported())) return;
  onMessage(getMessaging(getFirebaseApp()), (payload) => {
    const n = payload.notification;
    if (n?.title) cb(n.title, n.body ?? '');
  });
}
