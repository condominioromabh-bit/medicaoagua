import { NextResponse } from 'next/server';
import { randomInt } from 'node:crypto';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { hashCodigo } from '@/lib/codigos';

const CONDO_ID = process.env.NEXT_PUBLIC_CONDO_ID || 'roma';

// Sem I e O: em maiúscula se confundem com 1 e 0 quando alguém digita do papel.
const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function sufixo(n: number): string {
  return Array.from({ length: n }, () => LETRAS[randomInt(LETRAS.length)]).join('');
}

/**
 * Gera novos códigos de acesso no formato Roma_XXX.
 *
 * As letras são sorteadas justamente para que conhecer o próprio código não
 * revele o dos vizinhos. O do síndico é mais longo porque é o acesso que altera
 * leituras e confirma fechamentos — comprometer esse é comprometer a cobrança.
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
    return NextResponse.json({ erro: 'Só o síndico pode gerar códigos.' }, { status: 403 });
  }

  const { alvo } = (await req.json().catch(() => ({}))) as { alvo?: string };

  const condo = adminDb().doc(`condominios/${CONDO_ID}`);
  const unidades = await condo.collection('unidades').where('ativo', '==', true).get();
  const lote = adminDb().batch();

  const codigos: Record<string, string> = {};
  let senhaSindico: string | undefined;

  // sorteia sufixos distintos, para nenhum apartamento receber o mesmo código
  const usados = new Set<string>();
  function novoSufixo(n: number): string {
    let s = sufixo(n);
    while (usados.has(s)) s = sufixo(n);
    usados.add(s);
    return s;
  }

  if (!alvo || alvo === 'todos' || alvo === 'moradores') {
    for (const u of unidades.docs) {
      const codigo = `Roma_${novoSufixo(3)}`;
      codigos[u.id] = codigo;
      lote.update(u.ref, { codigoHash: hashCodigo(codigo) });
    }
  }

  if (!alvo || alvo === 'todos' || alvo === 'sindico') {
    senhaSindico = `Roma_${novoSufixo(5)}`;
    lote.update(condo, { senhaSindicoHash: hashCodigo(senhaSindico) });
  }

  await lote.commit();

  return NextResponse.json({
    ok: true,
    codigos,
    senhaSindico,
    aviso:
      'Os códigos antigos pararam de funcionar agora. Copie estes antes de fechar a tela — eles são guardados criptografados e não podem ser recuperados.',
  });
}
