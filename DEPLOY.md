# Guia de instalação — Condomínio ROMA

Siga na ordem. O Firebase vem primeiro porque a Vercel precisa das credenciais
dele, e o GitHub no meio porque a Vercel importa o repositório.

Tempo total: cerca de 40 minutos na primeira vez.

Antes de começar, tenha instalado: **Node.js 20 ou mais novo** e **Git**. Para
conferir, abra o terminal e rode `node -v` e `git -v`.

---

## Parte 1 — Firebase

### 1.1 Criar o projeto

Acesse `console.firebase.google.com` e clique em **Criar projeto**.

- Nome: `condominio-roma`
- Google Analytics: **desative**. Não serve para nada aqui e só adiciona
  consentimento de dados para gerenciar.

### 1.2 Escolher a região — decisão permanente

Ao criar o Firestore, ele pede a localização. Escolha **southamerica-east1 (São
Paulo)**.

Isso **não pode ser alterado depois**. Trocar exige apagar o projeto e recomeçar.
São Paulo reduz a latência para os moradores e mantém os dados no Brasil, o que
simplifica a questão de LGPD.

### 1.3 Plano Spark, sem cartão

Não faça nada aqui — o projeto já nasce no plano gratuito Spark, e é nele que
este app roda. Nenhum cartão de crédito é necessário.

Isso significa que **não existe risco de conta inesperada**. Se algum dia o
volume ultrapassar a cota, o Firebase simplesmente para de responder até o dia
seguinte, em vez de gerar cobrança. Com 6 apartamentos isso não vai acontecer:
o uso previsto é de cerca de 90 escritas por mês contra uma cota de 20 mil por
dia.

Duas coisas o Spark não oferece, e ambas já estão contornadas no código:

- **Cloud Storage** — as fotos dos hidrômetros vão para o Firestore em base64,
  numa subcoleção separada. São 28 MB por ano contra 1 GiB de cota.
- **Cloud Functions** — o lembrete de prazo é disparado por Vercel Cron, e o
  envio continua pelo FCM, que é gratuito em qualquer plano.

### 1.4 Ativar os dois serviços

No menu lateral, ative um por um:

**Firestore Database** → Criar banco de dados → modo de produção → região São
Paulo. Modo de produção bloqueia tudo por padrão; as regras corretas entram na
Parte 4.

**Authentication** → Começar. Não precisa habilitar nenhum provedor de login.
O app usa custom tokens, que só exigem que o serviço esteja ativado.

### 1.5 Registrar o app web

Engrenagem → **Configurações do projeto** → role até **Seus apps** → ícone
`</>`.

- Apelido: `roma-web`
- **Não** marque Firebase Hosting (quem hospeda é a Vercel)

Ele mostra um bloco de configuração. Copie os valores — são estes que vão para as
variáveis `NEXT_PUBLIC_*`:

| No bloco do Firebase | Variável de ambiente |
|---|---|
| `apiKey` | `NEXT_PUBLIC_FIREBASE_API_KEY` |
| `authDomain` | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` |
| `projectId` | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` |
| `messagingSenderId` | `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` |
| `appId` | `NEXT_PUBLIC_FIREBASE_APP_ID` |

Essas cinco são públicas de propósito — ficam visíveis no navegador de qualquer
usuário. Quem protege os dados são as regras do Firestore, não o segredo dessas
chaves.

### 1.6 Chave VAPID, para as notificações

Ainda em Configurações do projeto → aba **Cloud Messaging** → seção
**Certificados push da Web** → **Gerar par de chaves**.

Copie a chave para `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.

### 1.7 Conta de serviço, para o servidor

Configurações do projeto → aba **Contas de serviço** → **Gerar nova chave
privada**. Baixa um arquivo `.json`.

**Esse arquivo dá controle total do projeto. Nunca coloque no Git.** O
`.gitignore` já bloqueia `.env`, mas o JSON solto na pasta não está protegido —
guarde fora do repositório.

Transforme em uma linha só para colar na Vercel:

```bash
# se tiver jq instalado
jq -c . ~/Downloads/condominio-roma-firebase-adminsdk.json

