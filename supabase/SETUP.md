# Passo a passo: ligar o app ao Supabase

Guia completo, do zero ate o app instalado no celular de voces tres.

Tempo: **20 a 30 minutos**. Faca no computador — varios passos sao
copiar e colar.

> **Antes de comecar:** este projeto e SEPARADO do CRM do escritorio
> (auxilio-acidente). Nao reaproveite aquele projeto Supabase. Dado de
> cliente e dado de academia no mesmo banco e problema de LGPD e de
> bagunca.

---

## Etapa 1 — Criar o projeto

1. Entre em <https://supabase.com/dashboard> com a sua conta.

2. **Crie uma organizacao pessoal antes**, se voce so tem a do
   escritorio (`Tizei, Mendonca Advogados Associados`).

   No seletor de organizacao, no alto da tela: **New organization** →
   nome `Pessoal - Igor` → plano **Free**. Leva segundos e nao custa
   nada.

   **Por que isso importa.** Projeto separado resolve o banco: nenhuma
   consulta do app alcanca dado de cliente. Mas a *organizacao* e outra
   camada — quem tem acesso a ela abre o projeto pelo painel e le as
   tabelas pelo SQL Editor. A RLS protege contra a chave publica do app,
   nao contra quem entra como dono. Alem disso, a cobranca segue a
   organizacao.

   Os dados aqui nao sao so seus: sao os da sua esposa e os do seu
   personal. Se voce e o unico membro da organizacao do escritorio, o
   risco pratico e zero e isto e so arrumacao. Se houver socio, contador
   ou TI, nao coloque o app la.

3. Clique em **New project**.

4. Preencha:

   | Campo | O que por |
   |---|---|
   | **Organization** | `Pessoal - Igor` (nao a do escritorio) |
   | **Project name** | `APP - TREINOS` |
   | **Database Password** | clique em *Generate a password* e **salve no seu gerenciador de senhas** |
   | **Region** | `South America (São Paulo)` |
   | **Pricing Plan** | `Free` |

   **GitHub (optional):** deixe em branco. Essa integracao publica o
   schema a partir do repositorio, e espera migrations no padrao do
   Supabase CLI (nome com timestamp + `config.toml`). As nossas nao
   seguem esse padrao, e voce vai rodar as migrations uma unica vez —
   automatizar isso resolveria um problema que voce nao tem.

5. Na secao **Security**, deixe assim:

   | Opcao | Valor | Por que |
   |---|---|---|
   | **Enable Data API** | ✅ **ligado** | e por aqui que o app fala com o banco (supabase-js). Desligado, nada funciona |
   | **Automatically expose new tables** | ☐ **desligado** | o proprio Supabase recomenda. A migration `0002` ja concede acesso tabela por tabela, entao o app nao depende disto |
   | **Enable automatic RLS** | ✅ **ligado** | rede de seguranca: qualquer tabela criada no futuro nasce com RLS ativa. As nossas ja ativam explicitamente, entao aqui e so protecao contra esquecimento |

   > Se voce **deixar** "Automatically expose new tables" ligado tambem
   > funciona — os grants da migration sao os mesmos. Desligar so fecha
   > uma porta a mais.

6. Clique em **Create new project**.

**Sobre a senha do banco:** o app nao usa ela. Ela serve para conectar
direto no Postgres (psql, DBeaver, backup). Salve mesmo assim — o
Supabase nao mostra de novo.

**Sobre o plano Free:** para tres pessoas e de sobra. O unico limite que
voce pode encontrar e o de e-mails, tratado na Etapa 8.

⏳ O projeto leva **1 a 3 minutos** para ficar pronto. Espere a tela
parar de mostrar "Setting up project".

---

## Etapa 2 — Criar as tabelas

No menu lateral, abra **SQL Editor** e clique em **New query**.

Rode **todos os arquivos de `supabase/migrations/`, em ordem numerica**.
Para cada um: abra o arquivo no repositorio, copie **o conteudo
inteiro**, cole no editor e clique em **Run** (ou `Ctrl+Enter`).

Cada um deve responder **Success. No rows returned**. Se algum falhar,
pare: os seguintes dependem dele.

### 2.1 — `supabase/migrations/0001_schema.sql`

