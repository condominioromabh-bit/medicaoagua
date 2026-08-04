'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { onAuthStateChanged, signInWithCustomToken, signOut, type User } from 'firebase/auth';
import { getAuthClient } from './firebase/client';
import {
  carregarBase, carregarHistorico, carregarLeituras, garantirCompetencia,
  listaCompetencias, type Base, type Leitura,
} from './dados';
import { compAtual } from './formato';

export interface Sessao {
  uid: string;
  papel: 'morador' | 'sindico';
  unidadeId?: string;
}

interface Ctx {
  carregando: boolean;
  erro: string | null;
  sessao: Sessao | null;
  base: Base | null;
  comp: string;
  leituras: Record<string, Leitura>;
  historico: Record<string, Record<string, number>>;
  trocarComp: (c: string) => Promise<void>;
  recarregar: () => Promise<void>;
  entrar: (token: string) => Promise<void>;
  sair: () => Promise<void>;
}

const Contexto = createContext<Ctx | null>(null);

export function Provedor({ children }: { children: React.ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [base, setBase] = useState<Base | null>(null);
  const [comp, setComp] = useState(compAtual());
  const [leituras, setLeituras] = useState<Record<string, Leitura>>({});
  const [historico, setHistorico] = useState<Record<string, Record<string, number>>>({});

  const carregarTudo = useCallback(async (alvo: string) => {
    const b = await carregarBase();
    setBase(b);
    const comps = listaCompetencias(b.competencias);
    const [l, h] = await Promise.all([
      carregarLeituras(alvo),
      carregarHistorico(comps),
    ]);
    setLeituras(l);
    setHistorico({ ...h, [alvo]: Object.fromEntries(Object.entries(l).map(([k, v]) => [k, v.valor])) });
  }, []);

  useEffect(() => {
    let cancelar: (() => void) | undefined;
    try {
      cancelar = onAuthStateChanged(getAuthClient(), async (u: User | null) => {
      if (!u) {
        setSessao(null);
        setBase(null);
        setCarregando(false);
        return;
      }
      try {
        const t = await u.getIdTokenResult();
        const papel = t.claims.role === 'sindico' ? 'sindico' : 'morador';
        setSessao({
          uid: u.uid,
          papel,
          unidadeId: t.claims.unidadeId as string | undefined,
        });
        const alvo = compAtual();
        setComp(alvo);
        if (papel === 'sindico') await garantirCompetencia(alvo).catch(() => {});
        await carregarTudo(alvo);
        setErro(null);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Falha ao carregar os dados do condomínio');
      } finally {
        setCarregando(false);
      }
      });
    } catch (e) {
      // configuração ausente: mostra o motivo em vez de tela branca
      setErro(e instanceof Error ? e.message : 'Falha ao iniciar o aplicativo.');
      setCarregando(false);
    }
    return () => cancelar?.();
  }, [carregarTudo]);

  const trocarComp = useCallback(async (c: string) => {
    setCarregando(true);
    setComp(c);
    try {
      const l = await carregarLeituras(c);
      setLeituras(l);
      setHistorico((h) => ({
        ...h,
        [c]: Object.fromEntries(Object.entries(l).map(([k, v]) => [k, v.valor])),
      }));
    } finally {
      setCarregando(false);
    }
  }, []);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try { await carregarTudo(comp); } finally { setCarregando(false); }
  }, [carregarTudo, comp]);

  const entrar = useCallback(async (token: string) => {
    await signInWithCustomToken(getAuthClient(), token);
  }, []);

  const sair = useCallback(async () => {
    await signOut(getAuthClient());
    setSessao(null);
    setBase(null);
  }, []);

  const valor = useMemo<Ctx>(
    () => ({ carregando, erro, sessao, base, comp, leituras, historico, trocarComp, recarregar, entrar, sair }),
    [carregando, erro, sessao, base, comp, leituras, historico, trocarComp, recarregar, entrar, sair],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(Contexto);
  if (!c) throw new Error('useApp precisa estar dentro do Provedor');
  return c;
}
