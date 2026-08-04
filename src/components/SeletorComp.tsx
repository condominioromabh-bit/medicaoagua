'use client';

import { useApp } from '@/lib/contexto';
import { estaAberta, listaCompetencias } from '@/lib/dados';
import { compRotulo } from '@/lib/formato';

/**
 * Troca de competência. Um mês só sai da lista de abertas quando o síndico
 * confirma o fechamento — não quando vira o calendário. Assim quem ficou
 * devendo o mês passado ainda consegue lançar.
 */
export default function SeletorComp() {
  const { base, comp, trocarComp, sessao, historico } = useApp();
  if (!base) return null;

  const comps = listaCompetencias(base.competencias);
  if (comps.length < 2) return null;

  const meus = sessao?.unidadeId
    ? base.medidores.filter((m) => m.unidadeId === sessao.unidadeId)
    : [];

  function status(c: string): { texto: string; cor: string } {
    if (!estaAberta(base!.competencias, c)) return { texto: 'fechado', cor: 'var(--fumo)' };
    if (meus.length) {
      const ok = meus.every((m) => historico[c]?.[m.id] !== undefined);
      return ok
        ? { texto: 'lançado', cor: 'var(--verde)' }
        : { texto: 'pendente', cor: 'var(--rubro)' };
    }
    const faltam = base!.unidades.filter(
      (u) => !base!.medidores.filter((m) => m.unidadeId === u.id).every((m) => historico[c]?.[m.id] !== undefined),
    ).length;
    return faltam
      ? { texto: `${faltam} pendente${faltam > 1 ? 's' : ''}`, cor: 'var(--rubro)' }
      : { texto: 'completo', cor: 'var(--verde)' };
  }

  return (
    <div className="card">
      <span className="eyebrow">Competência</span>
      <p className="sub">
        Um mês só sai da lista depois que o síndico confirma o fechamento. Se ficou pendência para
        trás, dá para lançar os dois meses.
      </p>
      <div className="unid-grid">
        {comps.map((c) => {
          const s = status(c);
          return (
            <button
              key={c}
              className={`unid-btn${c === comp ? ' sel' : ''}`}
              onClick={() => trocarComp(c)}
            >
              {compRotulo(c)}
              <small style={{ color: s.cor }}>{s.texto}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
