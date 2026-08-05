# Condomínio ROMA — Rateio de Água

Aplicativo de leitura mensal dos hidrômetros e rateio da conta da Copasa.
Seis apartamentos, 45 hidrômetros individuais, área comum sem medidor próprio.

- **App:** Next.js na Vercel (PWA, funciona no celular sem instalar loja)
- **Dados:** Firestore, plano Spark gratuito
- **Fotos:** Firestore em base64, subcoleção separada
- **Notificações:** FCM, agendadas por Vercel Cron

Roda inteiramente em plano gratuito, sem cartão de crédito cadastrado em lugar
nenhum. Se a cota estourar, o serviço para até o dia seguinte em vez de gerar
cobrança.

## Como a conta é dividida

Cada apartamento é tarifado **como se fosse um cliente independente da Copasa**:
a escada progressiva de faixas é aplicada ao consumo próprio, mais a tarifa fixa
por economia. Não é rateio proporcional da conta. Esse é o método que o
condomínio já usava em planilha, e os testes reproduzem junho/2025 apartamento
por apartamento.

A soma das tarifas individuais quase nunca é igual à conta real do prédio. A
diferença é o consumo da área comum mais as perdas, e o síndico escolhe entre
dividir igualmente, ratear proporcionalmente ou lançar como despesa comum.

> **Atenção antes do primeiro fechamento:** a tabela tarifária embutida nos
> testes é a de 2025. A Arsae-MG reconstruiu a estrutura tarifária da Copasa em
> 22/01/2026 — não basta reajustar por percentual. Copie as faixas da conta
> atual e confira no simulador antes de cobrar alguém.

## Modelo de dados

```
condominios/{condoId}
  nome, prazo { ativo, dia, ref }, tarifa { fixaAgua, fixaEsgoto, faixas[] }

  unidades/{unidadeId}        numero, qtdMedidores, codigoHash, ativo
  medidores/{medidorId}       unidadeId, rotulo '301-6', ordem, leituraInicial, ativo

  competencias/{2026-07}      status 'aberta'|'fechada', conta {...}, totais {...}
    leituras/{medidorId}      valor, temFoto, enviadoPor, enviadoEm
    fotos/{medidorId}         imagem (base64), unidadeId
    itens/{unidadeId}         consumo, tarifado, parcelaComum, valor  (congelado)

  tokens/{tokenId}            unidadeId, token, userAgent
```

**Fotos vivem 6 meses.** O cron diário apaga as imagens de competências mais
antigas que isso e marca `temFoto: false` na leitura correspondente. A foto serve
para conferir e fechar o mês; passado o prazo, só ocuparia espaço. Os números —
leituras, consumos e valores cobrados — ficam guardados para sempre, que é o que
a prestação de contas exige.

**Um documento por leitura de medidor.** É o que garante que dois moradores
enviando ao mesmo tempo não sobrescrevam um ao outro — o erro clássico de quem
guarda o mês inteiro num documento só.

**Competência não fecha por virada de calendário.** Um mês só sai do ar quando o
síndico confirma o fechamento, então pendência de junho continua lançável em
julho.

## Acesso

O morador não cria conta. O síndico gera um código por apartamento; o morador
digita apartamento + código uma vez e o backend emite um custom token do Firebase
Auth com as claims `{ condoId, unidadeId }`. As regras do Firestore validam a
claim — o cliente nunca escolhe quem ele é.

O síndico entra por link mágico no e-mail e recebe `{ condoId, role: 'sindico' }`.

## Notificações

O cron da Vercel chama `/api/cron/lembretes` às 12h UTC (9h em Brasília), que verifica competências abertas,
calcula os dias até o prazo e envia push só para as unidades com medidor
pendente. Avisa em D-3, D-1, no dia, e depois de 2 em 2 dias enquanto atrasado,
parando após duas semanas. Tokens de aparelho que desinstalou são apagados
automaticamente.

