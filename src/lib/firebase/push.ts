'use client';

import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
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

  const userAgent = navigator.userAgent.slice(0, 200);
  const id = token.slice(-40).replace(/[^a-zA-Z0-9]/g, '');

  try {
    // O mesmo celular gera tokens diferentes no navegador e no app instalado,
    // e antes cada um recebia uma cópia da notificação. Aqui os registros
    // antigos do mesmo aparelho são removidos, deixando só o atual.
    const antigos = await getDocs(
      query(
        collection(getDb(), 'condominios', condoId, 'tokens'),
        where('unidadeId', '==', unidadeId),
      ),
    );
    await Promise.all(
      antigos.docs
        .filter((d) => d.id !== id && d.data().userAgent === userAgent)
        .map((d) => deleteDoc(d.ref)),
    );

    await setDoc(doc(getDb(), 'condominios', condoId, 'tokens', id), {
      token,
      unidadeId,
      userAgent,
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

/**
 * Notificação com o app aberto.
 *
 * O service worker só é acionado com a aba em segundo plano. Com o app na tela,
 * a mensagem cai aqui — e se ninguém escutar, ela é descartada em silêncio, que
 * era o que acontecia.
 */
export async function ouvirEmPrimeiroPlano(
  cb: (titulo: string, corpo: string) => void,
): Promise<(() => void) | undefined> {
  if (typeof window === 'undefined') return;
  if (!(await isSupported())) return;
  if (Notification.permission !== 'granted') return;
  try {
    return onMessage(getMessaging(getFirebaseApp()), (payload) => {
      const d = payload.data ?? {};
      const titulo = d.titulo ?? payload.notification?.title;
      const corpo = d.corpo ?? payload.notification?.body ?? '';
      if (titulo) cb(titulo, corpo);
    });
  } catch {
    return;
  }
}
