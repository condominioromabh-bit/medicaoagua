'use client';

import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

export interface ConfigPublica {
  apiKey: string;
  authDomain: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
  vapidKey: string;
  condoId: string;
}

let cache: ConfigPublica | null = null;

/**
 * Busca a configuração no servidor.
 *
 * Preferimos as variáveis embutidas no build, que é o caminho normal e não custa
 * requisição. Se não estiverem lá — o que acontece quando são marcadas como
 * Sensitive na Vercel — caímos para /api/config, que as lê em tempo de execução.
 */
export async function carregarConfig(): Promise<ConfigPublica> {
  if (cache) return cache;

  const doBuild: ConfigPublica = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? '',
    condoId: process.env.NEXT_PUBLIC_CONDO_ID || 'roma',
  };

  if (doBuild.apiKey && doBuild.projectId && doBuild.appId) {
    cache = doBuild;
    return cache;
  }

  const r = await fetch('/api/config');
  const dados = await r.json();
  if (!r.ok) throw new Error(dados.erro ?? 'Não foi possível carregar a configuração do servidor.');
  cache = dados as ConfigPublica;
  return cache;
}

let appRef: FirebaseApp | null = null;

/** Precisa ser chamado uma vez antes de usar auth ou banco. */
export async function iniciarFirebase(): Promise<FirebaseApp> {
  if (appRef) return appRef;
  const c = await carregarConfig();
  appRef = getApps().length
    ? getApp()
    : initializeApp({
        apiKey: c.apiKey,
        authDomain: c.authDomain,
        projectId: c.projectId,
        messagingSenderId: c.messagingSenderId,
        appId: c.appId,
      });
  return appRef;
}

function exigirApp(): FirebaseApp {
  if (!appRef) {
    throw new Error('Firebase ainda não iniciado. Chame iniciarFirebase() primeiro.');
  }
  return appRef;
}

export function getFirebaseApp(): FirebaseApp {
  return exigirApp();
}
export function getAuthClient(): Auth {
  return getAuth(exigirApp());
}
export function getDb(): Firestore {
  return getFirestore(exigirApp());
}
export function condoId(): string {
  return cache?.condoId ?? 'roma';
}
export function vapidKey(): string {
  return cache?.vapidKey ?? '';
}

/** Compatibilidade com o código que já importava CONDO_ID. */
export const CONDO_ID = process.env.NEXT_PUBLIC_CONDO_ID || 'roma';