**Limitação do iPhone:** push web no iOS só funciona se o morador adicionar o
app à Tela de Início. Pelo Safari normal não chega nada. O app detecta isso
(`estadoPush()` devolve `precisa_instalar`) e mostra a instrução. Na prática,
espere que parte dos moradores continue sendo cobrada pelo WhatsApp — por isso
existe também o botão "Cobrar pendentes" no painel do síndico, que abre o
WhatsApp com a mensagem pronta.

## Rodando

```bash
npm install
cp .env.example .env.local   # preencher com os dados do projeto Firebase
npm run test                 # 30 testes do motor de cálculo
npm run dev
```

## Deploy

**1. Firebase.** Crie o projeto no console, no plano Spark. Não precisa de
cartão.

**2. Regras e função.**
```bash
firebase deploy --only firestore:rules,firestore:indexes
```

**3. Chave VAPID.** Console → Project Settings → Cloud Messaging → Web Push
certificates → gerar par de chaves. Copie para `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.

**4. Service worker.** Substitua os `SUBSTITUIR` em `public/firebase-messaging-sw.js`
pela config do cliente. Ele não lê variáveis de ambiente — é servido como arquivo
estático.

**5. Vercel.** Conecte o repositório do GitHub, cadastre as variáveis do
`.env.example`. O `FIREBASE_SERVICE_ACCOUNT` é o JSON da conta de serviço em uma
linha só, e vai apenas em Production/Preview — nunca com prefixo `NEXT_PUBLIC_`.

O plano Hobby da Vercel é para uso não comercial. Ferramenta interna de
condomínio provavelmente se enquadra, mas vale ler os termos antes.

## Telas

**Morador** — `/entrar` (apartamento + código), `/leitura` (painel de placas,
uma por hidrômetro, com estimativa de valor em tempo real e ativação do
lembrete), `/historico` (série de cada medidor mês a mês e alertas de
vazamento).

**Síndico** — `/sindico`, com seis abas: Coleta (andamento, quem falta, botão de
cobrança no WhatsApp), Alertas (medidores fora do próprio padrão), Conta,
Tarifa (faixas editáveis + conferidor contra uma conta real), Fechamento
(reconciliação e confirmação) e Cadastro (prazo e unidades).

## Primeiro uso

1. Deploy feito e variáveis configuradas.
2. Defina `SEED_SECRET` na Vercel e chame uma vez:

```bash
curl -X POST https://SEU-APP.vercel.app/api/seed -H "x-seed-secret: SEU_SEGREDO"
```

Isso cria o condomínio, os 6 apartamentos, os 45 hidrômetros e a competência do
mês corrente, e devolve **a senha do síndico e os 6 códigos de acesso**. Anote na
hora: são guardados como hash e não podem ser recuperados depois. Se perder,
apague o documento no console e rode de novo.

3. Entre como síndico e atualize a tabela tarifária na aba Tarifa, conferindo
   contra uma conta real antes de fechar qualquer mês.
4. Distribua os códigos aos moradores.

## Estado atual

Tudo compilando: `npm run build` limpo, `npx tsc --noEmit` sem erros, 30 testes
passando.

O que ainda não existe: exportação automática do fechamento para o Drive, PDF de
impressão, e a leitura do hidrômetro da área comum (o medidor ainda não foi
instalado — quando for, entra como uma unidade com `tipo: 'comum'`).

## Uma nota sobre o centavo

A planilha de 2025 mostra R$ 1.442,47 como soma das tarifas de junho. O valor
correto do que se cobra é R$ 1.442,46. A planilha soma os valores sem arredondar
(1442,4656) e arredonda no fim; mas o que se cobra de cada morador é um valor em
centavos, e a soma dos centavos dá um a menos. O motor usa o valor cobrável e
distribui a sobra pelo método do maior resto, garantindo que a soma feche exata
com a conta. Há um teste cobrindo isso.
