import { NextResponse } from 'next/server';
import { getMessaging } from 'firebase-admin/messaging';
import { adminApp, adminDb } from '@/lib/firebase/admin';

const CONDO_ID = process.env.NEXT_PUBLIC_CONDO_ID || 'roma';

export const maxDuration = 60;

/**
 * Lembrete de prazo por notificação.
 *
 * No plano Spark do Firebase não há Cloud Functions, então o agendamento fica na
 * Vercel (ver `vercel.json`). O envio em si continua pelo FCM, que é gratuito em
 * qualquer plano. A Vercel dispara isto todo dia às 12h UTC, que é 9h em
 * Brasília, e assina a requisição com o CRON_SECRET.
 */

function prazoDe(competencia: string, prazo: { dia: number; ref: string }): Date {
  let [ano, mes] = competencia.split('-').map(Number);
  if (prazo.ref === 'seguinte') {
    mes += 1;
    if (mes === 13) { mes = 1; ano += 1; }
  }
  const dia = Math.min(28, Math.max(1, prazo.dia || 5));
  return new Date(ano, mes - 1, dia, 23, 59, 59);
}

function diasAte(d: Date): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - hoje.getTime()) / 86400000,
  );
}

/** Avisa em D-3, D-1, no dia, e de 2 em 2 dias enquanto atrasado. Depois para. */
function deveAvisar(dias: number): boolean {
  if (dias === 3 || dias === 1 || dias === 0) return true;
  if (dias < 0 && dias >= -14) return dias % 2 === 0;
  return false;
}

function mensagem(dias: number, competencia: string, faltam: number) {
  const [ano, mes] = competencia.split('-');
  const rot = `${mes}/${ano}`;
  const plural = faltam > 1 ? 's' : '';
  if (dias > 0) {
    return {
      title: `Leitura de ${rot}`,
      body: `Faltam ${dias} dia${dias > 1 ? 's' : ''} para o prazo. Você ainda tem ${faltam} hidrômetro${plural} para lançar.`,
    };
  }
  if (dias === 0) {
    return {
      title: 'Hoje é o último dia',
      body: `A leitura de ${rot} vence hoje. Faltam ${faltam} hidrômetro${plural}.`,
    };
  }
  return {
    title: `Leitura de ${rot} atrasada`,
    body: `O prazo venceu há ${Math.abs(dias)} dias. Sem a sua leitura, o consumo do seu apartamento é estimado pela média.`,
  };
}

export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (segredo && req.headers.get('authorization') !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  const db = adminDb();
  const condo = db.doc(`condominios/${CONDO_ID}`);
  const cfgSnap = await condo.get();
  if (!cfgSnap.exists) {
    return NextResponse.json({ erro: 'Condomínio não encontrado.' }, { status: 404 });
  }

  const prazo = cfgSnap.data()?.prazo ?? { ativo: true, dia: 5, ref: 'seguinte' };
  if (!prazo.ativo) {
    return NextResponse.json({ ok: true, motivo: 'prazo desativado no cadastro' });
  }

  const abertas = await condo.collection('competencias').where('status', '==', 'aberta').get();
  const relatorio: Array<Record<string, unknown>> = [];

  for (const comp of abertas.docs) {
    const dias = diasAte(prazoDe(comp.id, prazo));
    if (!deveAvisar(dias)) {
      relatorio.push({ competencia: comp.id, dias, acao: 'fora da janela de aviso' });
      continue;
    }

    const [medidores, leituras, tokens] = await Promise.all([
      condo.collection('medidores').where('ativo', '==', true).get(),
      comp.ref.collection('leituras').get(),
      condo.collection('tokens').get(),
    ]);

    const lidos = new Set(leituras.docs.map((d) => d.id));
    const faltamPorUnidade = new Map<string, number>();
    for (const m of medidores.docs) {
      if (lidos.has(m.id)) continue;
      const u = m.data().unidadeId as string;
      faltamPorUnidade.set(u, (faltamPorUnidade.get(u) ?? 0) + 1);
    }

    if (faltamPorUnidade.size === 0) {
      relatorio.push({ competencia: comp.id, dias, acao: 'todos entregaram' });
      continue;
    }

    const mortos: string[] = [];
    let enviados = 0;

    await Promise.all(
      tokens.docs.map(async (t) => {
        const { unidadeId, token } = t.data() as { unidadeId: string; token: string };
        const faltam = faltamPorUnidade.get(unidadeId);
        if (!faltam) return;
        const { title, body } = mensagem(dias, comp.id, faltam);
        try {
          await getMessaging(adminApp()).send({
            token,
            notification: { title, body },
            webpush: {
              fcmOptions: { link: `/leitura?comp=${comp.id}` },
              notification: { icon: '/icone-192.png', tag: `prazo-${comp.id}` },
            },
          });
          enviados += 1;
        } catch (e) {
          const codigo = (e as { code?: string }).code;
          // aparelho desinstalou o app ou revogou a permissão
          if (
            codigo === 'messaging/registration-token-not-registered' ||
            codigo === 'messaging/invalid-argument'
          ) {
            mortos.push(t.id);
          } else {
            console.warn('falha ao enviar push', t.id, codigo);
          }
        }
      }),
    );

    await Promise.all(mortos.map((id) => condo.collection('tokens').doc(id).delete()));

    relatorio.push({
      competencia: comp.id,
      dias,
      unidadesPendentes: faltamPorUnidade.size,
      enviados,
      tokensRemovidos: mortos.length,
    });
  }

  return NextResponse.json({ ok: true, relatorio });
}
