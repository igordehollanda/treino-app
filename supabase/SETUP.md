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

5. Clique em **Create new project**.

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

Voce vai rodar **tres arquivos, nesta ordem**. Para cada um: abra o
arquivo no repositorio, copie **o conteudo inteiro**, cole no editor e
clique em **Run** (ou `Ctrl+Enter`).

### 2.1 — `supabase/migrations/0001_schema.sql`

Cria as tabelas: `perfis`, `exercicios`, `treinos`, `treino_alunos`,
`treino_exercicios`, `sessoes`, `series_registros`, a view
`ultimas_cargas` e o gatilho de atualizacao.

✅ Resultado esperado: **Success. No rows returned**

### 2.2 — `supabase/migrations/0002_rls.sql`

Liga a seguranca por linha (RLS) em todas as tabelas e cria as regras de
quem ve o que. **Este e o arquivo que fecha o app** — sem ele, qualquer
pessoa com a chave publica leria tudo.

✅ Resultado esperado: **Success. No rows returned**

### 2.3 — `supabase/migrations/0003_seed_exercicios.sql`

Cadastra 32 exercicios comuns para o personal nao comecar de uma lista
vazia.

✅ Resultado esperado: **Success. No rows returned**

### 2.4 — Conferir

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

1. Em **Auth Providers**, confirme que **Email** esta **habilitado**.
2. Dentro de Email, deixe assim:

   | Opcao | Valor |
   |---|---|
   | **Enable email provider** | ligado |
   | **Confirm email** | ligado |
   | **Secure email change** | ligado |

3. Ainda em Authentication, procure a secao **Sign Up** (pode estar em
   *Sign In / Providers* ou em *Policies*, dependendo da versao do
   painel) e **DESLIGUE**:

   > **Allow new users to sign up** → **desligado**

4. Clique em **Save**.

A partir daqui ninguem cria conta. Mesmo que descubram o endereco do
app, a tela de login nao serve para nada sem um usuario ja cadastrado.

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
insert into perfis (id, nome, papel, cor) values
  ((select id from auth.users where email = 'SEU-EMAIL@EXEMPLO.COM'),
   'Igor',     'aluno',    '#2563eb'),
  ((select id from auth.users where email = 'EMAIL-DA-SUA-ESPOSA@EXEMPLO.COM'),
   'NOME DELA','aluno',    '#db2777'),
  ((select id from auth.users where email = 'EMAIL-DO-PERSONAL@EXEMPLO.COM'),
   'NOME DELE','personal', '#16a34a');
```

O `select` de dentro busca o UUID pelo e-mail, entao voce nao precisa
copiar identificador nenhum a mao.

✅ Resultado esperado: **Success. No rows returned**

❌ Se aparecer `null value in column "id" violates not-null constraint`,
um dos e-mails esta escrito diferente do que foi cadastrado na Etapa 4.
Confira com:

```sql
select email, created_at from auth.users order by created_at;
```

### Conferir

```sql
select nome, papel, cor from perfis order by papel, nome;
```

Devem aparecer **tres linhas**: dois `aluno` e um `personal`.

### Trocar um nome depois

```sql
update perfis set nome = 'Novo nome' where nome = 'Nome antigo';
```

---

## Etapa 6 — Pegar as chaves

No menu lateral: **Project Settings** (engrenagem) → **API**.

Anote dois valores:

| No painel | Vai para |
|---|---|
| **Project URL** (ex: `https://abcdefgh.supabase.co`) | `VITE_SUPABASE_URL` |
| **anon** / **public** / **publishable** key (texto longo) | `VITE_SUPABASE_ANON_KEY` |

> Dependendo da versao do painel, a chave publica aparece como **anon
> public** ou como **Publishable key**. Sao a mesma coisa para o nosso
> uso — pegue essa.

🚨 **Nunca use a chave `service_role` / `secret`.** Ela ignora toda a
RLS. Ela nao entra neste projeto, nem no `.env`, nem na Vercel, nem em
lugar nenhum do front.

A chave publica pode ir para o navegador sem medo: sozinha ela nao da
acesso a nada, porque toda a permissao esta na RLS da Etapa 2.

---

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

## Etapa 8 — O limite de e-mails (leia antes de reclamar)

O serviço de e-mail embutido do Supabase e **fortemente limitado** no
plano Free — na ordem de **poucos e-mails por hora** para todo o
projeto, somando os tres.

Na pratica isso quase nunca incomoda, porque o login **fica salvo no
celular** e voce so pede link novo se sair ou trocar de aparelho. Mas
**no dia da configuracao**, testando os tres logins seguidos, da para
esbarrar no limite e receber `email rate limit exceeded`.

Duas saidas:

- **Esperar uma hora** e continuar. Serve perfeitamente para o setup.
- **Configurar um SMTP proprio**, se quiser eliminar o limite:
  **Project Settings → Authentication → SMTP Settings**. Resend e Brevo
  tem plano gratuito suficiente. Nao e necessario para o app funcionar.

---

## Etapa 9 — Montar o primeiro treino

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
| `email rate limit exceeded` | limite do plano Free | Espere 1h ou configure SMTP (Etapa 8) |
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
- [ ] **Allow new users to sign up: DESLIGADO**
- [ ] 3 usuarios criados com *Auto Confirm*
- [ ] 3 linhas em `perfis` (2 alunos + 1 personal)
- [ ] `.env` preenchido com a chave **anon**, nunca a `service_role`
- [ ] Login por link magico funcionando
- [ ] Publicado na Vercel com as variaveis cadastradas
- [ ] Site URL e Redirect URLs apontando para a Vercel
- [ ] App instalado nos 3 celulares
