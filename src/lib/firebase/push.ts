'use client';

import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { doc, setDoc } from 'firebase/firestore';
import { getDb, getFirebaseApp, vapidKey } from './client';

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
): Promise<{ ok: boolean; estado: EstadoPush; erro?: string }> {
  const estado = await estadoPush();
  if (estado === 'indisponivel' || estado === 'precisa_instalar' || estado === 'negado') {
    return { ok: false, estado };
  }

  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') return { ok: false, estado: 'negado' };

  const chave = vapidKey();
  if (!chave) {
    return {
      ok: false,
      estado: 'nao_pedido',
      erro: 'A chave VAPID não está configurada no servidor. Cadastre NEXT_PUBLIC_FIREBASE_VAPID_KEY na Vercel.',
    };
  }

  let registro: ServiceWorkerRegistration;
  try {
    registro = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    await navigator.serviceWorker.ready;
  } catch (e) {
    return {
      ok: false,
      estado: 'nao_pedido',
      erro: 'O service worker não pôde ser registrado: ' + (e instanceof Error ? e.message : 'erro desconhecido'),
    };
  }

  let token: string;
  try {
    token = await getToken(getMessaging(getFirebaseApp()), {
      vapidKey: chave,
      serviceWorkerRegistration: registro,
    });
  } catch (e) {
    return {
      ok: false,
      estado: 'nao_pedido',
      erro: 'O Firebase recusou gerar o token: ' + (e instanceof Error ? e.message : 'erro desconhecido'),
    };
  }
  if (!token) {
    return { ok: false, estado: 'nao_pedido', erro: 'O Firebase devolveu um token vazio.' };
  }

  // id do documento derivado do token: reativar no mesmo aparelho não duplica
  const id = token.slice(-40).replace(/[^a-zA-Z0-9]/g, '');
  try {
    await setDoc(doc(getDb(), 'condominios', condoId, 'tokens', id), {
      token,
      unidadeId,
      userAgent: navigator.userAgent.slice(0, 200),
      atualizadoEm: new Date().toISOString(),
    });
  } catch (e) {
    // era aqui que o erro sumia: a escrita falhava e o botão dizia que deu certo
    return {
      ok: false,
      estado: 'nao_pedido',
      erro:
        'O aparelho foi autorizado, mas o banco recusou salvar o registro: ' +
        (e instanceof Error ? e.message : 'erro desconhecido') +
        '. Verifique se as regras do Firestore estão atualizadas.',
    };
  }

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
