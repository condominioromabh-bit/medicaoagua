# Instalação sem terminal — Condomínio ROMA

Tudo pelo navegador. Você não precisa instalar nada no computador, nem digitar
comando nenhum.

Tempo: cerca de 40 minutos.

Guarde à mão as duas coisas que você já tem: **o arquivo `.json` da conta de
serviço** (baixado do Firebase) e **os valores do `VARIAVEIS.md`**.

---

## Parte A — Inventar três senhas

Antes de tudo, invente três frases diferentes, longas, sem espaço. Anote num
lugar seguro. Elas não precisam ser geradas por programa nenhum — só precisam ser
longas e não óbvias.

Exemplos do formato (invente as suas, não use estas):

```
SAL_CODIGOS=roma-agua-sal-7k2m-verde-portao
SEED_SECRET=criar-condominio-roma-9x4p-inicial
CRON_SECRET=lembrete-diario-roma-3v8n-prazo
```

**O `SAL_CODIGOS` é definitivo.** Ele embaralha os códigos de acesso dos
moradores. Se for trocado depois, a senha do síndico e os seis códigos param de
funcionar todos de uma vez, sem recuperação. Escolha e nunca mais mexa.

---

## Parte B — Colocar o código no GitHub

### B.1 Descompactar

Baixe o `medicaoagua.zip` e descompacte. Vai virar uma pasta com 65 arquivos.

### B.2 Enviar pelo navegador

Abra o repositório no GitHub. Na página inicial dele, clique em **uploading an
existing file** (fica no bloco azul de instruções). Se o bloco não aparecer,
use **Add file → Upload files**.

Abra a pasta descompactada, **selecione tudo que está dentro dela** e arraste
para a área de upload do GitHub. Atenção: arraste o *conteúdo*, não a pasta em
si — senão os arquivos ficam num nível a mais e a Vercel não encontra o projeto.

Espere terminar, escreva "primeira versão" na caixa de descrição e clique em
**Commit changes**.

### B.3 Conferir dois arquivos

O upload do navegador às vezes deixa de fora arquivos que começam com ponto,
porque o sistema os esconde. Olhe a lista de arquivos no GitHub e procure por
`.gitignore`.

**Se não estiver lá**, crie: **Add file → Create new file**, nome `.gitignore`,
e cole exatamente isto:

```
node_modules/
.next/
lib/
.env
.env.local
*.log
.DS_Store
.firebase/
```

Depois **Commit changes**.

Se apareceu um `gitignore.txt` na lista, pode apagar — era só uma cópia visível
para este caso.

---

## Parte C — Publicar as regras de segurança

Isto vai direto pelo console do Firebase, sem instalar nada.

Abra o **Firestore Database** → aba **Regras**. Vai ter um texto curto que
bloqueia tudo.

Abra o arquivo `firestore.rules` da pasta descompactada num editor de texto
(Bloco de Notas no Windows, TextEdit no Mac). Selecione tudo, copie, e
**substitua** todo o conteúdo da caixa de regras do Firebase. Clique em
**Publicar**.

Este passo não é opcional: sem ele o Firestore bloqueia tudo e o app abre em
branco.

Você não precisa dos índices. As consultas do app usam um campo por vez, e esses
índices o Firestore cria sozinho.

---

## Parte D — Vercel

### D.1 Importar

Em `vercel.com`, entre com a conta do GitHub. **Add New → Project** → importe o
repositório `medicaoagua`. Ela reconhece Next.js sozinha; não mexa em nenhuma
configuração de build.

### D.2 Cadastrar as variáveis

Antes de clicar em Deploy, abra **Environment Variables**. São dez, e em cada uma
marque os três ambientes (Production, Preview, Development).

Sete estão prontas no `VARIAVEIS.md`. As outras três são as frases que você
inventou na Parte A.

A décima é o `FIREBASE_SERVICE_ACCOUNT`:

