# Como ligar o app (uma vez so)

## 1. Crie um projeto Supabase NOVO

Em <https://supabase.com> > New project.

**Nao use o projeto do CRM do escritorio.** Dado de cliente e dado de
academia no mesmo banco e problema de LGPD e de bagunca.

## 2. Rode as migrations

Painel do Supabase > **SQL Editor** > cole e execute, nesta ordem:

1. `supabase/migrations/0001_schema.sql`
2. `supabase/migrations/0002_rls.sql`
3. `supabase/migrations/0003_seed_exercicios.sql`

## 3. Feche o cadastro publico

**Authentication > Sign In / Providers**:

- Email: **ligado**
- **Confirm email: ligado**
- **Allow new users to sign up: DESLIGADO** ← isto e o que fecha o app

Com o signup desligado, ninguem cria conta. Mesmo que alguem descubra a
URL, nao consegue entrar.

## 4. Crie as tres pessoas, a mao

**Authentication > Users > Add user > Create new user** (marque
*Auto Confirm User*). Uma vez para cada e-mail: voce, sua esposa, o personal.

Copie o **UUID** de cada um e rode no SQL Editor:

```sql
insert into perfis (id, nome, papel, cor) values
  ('uuid-do-igor',    'Igor',    'aluno',    '#2563eb'),
  ('uuid-da-esposa',  'Esposa',  'aluno',    '#db2777'),
  ('uuid-do-personal','Personal','personal', '#16a34a');
```

Trocar o nome depois e so um `update perfis set nome = '...' where id = '...'`.

## 5. Aponte o app para o projeto

```bash
cp .env.example .env
```

Preencha com **Project Settings > API**:

- `VITE_SUPABASE_URL` = Project URL
- `VITE_SUPABASE_ANON_KEY` = a chave `anon` / publishable

A chave `anon` pode ir para o front sem medo: sozinha ela nao da acesso a
nada, porque toda a permissao esta na RLS do passo 2. A chave
`service_role` **nunca** entra neste projeto.

## 6. Rode

```bash
npm install
npm run dev
```

## 7. Publique (Vercel)

```bash
npx vercel
```

Cadastre as duas variaveis `VITE_*` no painel da Vercel e, em
**Authentication > URL Configuration** do Supabase, ponha o dominio da
Vercel em *Site URL* e em *Redirect URLs* — senao o link magico do e-mail
volta para `localhost`.

Depois, no celular de cada um: abrir o site > menu do navegador >
**Adicionar a tela de inicio**. Vira app, abre em tela cheia.
