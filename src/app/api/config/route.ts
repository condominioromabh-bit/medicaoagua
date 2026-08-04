import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Configuração pública do Firebase, servida em tempo de execução.
 *
 * As variáveis `NEXT_PUBLIC_*` normalmente são embutidas no código durante o
 * build. Isso falha quando elas estão marcadas como Sensitive na Vercel, porque
 * nesse modo só ficam disponíveis em runtime, no servidor.
 *
 * Lendo aqui e devolvendo ao navegador, o app funciona nos dois casos. Não há
 * perda de segurança: estes valores são embarcados no JavaScript de qualquer
 * app Firebase e ficam visíveis para qualquer usuário. Quem protege os dados são
 * as regras do Firestore.
 */
export async function GET() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? '',
    condoId: process.env.NEXT_PUBLIC_CONDO_ID || 'roma',
  };

  const faltando = (['apiKey', 'authDomain', 'projectId', 'appId'] as const).filter(
    (k) => !config[k],
  );

  if (faltando.length) {
    return NextResponse.json(
      {
        erro:
          'Faltam variáveis de ambiente no servidor: ' +
          faltando.map((k) => `NEXT_PUBLIC_FIREBASE_${k.replace(/([A-Z])/g, '_$1').toUpperCase()}`).join(', ') +
          '. Cadastre na Vercel com Production marcado e refaça o deploy.',
      },
      { status: 500 },
    );
  }

  return NextResponse.json(config, {
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
  });
}