- Abra o arquivo `.json` da conta de serviço no **Bloco de Notas** (Windows) ou
  no **TextEdit** (Mac).
- No TextEdit, antes de copiar, vá em **Formatar → Tornar texto simples**. Se
  ficar em texto formatado, ele troca as aspas por aspas curvas e o valor quebra.
- Selecione tudo, copie, e cole no campo de valor da variável. Pode colar com as
  quebras de linha, funciona.

Clique em **Deploy**. Leva uns dois minutos e no fim aparece a URL, algo como
`medicaoagua.vercel.app`.

### D.3 Autorizar o domínio

Volte ao Firebase → **Authentication** → aba **Settings** → **Authorized
domains** → **Add domain** → cole o domínio da Vercel **sem o `https://`**.

Sem isso o login falha.

---

## Parte E — Criar o condomínio

Abra no navegador:

```
https://SEU-APP.vercel.app/configurar
```

Digite o `SEED_SECRET` que você inventou e clique em **Criar condomínio**.

A tela mostra a senha do síndico e os seis códigos de acesso. **Copie antes de
fechar a página** — eles são guardados criptografados e não podem ser
recuperados.

Depois disso, volte à Vercel e **apague a variável `SEED_SECRET`**. Ela já
cumpriu a função.

---

## Parte F — Antes de avisar os moradores

**Ajuste a tarifa.** Entre como síndico, aba **Tarifa**. Os valores são os de
2025 e estão desatualizados desde a revisão de janeiro de 2026. Pegue uma conta
recente da Copasa e use o conferidor no fim da página: informe consumo, valor
total e 6 economias. Ajuste as faixas até a diferença ficar abaixo de R$ 0,50.

**Faça um mês de teste.** Lance leituras inventadas nos seis apartamentos,
lance a conta, confirme o fechamento e veja o rateio. Se algo estiver errado,
você descobre sem ninguém olhando.

**Depois, mande no grupo:**

> Nosso app de leitura da água está no ar: `https://medicaoagua.vercel.app`
> O código do seu apartamento vai por mensagem privada.
> **No iPhone:** abra no Safari, toque no botão de compartilhar e escolha
> "Adicionar à Tela de Início". Sem isso o lembrete de prazo não chega.

E mande cada código em conversa individual.

---

## Quando algo dá errado

**App abre em branco** — as regras não foram publicadas (Parte C).

**"auth/unauthorized-domain" ao entrar** — falta autorizar o domínio (D.3).

**Erro ao criar o condomínio, dizendo que já existe** — o seed já rodou antes.
Se você não anotou os códigos, apague o documento `condominios/roma` no
Firestore e rode de novo.

**"FIREBASE_SERVICE_ACCOUNT não configurado"** — a variável não foi salva, ou foi
salva só num dos três ambientes.

**Erro estranho de JSON ao entrar** — o conteúdo da conta de serviço foi colado
a partir de um editor de texto formatado, que trocou as aspas. Recopie em modo
texto simples.

**Código do morador recusado** — o `SAL_CODIGOS` foi alterado depois da criação.
Não há recuperação: é preciso apagar o condomínio e criar de novo.

**Notificação não chega** — verifique se o cron aparece na aba **Cron Jobs** da
Vercel, se o morador aceitou a permissão, e se é iPhone sem o app na Tela de
Início. O lembrete só vai para quem tem medidor pendente, e apenas 3 dias antes,
1 dia antes, no dia e a cada dois dias depois de vencido.

---

## Rotina de todo mês

1. Moradores lançam as leituras; quem ativou recebe lembrete automático.
2. Perto do prazo, use **Cobrar pendentes no WhatsApp** na aba Coleta.
3. Chegou a conta da Copasa: lançar na aba **Conta**.
4. Conferir a aba **Alertas** — medidor fora do próprio padrão costuma ser
   vazamento localizado.
5. **Confirmar fechamento**. Os valores congelam.
6. Baixar o CSV e guardar com a prestação de contas.