Cria as tabelas: `perfis`, `exercicios`, `treinos`, `treino_alunos`,
`treino_exercicios`, `sessoes`, `series_registros`, a view
`ultimas_cargas` e o gatilho de atualizacao.

✅ Resultado esperado: **Success. No rows returned**

### 2.2 — `supabase/migrations/0002_rls.sql`

Liga a seguranca por linha (RLS) em todas as tabelas, cria as regras de
quem ve o que e concede o acesso de API tabela por tabela. **Este e o
arquivo que fecha o app** — sem ele, qualquer pessoa com a chave publica
leria tudo.

✅ Resultado esperado: **Success. No rows returned**

### 2.3 — `supabase/migrations/0003_seed_exercicios.sql`

Cadastra 32 exercicios comuns para o personal nao comecar de uma lista
vazia.

✅ Resultado esperado: **Success. No rows returned**

### 2.4 — `0004_periodizacao.sql`

Cria o ciclo de repeticoes por semana e torna `reps` opcional no
exercicio: null passa a significar "segue a semana".

### 2.5 — `0005_biset_rir.sql`

Adiciona bi-set (`treino_exercicios.grupo`) e RIR (`series_registros.rir`).

### 2.6 — Conferir

Cole e rode esta consulta:

```sql
select tablename,
       (select count(*) from pg_policies p where p.tablename = t.tablename) as politicas
from pg_tables t
where schemaname = 'public'
order by tablename;
```

Voce deve ver **7 tabelas**, todas com **1 ou mais politicas**. Se
alguma aparecer com `0`, o arquivo `0002` nao rodou inteiro — rode de
novo.

---

## Etapa 3 — Fechar o cadastro publico

Esta etapa e o que torna o app privado. **Nao pule.**

No menu lateral: **Authentication** → **Sign In / Providers**.

### 3.1 — O provedor Email

Na lista **Auth Providers**, abra **Email** e confirme apenas:

> **Enable email provider** → **ligado**

**Nao mexa no resto desse bloco.** Tamanho minimo de senha, requisitos
de caractere, *secure password change*, *require current password* — nada
disso nos afeta: ninguem usa senha, o login e por link no e-mail.

Dois valores desse bloco que vale conhecer, ambos bons no padrao:

| Campo | Padrao | O que e |
|---|---|---|
| **Email OTP expiration** | `3600` | o link do e-mail vale 1 hora |
| **Email OTP length** | `8` | tamanho do codigo alternativo ao link |

> Se a sua versao do painel mostrar **Confirm email**, pode deixar ligado.
> Ele so age em cadastro novo — que vai estar desligado no proximo passo,
> entao nao faz diferenca.

### 3.2 — Desligar o cadastro (o passo que importa)

O toggle **nao fica** dentro do bloco Email. Role ate o **topo** da
pagina *Sign In / Providers* e procure a secao **User Signups**, antes da
lista de provedores:

> **Allow new users to sign up** → **DESLIGADO**

Clique em **Save**.

Em algumas versoes do painel essa opcao aparece em
**Authentication → Settings**.

**Quanto isso importa.** O app manda `shouldCreateUser: false` no codigo,
entao pela tela de login ninguem cria conta mesmo com o toggle ligado.
Desligar fecha a porta de quem chamasse a API do Supabase direto, por
fora do app. Vale fazer — mas se a sua versao do painel nao oferecer a
opcao, isso sozinho nao deixa o app aberto.

---

## Etapa 4 — Criar as tres pessoas

No menu lateral: **Authentication** → **Users** → botao **Add user** →
**Create new user**.

Repita **tres vezes**, uma para cada pessoa:

| # | Email | Auto Confirm User |
|---|---|---|
| 1 | o seu e-mail | ✅ marcado |
| 2 | o e-mail da sua esposa | ✅ marcado |
| 3 | o e-mail do personal | ✅ marcado |

**Sobre a senha:** o painel exige uma. Pode gerar qualquer coisa — o app
entra por link magico no e-mail, ninguem vai usar senha. Nao precisa
guardar nem passar para eles.

**Marque "Auto Confirm User"** nas tres. Sem isso o Supabase manda
e-mail de confirmacao e trava o primeiro login.

⚠️ Use os e-mails **reais** de cada um. O link de entrada chega ali.

