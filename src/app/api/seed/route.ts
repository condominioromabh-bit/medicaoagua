import { NextResponse } from 'next/server';
import { randomInt } from 'node:crypto';
import { adminDb } from '@/lib/firebase/admin';
import { hashCodigo } from '@/lib/codigos';

const CONDO_ID = process.env.NEXT_PUBLIC_CONDO_ID || 'roma';

/** Condomínio ROMA: 6 apartamentos, 45 hidrômetros. */
const UNIDADES: Array<[string, number]> = [
  ['101', 8], ['102', 6],
  ['201', 7], ['202', 6],
  ['301', 8], ['302', 10],
];

/** Tabela de 2025. PRECISA ser atualizada antes do primeiro fechamento. */
const TARIFA_2025 = {
  fixaAgua: 22.6,
  fixaEsgoto: 16.71,
  faixas: [
    { ate: 5, agua: 2.34, esgoto: 1.73 },
    { ate: 10, agua: 4.987, esgoto: 3.69 },
    { ate: 15, agua: 7.727, esgoto: 5.718 },
    { ate: 20, agua: 10.549, esgoto: 7.806 },
    { ate: 40, agua: 13.418, esgoto: 9.929 },
    { ate: null, agua: 13.418, esgoto: 9.929 },
  ],
};

/** Código de 6 caracteres sem letras ambíguas (O/0, I/1). */
function gerarCodigo(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => alfabeto[randomInt(alfabeto.length)]).join('');
}

export async function POST(req: Request) {
  const segredo = process.env.SEED_SECRET;
  if (!segredo) {
    return NextResponse.json({ erro: 'SEED_SECRET não configurado.' }, { status: 500 });
  }
  if (req.headers.get('x-seed-secret') !== segredo) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  const condo = adminDb().doc(`condominios/${CONDO_ID}`);
  if ((await condo.get()).exists) {
    return NextResponse.json(
      { erro: 'Condomínio já existe. Apague no console do Firebase se quiser recriar.' },
      { status: 409 },
    );
  }

  const senhaSindico = gerarCodigo();
  const codigos: Record<string, string> = {};
  const lote = adminDb().batch();

  lote.set(condo, {
    nome: 'Condomínio ROMA',
    prazo: { ativo: true, dia: 5, ref: 'seguinte' },
    tarifa: TARIFA_2025,
    senhaSindicoHash: hashCodigo(senhaSindico),
    criadoEm: new Date().toISOString(),
  });

  for (const [numero, qtd] of UNIDADES) {
    const codigo = gerarCodigo();
    codigos[numero] = codigo;
    lote.set(condo.collection('unidades').doc(numero), {
      numero,
      qtdMedidores: qtd,
      codigoHash: hashCodigo(codigo),
      ativo: true,
    });
    for (let i = 1; i <= qtd; i++) {
      lote.set(condo.collection('medidores').doc(`${numero}-${i}`), {
        unidadeId: numero,
        rotulo: `${numero}-${i}`,
        ordem: Number(numero) * 100 + i,
        leituraInicial: 0,
        ativo: true,
      });
    }
  }

  const hoje = new Date();
  const comp = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  lote.set(condo.collection('competencias').doc(comp), {
    status: 'aberta',
    conta: { valorTotal: 0, consumoM3: 0, vencimento: '', dataLeitura: '', numero: '', regra: 'igual' },
    criadoEm: new Date().toISOString(),
  });

  await lote.commit();

  return NextResponse.json({
    ok: true,
    aviso:
      'Anote os códigos agora — eles são guardados como hash e não podem ser recuperados depois. ' +
      'Atualize a tabela tarifária antes do primeiro fechamento: os valores são de 2025.',
    senhaSindico,
    codigos,
    medidoresCriados: UNIDADES.reduce((a, [, q]) => a + q, 0),
    competenciaAberta: comp,
  });
}
