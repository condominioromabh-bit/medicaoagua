'use client';

import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { condoId, getDb } from './firebase/client';
import type { Tarifa, RegraDiferenca } from './calculo';
import { compAtual, compSeguinte } from './formato';

export interface Prazo { ativo: boolean; dia: number; ref: 'seguinte' | 'mesmo' }
export interface Cfg { nome: string; prazo: Prazo; tarifa: Tarifa }
export interface Unidade { id: string; numero: string; qtdMedidores: number; ativo: boolean }
export interface Medidor {
  id: string; unidadeId: string; rotulo: string; ordem: number;
  leituraInicial: number; ativo: boolean;
}
export interface ContaDoc {
  valorTotal: number; consumoM3: number; vencimento: string;
  dataLeitura: string; numero: string; regra: RegraDiferenca;
}
export interface Competencia {
  id: string; status: 'aberta' | 'fechada'; conta: ContaDoc;
  fechadoEm?: string; totais?: Record<string, number>;
}
export interface Leitura {
  valor: number; unidadeId: string; temFoto?: boolean;
  enviadoEm: string; enviadoPor: string; corrigidoPeloSindico?: boolean;
}
export interface ItemFechado {
  unidadeId: string; consumo: number; estimado: boolean;
  tarifado: number; parcelaComum: number; valor: number;
}

export const CONTA_VAZIA: ContaDoc = {
  valorTotal: 0, consumoM3: 0, vencimento: '', dataLeitura: '', numero: '', regra: 'igual',
};

const condo = () => doc(getDb(), 'condominios', condoId());

export interface Base {
  cfg: Cfg;
  unidades: Unidade[];
  medidores: Medidor[];
  competencias: Competencia[];
}

export async function carregarBase(): Promise<Base> {
  const [cfgSnap, uSnap, mSnap, cSnap] = await Promise.all([
    getDoc(condo()),
    getDocs(query(collection(condo(), 'unidades'), orderBy('numero'))),
    getDocs(query(collection(condo(), 'medidores'), orderBy('ordem'))),
    getDocs(collection(condo(), 'competencias')),
  ]);
  if (!cfgSnap.exists()) throw new Error('Condomínio não encontrado. Rode /api/seed primeiro.');

  const competencias = cSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Competencia, 'id'>) }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    cfg: cfgSnap.data() as Cfg,
    unidades: uSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Unidade, 'id'>) })).filter((u) => u.ativo),
    medidores: mSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Medidor, 'id'>) })).filter((m) => m.ativo),
    competencias,
  };
}

export async function carregarLeituras(comp: string): Promise<Record<string, Leitura>> {
  const snap = await getDocs(collection(condo(), 'competencias', comp, 'leituras'));
  const out: Record<string, Leitura> = {};
  snap.docs.forEach((d) => { out[d.id] = d.data() as Leitura; });
  return out;
}

/** Carrega as leituras de várias competências de uma vez, para o histórico. */
export async function carregarHistorico(comps: string[]): Promise<Record<string, Record<string, number>>> {
  const out: Record<string, Record<string, number>> = {};
  await Promise.all(
    comps.map(async (c) => {
      const l = await carregarLeituras(c);
      out[c] = Object.fromEntries(Object.entries(l).map(([k, v]) => [k, v.valor]));
    }),
  );
  return out;
}

export async function carregarItensFechados(comp: string): Promise<ItemFechado[]> {
  const snap = await getDocs(collection(condo(), 'competencias', comp, 'itens'));
  return snap.docs.map((d) => d.data() as ItemFechado);
}

/** Teto de segurança: documento do Firestore não passa de 1 MiB. */
export const LIMITE_FOTO_BYTES = 700 * 1024;

/**
 * Grava as leituras de um apartamento.
 *
 * Um documento por medidor: envios simultâneos de moradores diferentes não
 * colidem. A foto vai numa subcoleção separada — assim carregar as leituras do
 * mês não arrasta megabytes de imagem junto, só o campo `temFoto`.
 */
