# Variáveis de ambiente — Condomínio ROMA

Cole estas dez em **Vercel → Settings → Environment Variables**, marcando os três
ambientes (Production, Preview, Development) em cada uma.

> **Confira cada valor contra o console do Firebase antes de salvar.** Os valores
> abaixo foram transcritos de uma captura de tela, e caracteres como `l`, `I`,
> `1`, `O` e `0` se confundem. Um erro na `apiKey` quebra o app sem mensagem
> clara. Use o botão de copiar do console.

## Públicas — já preenchidas

```
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAZrKYkNn6JZsFx5muTa5rn4ljqmryvwR8
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=condominio-roma.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=condominio-roma
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=781094906729
NEXT_PUBLIC_FIREBASE_APP_ID=1:781094906729:web:c156aa082ac1a136d22bf8
NEXT_PUBLIC_FIREBASE_VAPID_KEY=BKMUxnlAwqCrQ2H402U4aCW-E1JjM9wf3xoonfxBjVAMbQYcPIL4RxJJdUdMiZSW_rLS0NXu_T9dGfY524sqEYc
NEXT_PUBLIC_CONDO_ID=roma
```

## Segredas — você preenche, sem passar por ninguém

### FIREBASE_SERVICE_ACCOUNT

Firebase Console → engrenagem → Configurações do projeto → aba **Contas de
serviço** → **Gerar nova chave privada**. Baixa um `.json`.

Guarde esse arquivo **fora da pasta do repositório**. Ele dá controle total do
projeto.

Transforme em uma linha só:

```bash
node -e "console.log(JSON.stringify(require('/caminho/completo/da/chave.json')))"
```

Copie a saída inteira — começa com `{"type":"service_account"...` — e cole na
variável.

### SAL_CODIGOS, SEED_SECRET e CRON_SECRET

Gere as três no seu computador:

```bash
node -e "for (const n of ['SAL_CODIGOS','SEED_SECRET','CRON_SECRET']) console.log(n + '=' + require('crypto').randomBytes(24).toString('base64url'))"
```

Cole a saída direto na Vercel.

**O `SAL_CODIGOS` é definitivo.** Ele entra no hash dos códigos de acesso.
Trocá-lo depois invalida a senha do síndico e os seis códigos de uma vez, sem
recuperação — o único caminho seria apagar o condomínio e recriar. Defina antes
de rodar o seed e nunca mais toque.

O `SEED_SECRET` pode ser apagado da Vercel depois que o condomínio for criado.

## Para rodar na sua máquina (opcional)

Crie um arquivo `.env.local` na raiz do projeto com as mesmas dez variáveis. Ele
já está no `.gitignore` e nunca vai para o GitHub.
