'use client';

import { useState } from 'react';

interface Resultado {
  senhaSindico: string;
  codigos: Record<string, string>;
  medidoresCriados: number;
  competenciaAberta: string;
}

/**
 * Configuração inicial pelo navegador.
 *
 * Substitui o `curl` para /api/seed — o síndico não precisa de terminal para
 * pôr o condomínio no ar. Continua protegida pelo SEED_SECRET, que só quem
 * cadastrou as variáveis na Vercel conhece.
 */
export default function Configurar() {
  const [segredo, setSegredo] = useState('');
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState(false);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setOcupado(true);
    try {
      const r = await fetch('/api/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-seed-secret': segredo.trim() },
      });
      const dados = await r.json();
      if (!r.ok) {
        setErro(dados.erro ?? 'Não foi possível criar o condomínio.');
        return;
      }
      setResultado(dados);
    } catch {
      setErro('Falha de conexão com o servidor.');
    } finally {
      setOcupado(false);
    }
  }

  const texto = resultado
    ? [
        'CONDOMÍNIO ROMA — ACESSOS',
        '',
        `Senha do síndico: ${resultado.senhaSindico}`,
        '',
        ...Object.entries(resultado.codigos).map(([apto, cod]) => `Apto ${apto}: ${cod}`),
      ].join('\n')
    : '';

  async function copiar() {
    await navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  return (
    <>
      <div className="topo">
        <div className="wrap">
          <div>
            <span className="eyebrow">Configuração inicial</span>
            <h1 className="disp">Condomínio ROMA</h1>
          </div>
        </div>
      </div>

      <div className="wrap">
        {!resultado && (
          <form onSubmit={criar}>
            <div className="card">
              <span className="eyebrow">Uma única vez</span>
              <h2 className="disp">Criar o condomínio</h2>
              <p className="sub">
                Isto cria os 6 apartamentos, os 45 hidrômetros e a competência do mês corrente, e
                gera a senha do síndico e os códigos de acesso dos moradores. Só funciona se o
                condomínio ainda não existir.
              </p>
              <div style={{ height: 14 }} />
              <label>
                <span className="eyebrow">SEED_SECRET</span>
                <input
                  type="password"
                  value={segredo}
                  onChange={(e) => setSegredo(e.target.value)}
                  placeholder="o valor que você cadastrou na Vercel"
                  autoComplete="off"
                />
              </label>
              <div style={{ height: 12 }} />
              <button className="btn" type="submit" disabled={ocupado || !segredo.trim()}>
                {ocupado ? 'Criando…' : 'Criar condomínio'}
              </button>
            </div>
            {erro && <div className="aviso erro">{erro}</div>}
          </form>
        )}

        {resultado && (
          <>
            <div className="aviso erro">
              <strong>Copie estes acessos agora, antes de fechar a página.</strong> Eles são
              guardados criptografados e não podem ser recuperados. Se perder, o único caminho é
              apagar o condomínio no console do Firebase e criar de novo — o que também apaga as
              leituras já lançadas.
            </div>

            <div className="card">
              <span className="eyebrow">Síndico</span>
              <h2 className="disp">Senha de administração</h2>
              <div className="visor" style={{ marginTop: 10 }}>
                <input
                  className="m3"
                  readOnly
                  value={resultado.senhaSindico}
                  style={{ flex: 1, letterSpacing: '0.2em' }}
                />
              </div>
              <p className="sub" style={{ marginTop: 10 }}>
                Guarde no gerenciador de senhas do celular, não num papel na portaria.
              </p>
            </div>

            <div className="card">
              <span className="eyebrow">Moradores</span>
              <h2 className="disp">Códigos por apartamento</h2>
              <p className="sub">
                Mande cada código em conversa individual, nunca no grupo — o código é o que
                identifica a pessoa no sistema.
              </p>
              <div style={{ height: 12 }} />
              <div className="rolagem">
                <table className="tabela">
                  <thead>
                    <tr><th>Apartamento</th><th>Código</th></tr>
                  </thead>
                  <tbody>
                    {Object.entries(resultado.codigos).map(([apto, cod]) => (
                      <tr key={apto}>
                        <td>Apto {apto}</td>
                        <td style={{ letterSpacing: '0.15em', fontWeight: 700 }}>{cod}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ height: 14 }} />
              <button className="btn" onClick={copiar}>
                {copiado ? 'Copiado' : 'Copiar tudo'}
              </button>
            </div>

            <div className="card">
              <span className="eyebrow">Agora</span>
              <h3 className="disp">Três coisas antes de avisar os moradores</h3>
              <p className="sub">
                Primeiro, apague a variável <code>SEED_SECRET</code> nas configurações da Vercel —
                ela já cumpriu a função.
                <br /><br />
                Segundo, entre como síndico e vá na aba <strong>Tarifa</strong>. Os valores são os
                de 2025 e estão desatualizados. Use o conferidor com uma conta real da Copasa até a
                diferença ficar abaixo de R$ 0,50.
                <br /><br />
                Terceiro, faça um mês de teste com números inventados e confirme o fechamento, para
                ver o rateio funcionando antes de qualquer morador acompanhar.
              </p>
              <div style={{ height: 14 }} />
              <a className="btn" href="/entrar">Ir para o aplicativo</a>
            </div>
          </>
        )}

        <p className="rodape">
          {resultado
            ? `${resultado.medidoresCriados} hidrômetros criados · competência ${resultado.competenciaAberta} aberta`
            : 'Esta página só é usada uma vez, na instalação.'}
        </p>
      </div>
    </>
  );
}