export async function salvarLeituras(
  comp: string,
  unidadeId: string,
  valores: Record<string, number>,
  fotos: Record<string, string>,
  uid: string,
  peloSindico = false,
) {
  for (const [medidorId, dataUrl] of Object.entries(fotos)) {
    if (dataUrl.length > LIMITE_FOTO_BYTES) {
      throw new Error(`A foto do medidor ${medidorId} ficou grande demais. Tire outra com menos detalhe de fundo.`);
    }
  }

  const batch = writeBatch(getDb());
  for (const [medidorId, valor] of Object.entries(valores)) {
    const dados: Leitura = {
      valor,
      unidadeId,
      enviadoEm: new Date().toISOString(),
      enviadoPor: uid,
      ...(fotos[medidorId] ? { temFoto: true } : {}),
      ...(peloSindico ? { corrigidoPeloSindico: true } : {}),
    };
    batch.set(doc(condo(), 'competencias', comp, 'leituras', medidorId), dados, { merge: true });
  }
  for (const [medidorId, dataUrl] of Object.entries(fotos)) {
    batch.set(doc(condo(), 'competencias', comp, 'fotos', medidorId), {
      unidadeId,
      imagem: dataUrl,
      enviadoEm: new Date().toISOString(),
    });
  }
  await batch.commit();
}

/** Busca a foto sob demanda. Nunca vem junto com a lista de leituras. */
export async function carregarFoto(comp: string, medidorId: string): Promise<string | null> {
  const s = await getDoc(doc(condo(), 'competencias', comp, 'fotos', medidorId));
  return s.exists() ? (s.data().imagem as string) : null;
}

export async function salvarConta(comp: string, conta: ContaDoc) {
  await setDoc(doc(condo(), 'competencias', comp), { conta }, { merge: true });
}

/**
 * Grava a leitura de partida de cada medidor.
 *
 * Serve só para o primeiro fechamento: depois dele, a leitura anterior vem
 * sempre da competência fechada, e este valor deixa de ser consultado.
 */
export async function salvarLeiturasIniciais(valores: Record<string, number>) {
  const batch = writeBatch(getDb());
  for (const [medidorId, leituraInicial] of Object.entries(valores)) {
    batch.set(doc(condo(), 'medidores', medidorId), { leituraInicial }, { merge: true });
  }
  await batch.commit();
}

export async function salvarTarifa(tarifa: Tarifa) {
  await updateDoc(condo(), { tarifa });
}

export async function salvarPrazo(prazo: Prazo) {
  await updateDoc(condo(), { prazo });
}

/** Cria a competência se ela ainda não existir. Idempotente. */
export async function garantirCompetencia(comp: string) {
  const r = doc(condo(), 'competencias', comp);
  const s = await getDoc(r);
  if (!s.exists()) {
    await setDoc(r, { status: 'aberta', conta: CONTA_VAZIA, criadoEm: new Date().toISOString() });
  }
}

/**
 * Competências que aparecem no seletor: do primeiro registro até o mês corrente,
 * sem buracos. Um mês só sai da lista de abertas quando o síndico fecha.
 */
export function listaCompetencias(competencias: Competencia[]): string[] {
  const hoje = compAtual();
  const marcos = competencias.map((c) => c.id).sort();
  let c = marcos.length ? marcos[0] : hoje;
  if (c > hoje) c = hoje;
  const out: string[] = [];
  let guarda = 0;
  while (c <= hoje && guarda++ < 24) { out.push(c); c = compSeguinte(c); }
  return out.slice(-6);
}

export function estaAberta(competencias: Competencia[], comp: string): boolean {
  const c = competencias.find((x) => x.id === comp);
  return !c || c.status === 'aberta';
}

/** Reduz a foto antes de subir: 45 fotos por mês não podem virar 45 MB. */
export function comprimirFoto(file: File): Promise<string> {
  return new Promise((ok, err) => {
    const fr = new FileReader();
    fr.onerror = () => err(new Error('não foi possível ler o arquivo'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => err(new Error('arquivo não é uma imagem válida'));
      img.onload = () => {
        const max = 640;
        const r = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * r);
        cv.height = Math.round(img.height * r);
        cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
        ok(cv.toDataURL('image/jpeg', 0.5));
      };
      img.src = fr.result as string;
    };
    fr.readAsDataURL(file);
  });
}