---

## Etapa 5 — Criar os perfis

Criar o usuario no Supabase nao basta: e a tabela `perfis` que diz quem
e aluno, quem e personal, e — principalmente — quem tem acesso.
**Usuario sem perfil nao enxerga nada.**

Volte ao **SQL Editor**, nova query. Copie o bloco abaixo, **troque os
tres e-mails e os tres nomes** e rode:

```sql
insert into perfis (id, nome, papel, cor)
select u.id, d.nome, d.papel::papel_usuario, d.cor
from (values
  ('SEU-EMAIL@EXEMPLO.COM',            'Seu nome',      'aluno',    '#2563eb'),
  ('EMAIL-DA-SUA-ESPOSA@EXEMPLO.COM',  'Nome dela',     'aluno',    '#db2777'),
  ('EMAIL-DO-PERSONAL@EXEMPLO.COM',    'Nome dele',     'personal', '#16a34a')
) as d(email, nome, papel, cor)
join auth.users u on u.email = d.email
on conflict (id) do update
  set nome = excluded.nome, papel = excluded.papel, cor = excluded.cor;
```

O `join` busca o UUID pelo e-mail, entao voce nao copia identificador
nenhum a mao. E a consulta e **idempotente**: pode rodar quantas vezes
quiser: quem ja existe tem nome/papel/cor atualizados, sem duplicar.

⚠️ **Ela ignora em silencio quem nao existe em `auth.users`.** Isso e
proposital — assim faltar uma pessoa nao impede as outras duas de
entrarem. Por isso a conferencia abaixo nao e opcional.

### Conferir (obrigatorio)

```sql
select u.email, p.nome, p.papel,
       u.email_confirmed_at is not null as confirmado
from perfis p join auth.users u on u.id = p.id
order by p.papel, p.nome;
```

Voce precisa ver **tres linhas**, duas `aluno` e uma `personal`, todas
com `confirmado = true`.

**Vieram menos de tres linhas?** Alguem nao foi criado na Etapa 4, ou o
e-mail esta escrito diferente. Veja o que existe de verdade:

```sql
select email, created_at, email_confirmed_at is not null as confirmado
from auth.users order by created_at;
```

Compare caractere por caractere com os e-mails do `insert` — um ponto ou
um sublinhado a mais ja quebra a correspondencia. Corrija e rode o
`insert` de novo.

**Alguem com `confirmado = false`?** Faltou marcar *Auto Confirm User*.
Apague o usuario em **Authentication → Users** e recrie com a opcao
marcada.

### Trocar um nome depois

```sql
update perfis set nome = 'Novo nome' where nome = 'Nome antigo';
```

---

## Etapa 6 — Pegar as chaves

No painel novo os dois valores ficam em **paginas diferentes** do menu
**Project Settings** (engrenagem, no rodape do menu lateral).

### 6.1 — Project URL

Menu lateral, secao **INTEGRATIONS** → **Data API**.

Copie o **Project URL**: `https://xxxxxxxx.supabase.co`
→ vai para `VITE_SUPABASE_URL`

### 6.2 — Chave publica

Menu lateral, secao **CONFIGURATION** → **API Keys**.

Copie a **Publishable key** (`sb_publishable_...`).
→ vai para `VITE_SUPABASE_ANON_KEY`

> Em projetos mais antigos essa chave aparece como **anon public**, um
> texto longo comecando com `eyJ...`. As duas funcionam com o app; pegue
> a que o seu painel oferecer.

🚨 **Nunca as Secret keys / service_role**, que ficam nessa mesma pagina.
Elas ignoram toda a RLS da Etapa 2. Nao entram no `.env`, nem na Vercel,
nem em lugar nenhum do front.

A chave publica pode ir para o navegador sem medo: ela vai embutida no
JavaScript que roda no celular de voces, e sozinha nao da acesso a nada,
porque toda a permissao esta na RLS.

> **Paineis mais antigos** juntavam tudo em *Project Settings → API*. Se
> for o seu caso, os dois valores estao la, com os mesmos nomes.

## Etapa 7 — Rodar no computador

Na pasta do projeto:

```bash
npm install
cp .env.example .env
```

Abra o `.env` e preencha com o que voce anotou na Etapa 6:

