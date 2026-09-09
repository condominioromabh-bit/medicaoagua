'use client';

import { useEffect, useState } from 'react';
import { ouvirEmPrimeiroPlano } from '@/lib/firebase/push';

/**
 * Mostra a notificação quando o app está aberto.
 *
 * O Android não exibe notificação de um app que está em primeiro plano — a
 * mensagem chega e é descartada. Era por isso que o teste feito pelo celular
 * parecia não funcionar, enquanto o mesmo teste feito pelo computador aparecia
 * normalmente. Aqui a mensagem é capturada e mostrada dentro da própria tela.
 */
export default function AvisoEmPrimeiroPlano() {
  const [aviso, setAviso] = useState<{ titulo: string; corpo: string } | null>(null);

  useEffect(() => {
    ouvirEmPrimeiroPlano((titulo, corpo) => setAviso({ titulo, corpo }));
  }, []);

  if (!aviso) return null;

  return (
    <div
      className="aviso info"
      role="status"
      style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}
    >
      <span style={{ flex: 1 }}>
        <strong>{aviso.titulo}</strong>
        <br />
        {aviso.corpo}
      </span>
      <button
        className="cam"
        onClick={() => setAviso(null)}
        aria-label="Fechar aviso"
      >
        fechar
      </button>
    </div>
  );
}