# sem jq
node -e "console.log(JSON.stringify(require('/caminho/completo/chave.json')))"
```

O resultado inteiro vai em `FIREBASE_SERVICE_ACCOUNT`.

### 1.8 Preencher o service worker

O arquivo `public/firebase-messaging-sw.js` **não lê variáveis de ambiente** —
ele é servido como arquivo estático puro. Abra no editor e substitua os cinco
`SUBSTITUIR` pelos valores do passo 1.5:

```js
firebase.initializeApp({
  apiKey: 'AIza...',
  authDomain: 'condominio-roma.firebaseapp.com',
  projectId: 'condominio-roma',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abc123',
});
```

Se esquecer deste passo, tudo funciona menos a notificação — e sem mensagem de
erro visível.

---

## Parte 2 — GitHub

### 2.1 Criar o repositório

Em `github.com/new`:

- Nome: `condominio-roma`
- **Privado**. Não é código secreto, mas evita que alguém abra um PR ou clone por
  engano.
- Não marque nada em "Initialize this repository" — o projeto já tem arquivos.

### 2.2 Enviar o código

No terminal, dentro da pasta do projeto:

```bash
cd condominio-roma
git init
git add .
git commit -m "primeira versao do rateio de agua"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/condominio-roma.git
git push -u origin main
```

Se pedir senha, o GitHub não aceita mais a senha da conta. Use um **personal
access token**: foto do perfil → Settings → Developer settings → Personal access
tokens → Tokens (classic) → Generate new token, com o escopo `repo`. O token é
usado no lugar da senha.

### 2.3 Conferir que nenhum segredo vazou

```bash
git ls-files | grep -E "\.env|adminsdk|\.json$"
```

Deve listar apenas `.env.example`, `package.json`, `tsconfig.json`,
`firebase.json`, `firestore.indexes.json` e `public/manifest.json`. Se aparecer
`.env.local` ou o JSON da conta de serviço, pare e remova antes de continuar.

---

## Parte 3 — Vercel

### 3.1 Importar

Em `vercel.com`, entre com a conta do GitHub. **Add New → Project → Import** no
`condominio-roma`.

A Vercel detecta Next.js sozinha. Não mexa em build command nem output
directory.

### 3.2 Variáveis de ambiente

Antes de clicar em Deploy, abra **Environment Variables** e cadastre todas as
dez do `.env.example`. Marque os três ambientes (Production, Preview,
Development) em cada uma.

Duas merecem cuidado:

**`SAL_CODIGOS`** — invente uma frase qualquer, por exemplo
`roma-agua-2026-xyz`. **Defina antes de rodar o seed e nunca mude.** O sal entra
no hash dos códigos; trocá-lo invalida a senha do síndico e os 6 códigos de uma
vez, sem possibilidade de recuperação.

**`SEED_SECRET`** — outra frase qualquer. Serve só para liberar a criação inicial
e pode ser apagada depois.

Clique em **Deploy**. Leva uns 2 minutos. No fim você recebe uma URL do tipo
`condominio-roma.vercel.app`.

### 3.3 Autorizar o domínio no Firebase

Volte ao Firebase Console → **Authentication** → aba **Settings** → **Authorized
domains** → **Add domain** → cole o domínio da Vercel, sem `https://`.

Sem isso o login falha com erro de domínio não autorizado.

### 3.4 Sobre os termos de uso

O plano Hobby da Vercel é para uso não comercial. Ferramenta interna de
condomínio provavelmente se enquadra, já que não há venda nem cobrança pelo
software. Vale ler os termos; se houver dúvida, o plano Pro custa 20 dólares por
mês.

---

## Parte 4 — Regras de segurança

Esta parte não passa pela Vercel — vai direto para o Firebase.

```bash
npm install -g firebase-tools
firebase login
cd condominio-roma
firebase use --add
# escolha o projeto na lista e dê o apelido "default"
```

Publique as regras de segurança:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

**Este passo não é opcional.** O Firestore em modo de produção bloqueia tudo até
as regras subirem — sem isso o app carrega em branco.

