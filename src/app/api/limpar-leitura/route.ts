import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

const CONDO_ID = process.env.NEXT_PUBLIC_CONDO_ID || 'roma';

/**
 * Apaga a leitura de um apartamento numa competência, devolvendo-a a pendente.
 *
 * Existe porque lançar no mês errado é o engano mais comum: o morador abre o
 * app, não repara no seletor de competência e lança setembro quando devia ser
 * agosto. Sem isso, corrigir exigia apagar documento por documento no console
 * do Firebase.
 *
 * Só funciona com a competência aberta. Depois do fechamento os valores viram
 * cobrança, e apagá-los sem rastro tornaria o rateio indefensável.
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
    return NextResponse.json({ erro: 'Só o síndico pode apagar leituras.' }, { status: 403 });
  }

  const { competencia, unidadeId } = (await req.json().catch(() => ({}))) as {
    competencia?: string;
    unidadeId?: string;
  };
  if (!competencia || !unidadeId) {
    return NextResponse.json({ erro: 'Competência ou apartamento não informado.' }, { status: 400 });
  }

  const condo = adminDb().doc(`condominios/${CONDO_ID}`);
  const compRef = condo.collection('competencias').doc(competencia);
  const compSnap = await compRef.get();

  if (!compSnap.exists) {
    return NextResponse.json({ erro: 'Competência não encontrada.' }, { status: 404 });
  }
  if (compSnap.data()?.status === 'fechada') {
    return NextResponse.json(
      { erro: 'Esta competência já foi fechada. Para corrigir, é preciso um fechamento retificador.' },
      { status: 409 },
    );
  }

  const medidores = await condo.collection('medidores').where('unidadeId', '==', unidadeId).get();
  if (medidores.empty) {
    return NextResponse.json({ erro: 'Apartamento sem medidores cadastrados.' }, { status: 404 });
  }

  const lote = adminDb().batch();
  let apagadas = 0;

  for (const m of medidores.docs) {
    const leitura = compRef.collection('leituras').doc(m.id);
    if ((await leitura.get()).exists) {
      lote.delete(leitura);
      apagadas += 1;
    }
    const foto = compRef.collection('fotos').doc(m.id);
    if ((await foto.get()).exists) lote.delete(foto);
  }

  if (apagadas === 0) {
    return NextResponse.json({
      ok: true,
      apagadas: 0,
      aviso: 'Este apartamento já estava sem leitura nesta competência.',
    });
  }

  await lote.commit();

  return NextResponse.json({
    ok: true,
    apagadas,
    aviso: `${apagadas} leitura(s) do apto ${unidadeId} apagadas. Ele voltou a constar como pendente em ${competencia}.`,
  });
}
