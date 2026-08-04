'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/contexto';
import Carregando from '@/components/Carregando';

export default function Inicio() {
  const { carregando, sessao } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (carregando) return;
    if (!sessao) router.replace('/entrar');
    else if (sessao.papel === 'sindico') router.replace('/sindico');
    else router.replace('/leitura');
  }, [carregando, sessao, router]);

  return <Carregando texto="Abrindo…" />;
}