É só isso do lado do Firebase. As notificações não precisam de Cloud Functions:
o agendamento está em `vercel.json` e a Vercel chama `/api/cron/lembretes` todo
dia às 12h UTC, que é 9h em Brasília. Para conferir depois do deploy, abra o
projeto na Vercel → aba **Cron Jobs**. Dá para disparar manualmente ali para
testar sem esperar o dia seguinte.

---

## Parte 5 — Primeiro uso

### 5.1 Criar o condomínio

Uma única vez, com o segredo que você definiu:

```bash
curl -X POST https://SEU-APP.vercel.app/api/seed \
  -H "x-seed-secret: SEU_SEED_SECRET"
```

A resposta traz a senha do síndico e os 6 códigos de acesso:

```json
{
  "senhaSindico": "K7M2PQ",
  "codigos": { "101": "H3N8TR", "102": "...", ... },
  "medidoresCriados": 45
}
```

**Copie agora e guarde em lugar seguro.** São gravados como hash e não podem ser
lidos de volta. Se perder, o único caminho é apagar o documento `condominios/roma`
no console e rodar o seed de novo — o que também apaga leituras já lançadas.

Depois disso, apague `SEED_SECRET` das variáveis da Vercel.

### 5.2 Conferir a tarifa antes de cobrar alguém

Entre como síndico e vá em **Tarifa**. Os valores são os de 2025 da planilha
antiga e estão marcados com aviso vermelho.

Pegue uma conta recente da Copasa, use o conferidor no fim da página: informe o
consumo em m³, o valor total e 6 economias. Ele testa duas hipóteses de
faturamento e mostra qual bate. Ajuste as faixas até a diferença ficar abaixo de
R$ 0,50.

Só depois disso feche um mês.

### 5.3 Distribuir aos moradores

Mande no grupo algo como:

> Nosso app de leitura da água está no ar: `https://condominio-roma.vercel.app`
> O código do seu apartamento vai por mensagem privada.
> **No iPhone:** abra no Safari, toque no botão de compartilhar e escolha
> "Adicionar à Tela de Início". Sem isso o lembrete de prazo não chega.

Mande cada código em conversa individual, não no grupo.

---

## Quando algo dá errado

**Tela em branco, console com "Missing or insufficient permissions"** — as regras
não foram publicadas. Rode o deploy da Parte 4.

**"auth/unauthorized-domain" ao entrar** — falta autorizar o domínio da Vercel no
Authentication, passo 3.3.

**Login funciona mas nada carrega** — o seed não rodou, ou rodou em outro
`NEXT_PUBLIC_CONDO_ID`. Confira em Firestore se existe o documento
`condominios/roma`.

**Código correto sendo recusado** — o `SAL_CODIGOS` mudou depois do seed. Não há
recuperação; é preciso apagar o condomínio e recriar.

**Build da Vercel falhando em `FIREBASE_SERVICE_ACCOUNT`** — o JSON não está em
uma linha só, ou foi colado com aspas extras em volta. Use `jq -c`.

**Notificação não chega** — na ordem: o service worker foi preenchido (1.8)? o
cron aparece na aba Cron Jobs da Vercel? o morador aceitou a permissão? é iPhone
sem o app na Tela de Início? A função só envia para quem tem medidor pendente, e apenas em
D-3, D-1, no dia e a cada dois dias após o vencimento.

**Foto não sobe, com erro de permissão** — a imagem passou de 700 KB. O app já
comprime para cerca de 40 KB, então isso só acontece se a compressão falhar no
navegador. Peça para o morador tentar de outro aparelho.

**"Quota exceeded" no Firestore** — a cota diária do Spark estourou, o que com 6
apartamentos indica laço infinito ou alguém recarregando a página sem parar. A
cota reseta à meia-noite no fuso do Pacífico.

---

## Rotina mensal

1. Moradores lançam as leituras; quem ativou recebe o lembrete automático.
2. Perto do prazo, o síndico usa **Cobrar pendentes no WhatsApp** para quem falta.
3. Chegou a conta da Copasa: lançar na aba **Conta**.
4. Conferir a aba **Alertas** — medidor fora do próprio padrão costuma ser
   vazamento localizado.
5. **Confirmar fechamento**. Os valores congelam e o mês sai da lista de abertos.
6. Baixar o CSV e guardar junto da prestação de contas.
