'use client';

import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/contexto';
import { compRotulo } from '@/lib/formato';

export default function Topo({ subtitulo }: { subtitulo?: string }) {
  const { base, comp, sessao, sair } = useApp();
  const router = useRouter();

  async function encerrar() {
    await sair();
    router.replace('/entrar');
  }

  return (
    <div className="topo">
      <div className="wrap">
        <div>
          <span className="eyebrow">
            {subtitulo ?? (sessao?.papel === 'sindico' ? 'Painel do síndico' : `Apto ${sessao?.unidadeId ?? ''}`)}
            {' · '}
            {compRotulo(comp)}
          </span>
          <h1 className="disp">{base?.cfg.nome ?? 'Condomínio ROMA'}</h1>
        </div>
        {sessao && (
          <button className="trocar" onClick={encerrar}>
            sair
          </button>
        )}
      </div>
    </div>
  );
}
