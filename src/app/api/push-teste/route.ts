import { NextResponse } from 'next/server';
import { getMessaging } from 'firebase-admin/messaging';
import { adminApp, adminAuth, adminDb } from '@/lib/firebase/admin';

const CONDO_ID = process.env.NEXT_PUBLIC_CONDO_ID || 'roma';

/**
 * Diagnóstico e disparo manual de notificação.
 *
 * O cron roda uma vez por dia, o que torna qualquer teste lento e difícil de
 * depurar. Aqui o síndico vê o estado real — quantos aparelhos registrados,
 * quais unidades, se o envio funciona — e dispara na hora.
 */
export async function POST(req: Request) {
  const idToken = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!idToken) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  let claims;
  try {
    claims = await adminAuth().verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 });
  }
  if (claims.role !== 'sindico' || claims.condoId !== CONDO_ID) {
    return NextResponse.json({ erro: 'Só o síndico pode disparar o teste.' }, { status: 403 });
  }

  const condo = adminDb().doc(`condominios/${CONDO_ID}`);
  const tokens = await condo.collection('tokens').get();

  if (tokens.empty) {
    return NextResponse.json({
      ok: false,
      aparelhos: 0,
      diagnostico:
        'Nenhum aparelho registrado. Sem isso não há para onde enviar. Cada morador precisa abrir o app e tocar em "Ativar lembrete neste aparelho" — inclusive você. No iPhone, só funciona depois de adicionar o app à Tela de Início.',
    });
  }

  const enviados: string[] = [];
  const falhas: Array<{ unidade: string; motivo: string }> = [];
  const mortos: string[] = [];

  await Promise.all(
    tokens.docs.map(async (t) => {
      const { unidadeId, token } = t.data() as { unidadeId: string; token: string };
      try {
        await getMessaging(adminApp()).send({
          token,
          notification: {
            title: 'Teste de notificação',
            body: 'Se você está lendo isto, o lembrete de prazo vai funcionar.',
          },
          webpush: {
            fcmOptions: { link: '/leitura' },
            notification: { icon: '/icone-192.png', tag: 'teste' },
          },
        });
        enviados.push(unidadeId);
      } catch (e) {
        const codigo = (e as { code?: string }).code ?? 'desconhecido';
        falhas.push({ unidade: unidadeId, motivo: codigo });
        if (
          codigo === 'messaging/registration-token-not-registered' ||
          codigo === 'messaging/invalid-argument'
        ) {
          mortos.push(t.id);
        }
      }
    }),
  );

  // limpa tokens de aparelhos que desinstalaram o app ou revogaram a permissão
  await Promise.all(mortos.map((id) => condo.collection('tokens').doc(id).delete()));

  return NextResponse.json({
    ok: enviados.length > 0,
    aparelhos: tokens.size,
    enviados,
    falhas,
    tokensRemovidos: mortos.length,
    diagnostico: enviados.length
      ? `Enviado para ${enviados.length} aparelho(s): ${[...new Set(enviados)].map((u) => `apto ${u}`).join(', ')}. Se a notificação não aparecer, o bloqueio está no aparelho: permissão negada nas configurações do sistema, modo Não Perturbe, ou economia de bateria.`
      : `Nenhum envio deu certo. Motivos: ${falhas.map((f) => f.motivo).join(', ')}.`,
  });
}