```
VITE_SUPABASE_URL=https://abcdefgh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Salve e rode:

```bash
npm run dev
```

Abra <http://localhost:5173>.

- Se aparecer **"Falta conectar o Supabase"** → o `.env` nao foi lido.
  Confira o nome do arquivo (e `.env`, nao `.env.txt`) e **reinicie o
  `npm run dev`** — o Vite so le variaveis na inicializacao.
- Se aparecer a tela **Treino / Entrar** → esta conectado. ✅

### Primeiro login

1. Digite o seu e-mail e clique em **Entrar**.
2. Abra a caixa de entrada. O e-mail vem de `noreply@mail.app.supabase.io`
   — **olhe no spam**, na primeira vez quase sempre cai la.
3. Clique no link. Voce cai no app, logado, com seu nome no topo.

❌ Se aparecer *"Nao consegui enviar"*: o e-mail digitado nao esta entre
os tres da Etapa 4, ou o usuario nao foi criado. O app pede
`shouldCreateUser: false` de proposito — e-mail desconhecido nao vira
conta.

---

## Etapa 8 — E-mail e senha

### O limite de e-mails do plano gratuito

O servico de e-mail embutido do Supabase e **fortemente limitado**: poucas
mensagens por hora, somando as tres pessoas. Estourado o limite, o pedido
de link magico volta com **HTTP 429** e ninguem entra — inclusive na
academia, que e a pior hora possivel.

Por isso o app entra por **senha por padrao**, e o link por e-mail e a
alternativa. Senha nao depende de e-mail chegar.

### Definir a senha de cada um

Logado no app: **Hoje → conta → Definir uma senha**.

Se ninguem consegue entrar para chegar la (limite estourado e sem senha
ainda), defina a primeira senha pelo **SQL Editor**:

```sql
create extension if not exists pgcrypto with schema extensions;

update auth.users
set encrypted_password = extensions.crypt('SENHA-PROVISORIA', extensions.gen_salt('bf')),
    updated_at = now()
where email = 'EMAIL-DA-PESSOA@EXEMPLO.COM';
```

E acao de administrador do proprio projeto, valida mas com dois cuidados:
a senha fica no historico do SQL Editor, e ela nao deve ser a definitiva.
**Troque por outra no app**, em conta → Definir uma senha, assim que
entrar.

### SMTP proprio: tirar o limite de vez

Opcional, mas resolve o link magico para sempre.
**Project Settings → Authentication → SMTP Settings**.

**Resend** (resend.com) — exige um **dominio verificado**. Sem dominio,
a conta gratuita so envia para o e-mail do proprio titular, o que nao
serve para tres pessoas. Com dominio: adicione em *Domains*, publique os
registros DNS que ele pedir, gere uma **API key** e preencha:

| Campo | Valor |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | a API key gerada |
| Sender email | `treino@seu-dominio` (do dominio verificado) |
| Sender name | `Treino` |

**Brevo** (brevo.com) — alternativa quando **nao ha dominio**: ele
verifica um **endereco de e-mail avulso**, por confirmacao no proprio
e-mail. Plano gratuito de 300 mensagens por dia. As credenciais SMTP
ficam em *SMTP & API → SMTP*.

Depois de configurar, mande um link magico para si mesmo e confira nos
**Logs → Auth Logs** que o `POST /auth/v1/otp` responde **200**, e nao 429.

## Etapa 9 — Montar o primeiro treino

### Atalho: um treino de exemplo agora

O personal pode nao estar disponivel na hora em que voce quer testar, e
aluno nao monta treino. Para nao travar, rode `supabase/exemplo_treino.sql`
no SQL Editor: ele cria um treino atribuido aos dois alunos, com uma
variacao exclusiva de um deles — da para testar o fluxo inteiro na hora, e
o personal apaga depois.

### O jeito normal

Entre no app **com o e-mail do personal** (ou com o seu, so para testar
— mas quem edita e o personal).

1. Aba **Treinos** → **+ Novo**.
2. Toque no nome e troque para algo real: `Treino A - Peito e Triceps`.
3. Em **Quem faz este treino**, marque voce e sua esposa.
4. **+ Adicionar** → busque o exercicio (ou digite um nome novo e toque
   em *Criar "..."*).
5. Em cada exercicio ajuste **series**, **reps** e **descanso (s)**.
6. Em **Para quem**, escolha:
   - **Ambos** → os dois fazem (o caso normal)
   - **So Igor** / **So [ela]** → a variacao de um so

É aqui que "treinamos juntos com pequenas diferencas" vira dado: um
treino, com os desvios marcados.

Volte na aba **Hoje** e toque em **Iniciar**. Se a tela de execucao
abrir com os exercicios, esta tudo funcionando de ponta a ponta.

---

## Etapa 10 — Publicar (para usar na academia)

Rodando so no seu computador o app nao serve — voces precisam dele no
celular.

```bash
npx vercel
```

Responda as perguntas (aceite os padroes). Ao final, a Vercel te da uma
URL tipo `https://treino-app-xxxx.vercel.app`.

