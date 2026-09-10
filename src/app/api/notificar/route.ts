import { NextResponse } from 'next/server';
import { getMessaging } from 'firebase-admin/messaging';
import { adminApp, adminAuth, adminDb } from '@/lib/firebase/admin';

const CONDO_ID = process.env.NEXT_PUBLIC_CONDO_ID || 'roma';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function rotulo(comp: string) {
  const [a, m] = comp.split('-').map(Number);
  return `${MESES[m - 1].toUpperCase()}/${a}`;
}

function prazoDe(comp: string, prazo: { dia: number; ref: string }): Date {
  let [ano, mes] = comp.split('-').map(Number);
  if (prazo.ref === 'seguinte') { mes += 1; if (mes === 13) { mes = 1; ano += 1; } }
  return new Date(ano, mes - 1, Math.min(28, Math.max(1, prazo.dia || 5)), 23, 59, 59);
}

/**
 * Envio manual de notificação pelo síndico.
 *
 * O cron cobre a rotina, mas há situações em que o síndico precisa avisar na
 * hora — mudança de prazo, leiturista da Copasa antecipado, assembleia. O texto
 * padrão nomeia o apartamento de quem recebe, porque uma notificação genérica
 * numa tela de bloqueio cheia de avisos passa despercebida.
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
    return NextResponse.json({ erro: 'Só o síndico pode enviar notificação.' }, { status: 403 });
  }

  const { alvo = 'pendentes', competencia, mensagem } = (await req.json().catch(() => ({}))) as {
    alvo?: 'todos' | 'pendentes';
    competencia?: string;
    mensagem?: string;
  };
  if (!competencia) {
    return NextResponse.json({ erro: 'Competência não informada.' }, { status: 400 });
  }

  const condo = adminDb().doc(`condominios/${CONDO_ID}`);
  const [cfgSnap, tokens, medidores, leituras] = await Promise.all([
    condo.get(),
    condo.collection('tokens').get(),
    condo.collection('medidores').where('ativo', '==', true).get(),
    condo.collection('competencias').doc(competencia).collection('leituras').get(),
  ]);

  if (tokens.empty) {
    return NextResponse.json({
      ok: false,
      aparelhos: 0,
      diagnostico:
        'Nenhum aparelho registrado. Cada morador precisa abrir o app e tocar em "Ativar lembrete neste aparelho".',
    });
  }

  // quantos medidores faltam por unidade
  const lidos = new Set(leituras.docs.map((d) => d.id));
  const faltamPorUnidade = new Map<string, number>();
  for (const m of medidores.docs) {
    if (lidos.has(m.id)) continue;
    const u = m.data().unidadeId as string;
    faltamPorUnidade.set(u, (faltamPorUnidade.get(u) ?? 0) + 1);
  }

  const prazo = cfgSnap.data()?.prazo;
  const venc = prazo?.ativo
    ? prazoDe(competencia, prazo).toLocaleDateString('pt-BR')
    : null;

  const enviados: string[] = [];
  const falhas: Array<{ unidade: string; motivo: string }> = [];
  const mortos: string[] = [];

  await Promise.all(
    tokens.docs.map(async (t) => {
      const { unidadeId, token } = t.data() as { unidadeId: string; token: string };
      const faltam = faltamPorUnidade.get(unidadeId) ?? 0;

      // no modo "pendentes", quem já entregou não é incomodado
      if (alvo === 'pendentes' && unidadeId !== 'sindico' && faltam === 0) return;

      const ehSindico = unidadeId === 'sindico';
      const corpo =
        mensagem?.trim() ||
        (ehSindico
          ? `Leitura de ${rotulo(competencia)}${venc ? `. Prazo: ${venc}` : ''}.`
          : `Realizar a leitura da água do apto ${unidadeId}` +
            (faltam ? ` — faltam ${faltam} hidrômetro${faltam > 1 ? 's' : ''}` : '') +
            (venc ? `. Prazo: ${venc}` : '') +
            '.');

      try {
        await getMessaging(adminApp()).send({
          token,
          notification: { title: `Leitura da água — ${rotulo(competencia)}`, body: corpo },
          webpush: {
            fcmOptions: { link: `/leitura?comp=${competencia}` },
            notification: { icon: '/icone-192.png', tag: `leitura-${competencia}` },
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

  await Promise.all(mortos.map((id) => condo.collection('tokens').doc(id).delete()));

  return NextResponse.json({
    ok: enviados.length > 0,
    aparelhos: tokens.size,
    enviados,
    falhas,
    tokensRemovidos: mortos.length,
    diagnostico: enviados.length
      ? `Enviado para ${enviados.length} aparelho(s): ${[...new Set(enviados)].map((u) => (u === 'sindico' ? 'você' : `apto ${u}`)).join(', ')}.`
      : alvo === 'pendentes'
        ? 'Ninguém pendente tem aparelho registrado — ou todos já entregaram a leitura.'
        : `Nenhum envio deu certo. Motivos: ${falhas.map((f) => f.motivo).join(', ')}.`,
  });
}
