'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/contexto';
import Aviso from '@/components/Aviso';

type Papel = 'escolher' | 'morador' | 'sindico';

const APTOS = ['101', '102', '201', '202', '301', '302'];

export default function Entrar() {
  const { sessao, entrar, carregando, erro: erroApp } = useApp();
  const router = useRouter();
  const [papel, setPapel] = useState<Papel>('escolher');
  const [apto, setApto] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!carregando && sessao) {
      router.replace(sessao.papel === 'sindico' ? '/sindico' : '/leitura');
    }
  }, [carregando, sessao, router]);

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await fetch('/api/acesso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ papel, unidadeId: apto, codigo }),
      });
      let dados: { token?: string; erro?: string };
      try {
        dados = await r.json();
      } catch {
        setErro(`O servidor respondeu de forma inesperada (código ${r.status}). Veja os logs em Vercel > Functions.`);
        return;
      }
      if (!r.ok) {
        setErro(dados.erro ?? `Não foi possível entrar (código ${r.status}).`);
        return;
      }
      await entrar(dados.token!);
      router.replace(papel === 'sindico' ? '/sindico' : '/leitura');
    } catch (e) {
      setErro(
        e instanceof Error && e.message.includes('fetch')
          ? 'Sem conexão com o servidor. Verifique a internet e tente de novo.'
          : `Falha ao entrar: ${e instanceof Error ? e.message : 'erro desconhecido'}`,
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <div className="topo">
        <div className="wrap">
          <div>
            <span className="eyebrow">Leitura mensal</span>
            <h1 className="disp">Condomínio ROMA</h1>
          </div>
        </div>
      </div>

      <div className="wrap">
        {(erro || erroApp) && <Aviso tipo="erro">{erro ?? erroApp}</Aviso>}

        {papel === 'escolher' && (
          <>
            <div className="card">
              <span className="eyebrow">Água</span>
              <h2 className="disp">Quem está entrando?</h2>
              <p className="sub">
                São 45 hidrômetros em 6 apartamentos. Cada morador lança os medidores da própria
                unidade; quando todos entregarem, o síndico fecha o mês e divide a conta.
              </p>
            </div>
            <div className="papeis">
              <button className="papel-btn" onClick={() => setPapel('morador')}>
                <span className="eyebrow">Morador</span>
                <span className="disp">Lançar meus medidores</span>
                <span className="d">Você precisa do código do seu apartamento.</span>
              </button>
              <button className="papel-btn" onClick={() => setPapel('sindico')}>
                <span className="eyebrow">Síndico</span>
                <span className="disp">Conferir e fechar</span>
                <span className="d">Acompanhar a coleta, lançar a conta e gerar o rateio.</span>
              </button>
            </div>
          </>
        )}

        {papel === 'morador' && (
          <form onSubmit={submeter}>
            <div className="card">
              <span className="eyebrow">Passo 1 de 2</span>
              <h2 className="disp">Qual é o seu apartamento?</h2>
              <div className="unid-grid">
                {APTOS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={`unid-btn${apto === a ? ' sel ok' : ''}`}
                    onClick={() => setApto(a)}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            {apto && (
              <div className="card">
                <span className="eyebrow">Passo 2 de 2 · Apto {apto}</span>
                <h2 className="disp">Código de acesso</h2>
                <p className="sub">
                  São 6 letras e números, entregues pelo síndico. Não diferencia maiúscula de
                  minúscula.
                </p>
                <div style={{ height: 14 }} />
                <label>
                  <span className="eyebrow">Código</span>
                  <input
                    type="text"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    autoCapitalize="characters"
                    autoComplete="one-time-code"
                    maxLength={12}
                    placeholder="XXXXXX"
                  />
                </label>
                <div style={{ height: 12 }} />
                <button className="btn" type="submit" disabled={enviando || !codigo}>
                  {enviando ? 'Entrando…' : 'Entrar'}
                </button>
              </div>
            )}

            <button className="btn sec" type="button" onClick={() => { setPapel('escolher'); setApto(null); }}>
              Voltar
            </button>
          </form>
        )}

        {papel === 'sindico' && (
          <form onSubmit={submeter}>
            <div className="card">
              <span className="eyebrow">Acesso restrito</span>
              <h2 className="disp">Senha do síndico</h2>
              <p className="sub">
                O painel de conferência e fechamento é só para a administração. Os moradores lançam a
                leitura sem senha.
              </p>
              <div style={{ height: 14 }} />
              <label>
                <span className="eyebrow">Senha</span>
                <input
                  type="password"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
              <div style={{ height: 12 }} />
              <button className="btn" type="submit" disabled={enviando || !codigo}>
                {enviando ? 'Entrando…' : 'Entrar'}
              </button>
            </div>
            <button className="btn sec" type="button" onClick={() => setPapel('escolher')}>
              Voltar
            </button>
          </form>
        )}

        <p className="rodape">
          Os dados são do condomínio e ficam guardados para a prestação de contas.
        </p>
      </div>
    </>
  );
}
