import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { fecharCompetencia } from '@/lib/calculo';
import type { Conta, Tarifa, UnidadeEntrada } from '@/lib/calculo';

const CONDO_ID = process.env.NEXT_PUBLIC_CONDO_ID || 'roma';

/**
 * Fecha uma competência.
 *
 * O cálculo roda no servidor, não no navegador: os valores congelados viram
 * cobrança, e ninguém deve conseguir alterá-los editando o cliente. As regras
 * do Firestore bloqueiam escrita na coleção `itens` para todo mundo — só o SDK
 * admin passa.
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization') || '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!idToken) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  let claims;
  try {
    claims = await adminAuth().verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 });
  }
  if (claims.role !== 'sindico' || claims.condoId !== CONDO_ID) {
    return NextResponse.json({ erro: 'Só o síndico pode fechar o mês.' }, { status: 403 });
  }

  const { competencia } = (await req.json()) as { competencia?: string };
  if (!competencia) return NextResponse.json({ erro: 'Competência não informada.' }, { status: 400 });

  const condo = adminDb().doc(`condominios/${CONDO_ID}`);
  const compRef = condo.collection('competencias').doc(competencia);

  const [cfgSnap, compSnap, uSnap, mSnap, lSnap] = await Promise.all([
    condo.get(),
    compRef.get(),
    condo.collection('unidades').where('ativo', '==', true).get(),
    condo.collection('medidores').where('ativo', '==', true).get(),
    compRef.collection('leituras').get(),
  ]);

  if (!compSnap.exists) return NextResponse.json({ erro: 'Competência não encontrada.' }, { status: 404 });
  if (compSnap.data()?.status === 'fechada') {
    return NextResponse.json({ erro: 'Esta competência já está fechada.' }, { status: 409 });
  }

  // não deixa fechar fora de sequência: a leitura anterior do mês seguinte
  // depende deste mês estar consolidado
  const anteriores = await condo
    .collection('competencias')
    .where('status', '==', 'aberta')
    .get();
  const pendenteAntes = anteriores.docs.map((d) => d.id).filter((id) => id < competencia).sort();
  if (pendenteAntes.length) {
    return NextResponse.json(
      { erro: `Feche ${pendenteAntes[0]} antes — fechar fora de ordem quebra a leitura anterior do mês seguinte.` },
      { status: 409 },
    );
  }

  const tarifa = cfgSnap.data()?.tarifa as Tarifa;
  const conta = compSnap.data()?.conta as Conta;

  // leitura anterior: última competência fechada que tenha o medidor
  const fechadas = (await condo.collection('competencias').where('status', '==', 'fechada').get()).docs
    .map((d) => d.id)
    .filter((id) => id < competencia)
    .sort();
  const anterior = fechadas.length ? fechadas[fechadas.length - 1] : null;
  const leiturasAnteriores: Record<string, number> = {};
  if (anterior) {
    const snap = await condo.collection('competencias').doc(anterior).collection('leituras').get();
    snap.docs.forEach((d) => { leiturasAnteriores[d.id] = d.data().valor; });
  }

  const atuais: Record<string, number> = {};
  lSnap.docs.forEach((d) => { atuais[d.id] = d.data().valor; });

  const unidades: UnidadeEntrada[] = uSnap.docs.map((u) => ({
    id: u.id,
    medidores: mSnap.docs
      .filter((m) => m.data().unidadeId === u.id)
      .sort((a, b) => a.data().ordem - b.data().ordem)
      .map((m) => ({
        medidorId: m.id,
        rotulo: m.data().rotulo,
        anterior: leiturasAnteriores[m.id] ?? m.data().leituraInicial ?? 0,
        atual: atuais[m.id] ?? null,
      })),
  }));

  const resultado = fecharCompetencia(unidades, conta, tarifa);

  const lote = adminDb().batch();
  for (const item of resultado.itens) {
    lote.set(compRef.collection('itens').doc(item.unidadeId), {
      unidadeId: item.unidadeId,
      consumo: item.consumo,
      estimado: item.estimado,
      tarifado: item.tarifado,
      parcelaComum: item.parcelaComum,
      valor: item.valor,
      percentual: item.percentual,
      inconsistencias: item.inconsistencias,
    });
  }
  lote.update(compRef, {
    status: 'fechada',
    fechadoEm: new Date().toISOString(),
    tarifaUsada: tarifa,
    totais: {
      somaConsumo: resultado.somaConsumo,
      somaTarifada: resultado.somaTarifada,
      diferencaM3: resultado.diferencaM3,
      diferencaRS: resultado.diferencaRS,
      totalCobrado: resultado.totalCobrado,
      aoCondominio: resultado.aoCondominio,
    },
  });
  await lote.commit();

  return NextResponse.json({ ok: true, resultado });
}
