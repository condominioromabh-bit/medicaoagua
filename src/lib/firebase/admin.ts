import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/**
 * Inicialização preguiçosa.
 *
 * Se o SDK admin subir no carregamento do módulo, o build da Vercel quebra ao
 * coletar as rotas — nessa fase as variáveis de ambiente de runtime ainda não
 * existem. Inicializar só na primeira chamada resolve.
 */
let app: App | null = null;

function credencial() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT não está cadastrada na Vercel, ou foi salva sem marcar o ambiente Production.',
    );
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(raw);
  } catch {
    // causa mais comum: copiado de editor de texto formatado, que troca
    // as aspas retas por aspas curvas
    throw new Error(
      'O conteúdo de FIREBASE_SERVICE_ACCOUNT não é um JSON válido. Abra o arquivo .json em modo texto simples (no TextEdit: Formatar > Tornar texto simples), copie tudo de novo e cole na Vercel.',
    );
  }

  if (!json.private_key || !json.client_email) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT foi colada incompleta. O conteúdo precisa começar com {"type":"service_account" e incluir private_key e client_email.',
    );
  }

  // a chave privada costuma chegar com \n escapado quando vem de variável de ambiente
  if (typeof json.private_key === 'string') {
    json.private_key = json.private_key.replace(/\\n/g, '\n');
  }
  return cert(json as never);
}

export function adminApp(): App {
  if (app) return app;
  app = getApps().length ? getApps()[0] : initializeApp({ credential: credencial() });
  return app;
}

export function adminAuth(): Auth {
  return getAuth(adminApp());
}
export function adminDb(): Firestore {
  return getFirestore(adminApp());
}
