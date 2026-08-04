'use client';

import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

/**
 * Inicialização preguiçosa.
 *
 * Durante o build, o Next pré-renderiza as páginas no servidor, onde não há
 * navegador e as variáveis do cliente podem não estar resolvidas. Se o SDK
 * subisse no carregamento do módulo, o build quebraria com `auth/invalid-api-key`
 * antes mesmo de o app existir. Inicializar só na primeira chamada real resolve.
 */
function config() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY as string,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN as string,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID as string,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID as string,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID as string,
  };
}

export function getFirebaseApp(): FirebaseApp {
  const c = config();
  if (!c.apiKey) {
    throw new Error(
      'Configuração do Firebase ausente. Verifique se as variáveis NEXT_PUBLIC_FIREBASE_* estão cadastradas na Vercel, com Production marcado.',
    );
  }
  return getApps().length ? getApp() : initializeApp(c);
}

export function getAuthClient(): Auth {
  return getAuth(getFirebaseApp());
}

export function getDb(): Firestore {
  return getFirestore(getFirebaseApp());
}

export const CONDO_ID = process.env.NEXT_PUBLIC_CONDO_ID || 'roma';
