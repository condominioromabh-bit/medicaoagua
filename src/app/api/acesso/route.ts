import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { hashCodigo, iguais } from '@/lib/codigos';

const CONDO_ID = process.env.NEXT_PUBLIC_CONDO_ID || 'roma';


/** Atraso fixo em toda tentativa, para tornar força bruta impraticável. */
const espera = () => new Promise((r) => setTimeout(r, 400));

export async function POST(req: Request) {
  let corpo: { papel?: string; unidadeId?: string; codigo?: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: 'Requisição inválida.' }, { status: 400 });
  }

  const { papel, unidadeId, codigo } = corpo;
  if (!codigo) {
    return NextResponse.json({ erro: 'Informe o código de acesso.' }, { status: 400 });
  }

  await espera();
  const hash = hashCodigo(codigo);

  try {
    if (papel === 'sindico') {
      const snap = await adminDb().doc(`condominios/${CONDO_ID}`).get();
      const guardado = snap.data()?.senhaSindicoHash as string | undefined;
      if (!guardado || !iguais(hash, guardado)) {
        return NextResponse.json({ erro: 'Senha incorreta.' }, { status: 401 });
      }
      const token = await adminAuth().createCustomToken(`sindico-${CONDO_ID}`, {
        condoId: CONDO_ID,
        role: 'sindico',
      });
      return NextResponse.json({ token });
    }

    if (!unidadeId) {
      return NextResponse.json({ erro: 'Escolha o apartamento.' }, { status: 400 });
    }

    const snap = await adminDb().doc(`condominios/${CONDO_ID}/unidades/${unidadeId}`).get();
    if (!snap.exists || snap.data()?.ativo === false) {
      return NextResponse.json({ erro: 'Apartamento não encontrado.' }, { status: 404 });
    }
    const guardado = snap.data()?.codigoHash as string | undefined;
    if (!guardado || !iguais(hash, guardado)) {
      return NextResponse.json(
        { erro: 'Código incorreto para este apartamento. Peça ao síndico se você não tiver o seu.' },
        { status: 401 },
      );
    }

    const token = await adminAuth().createCustomToken(`morador-${CONDO_ID}-${unidadeId}`, {
      condoId: CONDO_ID,
      unidadeId,
    });
    return NextResponse.json({ token });
  } catch (e) {
    console.error('falha no acesso', e);
    return NextResponse.json({ erro: 'Erro no servidor. Tente de novo em instantes.' }, { status: 500 });
  }
}
