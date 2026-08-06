'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/contexto';
import Topo from '@/components/Topo';
import Aviso from '@/components/Aviso';
import Carregando from '@/components/Carregando';
import SeletorComp from '@/components/SeletorComp';
import AtivarPush from '@/components/AtivarPush';
import {
  carregarFoto, comprimirFoto, estaAberta, listaCompetencias, salvarLeituras, trocarFoto,
  type Medidor,
} from '@/lib/dados';
import { faturar } from '@/lib/calculo';
import { brl, compRotulo, dataBR, diasAtePrazo, m3, prazoDe } from '@/lib/formato';

interface Campo { m3: string; lt: string }

export default function Leitura() {
  const { carregando, erro, sessao, base, comp, leituras, historico, recarregar } = useApp();
  const router = useRouter();
  const [campos, setCampos] = useState<Record<string, Campo>>({});
  const [fotos, setFotos] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ t: 'ok' | 'erro'; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  // medidor cuja foto está aberta para conferência
  const [vendo, setVendo] = useState<{ id: string; rotulo: string; url: string } | null>(null);
  const [trocando, setTrocando] = useState<string | null>(null);

  useEffect(() => {
    if (!carregando && !sessao) router.replace('/entrar');
    if (!carregando && sessao?.papel === 'sindico') router.replace('/sindico');
  }, [carregando, sessao, router]);

  const unidadeId = sessao?.unidadeId;

  const meusMedidores = useMemo<Medidor[]>(
    () => (base && unidadeId ? base.medidores.filter((m) => m.unidadeId === unidadeId) : []),
    [base, unidadeId],
  );

  /** Leitura anterior de um medidor: última competência que tenha valor, senão a inicial. */
  const anteriorDe = useCallback(
    (med: Medidor): number => {
      const comps = Object.keys(historico).filter((c) => c < comp).sort();
      for (let i = comps.length - 1; i >= 0; i--) {
        const v = historico[comps[i]]?.[med.id];
        if (typeof v === 'number') return v;
      }
      return med.leituraInicial ?? 0;
    },
    [historico, comp],
  );

  // preenche os campos com o que já foi enviado neste mês
  useEffect(() => {
    if (!meusMedidores.length) return;
    const iniciais: Record<string, Campo> = {};
    for (const med of meusMedidores) {
      const l = leituras[med.id];
      iniciais[med.id] = l
        ? {
            m3: String(Math.floor(l.valor)).padStart(5, '0'),
            lt: String(Math.round((l.valor % 1) * 1000)).padStart(3, '0'),
          }
        : { m3: '', lt: '' };
    }
    setCampos(iniciais);
    setFotos({});
  }, [meusMedidores, leituras, comp]);

  const aberta = base ? estaAberta(base.competencias, comp) : false;

  const consumoDe = useCallback(
    (med: Medidor): number | null => {
      const c = campos[med.id];
      if (!c || c.m3 === '' || c.lt === '') return null;
      const valor = parseInt(c.m3, 10) + parseInt(c.lt.padEnd(3, '0'), 10) / 1000;
      return Math.round((valor - anteriorDe(med)) * 1000) / 1000;
    },
    [campos, anteriorDe],
  );

  const { total, completo, negativos, fotosFaltando } = useMemo(() => {
    let soma = 0;
    let faltando = 0;
    let neg = 0;
    let semFoto = 0;
    for (const med of meusMedidores) {
      if (!fotos[med.id] && !leituras[med.id]?.temFoto) semFoto++;
      const c = consumoDe(med);
      if (c === null) { faltando++; continue; }
      if (c < 0) neg++;
      soma += c;
    }
    return {
      total: Math.round(soma * 1000) / 1000,
      completo: faltando === 0 && meusMedidores.length > 0,
      negativos: neg,
      fotosFaltando: semFoto,
    };
  }, [meusMedidores, consumoDe, fotos, leituras]);

  /** Parcela de área comum do último fechamento, como referência da estimativa. */
  const referencia = useMemo(() => {
    if (!base) return null;
    const fechadas = base.competencias
      .filter((c) => c.status === 'fechada' && c.totais)
      .sort((a, b) => b.id.localeCompare(a.id));
    return fechadas.length ? fechadas[0] : null;
  }, [base]);

  const estimativa = useMemo(() => {
    if (!completo || !base) return null;
    const f = faturar(total, base.cfg.tarifa);
    return { tarifa: f.total, linhas: f.linhas };
  }, [completo, total, base]);

  function mudarCampo(medId: string, qual: 'm3' | 'lt', valor: string) {
    const limpo = valor.replace(/\D/g, '');
    setCampos((c) => ({ ...c, [medId]: { ...c[medId], [qual]: limpo } }));
    if (qual === 'm3' && limpo.length === 5) {
      document.getElementById(`lt-${medId}`)?.focus();
    }
  }

  async function escolherFoto(medId: string, file: File | undefined) {
    if (!file || !unidadeId) return;
    let url: string;
    try {
      url = await comprimirFoto(file);
    } catch {
      setMsg({ t: 'erro', texto: 'Não foi possível ler essa imagem. Tente outra foto.' });
      return;
    }

    // leitura ainda não enviada: guarda na memória e sobe junto no envio
    if (!leituras[medId]) {
      setFotos((f) => ({ ...f, [medId]: url }));
      setMsg(null);
      return;
    }

    // leitura já enviada: grava a troca na hora, sem reenviar o apartamento
    setTrocando(medId);
    try {
      await trocarFoto(comp, medId, unidadeId, url);
      setFotos((f) => ({ ...f, [medId]: url }));
      setVendo(null);
      await recarregar();
      const rot = meusMedidores.find((m) => m.id === medId)?.rotulo ?? medId;
      setMsg({ t: 'ok', texto: `Foto do medidor ${rot} substituída.` });
    } catch (e) {
      setMsg({
        t: 'erro',
        texto:
          e instanceof Error && e.message.includes('grande')
            ? e.message
            : 'Não foi possível trocar a foto. Se o mês já foi fechado, ela não pode mais ser alterada.',
      });
    } finally {
      setTrocando(null);
    }
  }

  async function verFoto(medId: string, rotulo: string) {
    const local = fotos[medId];
    if (local) {
      setVendo({ id: medId, rotulo, url: local });
      return;
    }
    try {
      const img = await carregarFoto(comp, medId);
      if (img) setVendo({ id: medId, rotulo, url: img });
      else setMsg({ t: 'erro', texto: 'Foto não encontrada. Anexe uma nova.' });
    } catch {
      setMsg({ t: 'erro', texto: 'Não foi possível carregar a foto agora.' });
    }
  }

  async function enviar() {
    if (!base || !unidadeId || !sessao) return;
    const problemas: string[] = [];
    const valores: Record<string, number> = {};

    const semFoto: string[] = [];

    for (const med of meusMedidores) {
      const c = campos[med.id];
      if (!c || c.m3 === '' || c.lt === '') {
        problemas.push(`O medidor ${med.rotulo} está em branco.`);
        continue;
      }
      const valor = Math.round((parseInt(c.m3, 10) + parseInt(c.lt.padEnd(3, '0'), 10) / 1000) * 1000) / 1000;
      const ant = anteriorDe(med);
      if (valor < ant) {
        problemas.push(`O medidor ${med.rotulo} está menor que a leitura anterior (${m3(ant)}).`);
      }
      valores[med.id] = valor;

      // a foto é o que comprova a leitura na hora do fechamento
      if (!fotos[med.id] && !leituras[med.id]?.temFoto) semFoto.push(med.rotulo);
    }

    if (semFoto.length) {
      problemas.push(
        `Falta a foto de ${semFoto.length} medidor(es): ${semFoto.join(', ')}. A foto é o que comprova a leitura se alguém questionar a cobrança.`,
      );
    }

    if (problemas.length) {
      setMsg({ t: 'erro', texto: problemas.join(' ') });
      return;
    }

    setEnviando(true);
    try {
      await salvarLeituras(comp, unidadeId, valores, fotos, sessao.uid);
      await recarregar();
      setMsg({
        t: 'ok',
        texto: `Leitura enviada. ${meusMedidores.length} medidores, consumo de ${m3(total)} m³ no mês.`,
      });
      setFotos({});
    } catch (e) {
      setMsg({
        t: 'erro',
        texto:
          e instanceof Error && e.message.includes('permission')
            ? 'Este mês já foi fechado pelo síndico e não aceita mais leitura.'
            : 'Não foi possível salvar agora. Verifique a conexão e toque em Enviar de novo.',
      });
    } finally {
      setEnviando(false);
    }
  }

  if (carregando) return <Carregando />;
  if (erro) return (<><Topo /><div className="wrap"><Aviso tipo="erro">{erro}</Aviso></div></>);
  if (!base || !unidadeId) return <Carregando />;

  const prazo = base.cfg.prazo;
  const dias = prazo?.ativo ? diasAtePrazo(comp, prazo) : null;
  const jaEnviou = meusMedidores.every((m) => leituras[m.id]);
  const comps = listaCompetencias(base.competencias);
  const atrasadas = comps.filter(
    (c) => c !== comp && estaAberta(base.competencias, c) && !meusMedidores.every((m) => historico[c]?.[m.id] !== undefined),
  );

  return (
    <>
      <Topo />
      <div className="wrap">
        {msg && <Aviso tipo={msg.t}>{msg.texto}</Aviso>}

        {comps.length > 1 && <SeletorComp />}

        {!aberta && (
          <Aviso tipo="info">
            <strong>{compRotulo(comp)} já foi fechado pelo síndico.</strong> Os valores estão
            congelados. Você pode consultar o histórico normalmente.
          </Aviso>
        )}

        {aberta && dias !== null && (
          <Aviso tipo={dias < 0 || dias === 0 ? 'erro' : 'info'}>
            {dias > 0 && `Prazo até ${dataBR(prazoDe(comp, prazo))} — falta${dias > 1 ? 'm' : ''} ${dias} dia${dias > 1 ? 's' : ''}.`}
            {dias === 0 && `Hoje é o último dia do prazo (${dataBR(prazoDe(comp, prazo))}).`}
            {dias < 0 && `Prazo vencido em ${dataBR(prazoDe(comp, prazo))} — ${Math.abs(dias)} dia${Math.abs(dias) > 1 ? 's' : ''} de atraso.`}
          </Aviso>
        )}

        {atrasadas.length > 0 && (
          <Aviso tipo="erro">
            <strong>Você também não lançou {atrasadas.map(compRotulo).join(' e ')}.</strong> Troque a
            competência acima e lance o outro mês — enquanto o síndico não fechar, dá tempo.
          </Aviso>
        )}

        {jaEnviou && aberta && (
          <Aviso tipo="ok">
            Este apartamento já entregou a leitura de {compRotulo(comp)}. Você ainda pode corrigir
            números ou trocar fotos até o síndico fechar o mês — toque em <strong>ver</strong> para
            conferir se cada foto ficou legível.
          </Aviso>
        )}

        <div className="card">
          <span className="eyebrow">
            Apto {unidadeId} · {meusMedidores.length} hidrômetros
          </span>
          <h2 className="disp">Copie os números de cada medidor</h2>
          <p className="sub">
            O campo preto são os m³ inteiros; o vermelho são os litros. Se o seu mostrador tiver
            menos casas vermelhas, complete com zeros à direita. <strong>Cada medidor precisa de uma
            foto do mostrador</strong> — é o que comprova a leitura no fechamento.
          </p>
          <div className="legenda-visor">
            <span>preto · m³</span>
            <span className="r">vermelho · litros</span>
          </div>

          <div style={{ height: 14 }} />
          <div className="placas">
            {meusMedidores.map((med) => {
              const c = campos[med.id] ?? { m3: '', lt: '' };
              const consumo = consumoDe(med);
              const classe = consumo === null ? '' : consumo < 0 ? ' ruim' : ' feito';
              const temFoto = !!fotos[med.id] || !!leituras[med.id]?.temFoto;
              return (
                <div key={med.id} className={`placa${classe}`}>
                  <div className="placa-topo">
                    <span className="placa-id">{med.rotulo}</span>
                    <span className="placa-ant">ant. {m3(anteriorDe(med))}</span>
                  </div>
                  <div className="visor">
                    <input
                      className="m3"
                      type="text"
                      inputMode="numeric"
                      maxLength={5}
                      placeholder="00000"
                      value={c.m3}
                      disabled={!aberta}
                      aria-label={`Metros cúbicos do medidor ${med.rotulo}`}
                      onChange={(e) => mudarCampo(med.id, 'm3', e.target.value)}
                    />
                    <span className="pt">,</span>
                    <input
                      id={`lt-${med.id}`}
                      className="lt"
                      type="text"
                      inputMode="numeric"
                      maxLength={3}
                      placeholder="000"
                      value={c.lt}
                      disabled={!aberta}
                      aria-label={`Litros do medidor ${med.rotulo}`}
                      onChange={(e) => mudarCampo(med.id, 'lt', e.target.value)}
                    />
                  </div>
                  <div className="placa-pe">
                    <span className="cons">
                      {consumo === null ? '—' : consumo < 0 ? 'verificar' : `${m3(consumo)} m³`}
                    </span>
                    <span style={{ display: 'flex', gap: 6 }}>
                      {temFoto && (
                        <button
                          className="cam"
                          type="button"
                          onClick={() => verFoto(med.id, med.rotulo)}
                        >
                          ver
                        </button>
                      )}
                      <label className={`cam${temFoto ? ' tem' : ''}`}>
                        {trocando === med.id ? 'salvando…' : temFoto ? 'trocar' : '+ foto'}
                        <input
                          type="file"
                          accept="image/*"
                          disabled={!aberta || trocando !== null}
                          style={{ display: 'none' }}
                          onChange={(e) => escolherFoto(med.id, e.target.files?.[0])}
                        />
                      </label>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ height: 16 }} />
          <div className="kpis">
            <div className="kpi">
              <span className="eyebrow">Consumo do apartamento</span>
              <strong>{completo ? `${m3(total)} m³` : '—'}</strong>
              <small>
                {completo
                  ? `todos os ${meusMedidores.length} medidores lançados`
                  : 'preencha todos os medidores'}
              </small>
            </div>
            <div className="kpi">
              <span className="eyebrow">Fotos</span>
              <strong style={fotosFaltando ? { color: 'var(--rubro)' } : undefined}>
                {meusMedidores.length - fotosFaltando}/{meusMedidores.length}
              </strong>
              <small>{fotosFaltando ? 'obrigatórias para enviar' : 'todas anexadas'}</small>
            </div>
            <div className="kpi">
              <span className="eyebrow">Tarifa do seu consumo</span>
              <strong>{estimativa ? brl(estimativa.tarifa) : '—'}</strong>
              <small>pela tabela da Copasa</small>
            </div>
            <div className="kpi">
              <span className="eyebrow">Estimativa total</span>
              <strong>
                {estimativa
                  ? brl(estimativa.tarifa + (referencia?.totais?.diferencaRS ?? 0) / 6)
                  : '—'}
              </strong>
              <small>
                {referencia
                  ? `inclui área comum de ${compRotulo(referencia.id)}`
                  : 'sem área comum de referência ainda'}
              </small>
            </div>
          </div>

          <Aviso tipo="info">
            O valor final só é conhecido depois que a conta da Copasa chega. Além da tarifa do seu
            consumo, cada apartamento paga uma parte da água da área comum e das perdas do prédio —
            e essa parte muda todo mês.
          </Aviso>

          {fotosFaltando > 0 && aberta && (
            <Aviso tipo="erro">
              <strong>Faltam {fotosFaltando} foto(s).</strong> Cada hidrômetro precisa de uma foto do
              mostrador — é o que comprova a sua leitura se alguém questionar a cobrança no
              fechamento. Toque em <strong>+ foto</strong> na placa de cada medidor.
            </Aviso>
          )}

          {negativos > 0 && (
            <Aviso tipo="erro">
              {negativos} medidor(es) com leitura menor que a anterior. Confira se você copiou só os
              dígitos pretos no campo preto — os vermelhos são litros e vão no campo vermelho.
            </Aviso>
          )}

          {vendo && (
            <div className="card" style={{ borderColor: 'var(--agua)' }}>
              <span className="eyebrow">Medidor {vendo.rotulo}</span>
              <h3 className="disp">Confira se está legível</h3>
              <img className="det-foto" src={vendo.url} alt={`Hidrômetro ${vendo.rotulo}`} />
              <div style={{ height: 12 }} />
              <div className="campos">
                <label className="btn sec" style={{ textAlign: 'center', cursor: 'pointer' }}>
                  {trocando === vendo.id ? 'Salvando…' : 'Trocar esta foto'}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={!aberta || trocando !== null}
                    style={{ display: 'none' }}
                    onChange={(e) => escolherFoto(vendo.id, e.target.files?.[0])}
                  />
                </label>
                <button className="btn sec" type="button" onClick={() => setVendo(null)}>
                  Fechar
                </button>
              </div>
            </div>
          )}

          <button
            className="btn"
            onClick={enviar}
            disabled={!aberta || enviando || fotosFaltando > 0 || !completo}
          >
            {!aberta
              ? 'Mês fechado'
              : enviando
                ? 'Enviando…'
                : !completo
                  ? 'Preencha todos os medidores'
                  : fotosFaltando > 0
                    ? `Faltam ${fotosFaltando} foto(s)`
                    : 'Enviar leitura'}
          </button>
        </div>

        <AtivarPush />

        <Link className="btn sec" href="/historico">
          Ver meu histórico e conferir vazamentos
        </Link>
      </div>
    </>
  );
}