### 10.1 — Cadastrar as variaveis na Vercel

Painel da Vercel → seu projeto → **Settings** → **Environment
Variables**. Adicione as duas, com os mesmos valores do `.env`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Depois **Deployments** → no ultimo deploy, menu `...` → **Redeploy**.
Variavel nova so entra em build novo.

### 10.2 — Avisar o Supabase do novo endereco ⚠️

**Sem este passo o link do e-mail joga voce em `localhost` e nao entra.**

Supabase → **Authentication** → **URL Configuration**:

- **Site URL**: `https://treino-app-xxxx.vercel.app`
- **Redirect URLs**: adicione as duas linhas:
  - `https://treino-app-xxxx.vercel.app/**`
  - `http://localhost:5173/**` *(para voce continuar testando local)*

Salve.

---

## Etapa 11 — Instalar no celular

Em **cada um dos tres celulares**:

1. Abra a URL da Vercel no navegador.
2. Faca login pelo link do e-mail.
3. Instale na tela inicial:
   - **iPhone (Safari):** botao de compartilhar → **Adicionar a Tela de
     Início**
   - **Android (Chrome):** menu `⋮` → **Adicionar à tela inicial** /
     **Instalar app**

Vira icone, abre em tela cheia, sem barra de navegador. O login fica
salvo — nao precisa pedir link toda vez.

---

## Resolucao de problemas

| Sintoma | Causa | Solucao |
|---|---|---|
| Tela "Falta conectar o Supabase" | `.env` ausente ou nao recarregado | Confira o arquivo e reinicie o `npm run dev` |
| "Esta conta nao tem acesso" | usuario existe, perfil nao | Refaca a Etapa 5 |
| "Nao consegui enviar" no login | e-mail fora dos tres cadastrados | Confira a Etapa 4 |
| `429` / limite de e-mails | envio do plano Free esgotado | Entre com senha; para resolver de vez, SMTP proprio (Etapa 8) |
| "E-mail ou senha incorretos" | senha nao definida ou errada | Defina pelo SQL da Etapa 8 e troque no app |
| Link do e-mail cai em `localhost` | falta a URL da Vercel | Etapa 10.2 |
| Treino nao aparece para o aluno | treino sem aluno atribuido | Editor do treino → **Quem faz este treino** |
| Exercicio some para um dos dois | marcado como "So [outra pessoa]" | Editor → **Para quem** → **Ambos** |
| Tarja amarela "Sem conexao" | sinal ruim na academia | Normal. Os registros sobem sozinhos depois |

---

## Checklist final

- [ ] Organizacao pessoal criada (nao a do escritorio)
- [ ] Projeto `APP - TREINOS` criado, separado do CRM
- [ ] As 3 migrations rodaram sem erro
- [ ] 7 tabelas, todas com politica de RLS
- [ ] Security: Data API ligado, RLS automatica ligada
- [ ] **Allow new users to sign up: DESLIGADO** (secao *User Signups*)
- [ ] 3 usuarios criados com *Auto Confirm*
- [ ] 3 linhas em `perfis` (2 alunos + 1 personal)
- [ ] `.env` preenchido com a chave **anon**, nunca a `service_role`
- [ ] Login por link magico funcionando
- [ ] Publicado na Vercel com as variaveis cadastradas
- [ ] Site URL e Redirect URLs apontando para a Vercel
- [ ] App instalado nos 3 celulares
