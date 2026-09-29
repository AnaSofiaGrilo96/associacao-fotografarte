# Gestão da Associação

Aplicação web para gerir uma associação: associados, quotas e joias, finanças, listas de apoio e relatórios em PDF.

- **Frontend:** Angular 21 + Angular Material (TypeScript), alojado gratuitamente no **GitHub Pages**
- **Dados e login:** **Supabase** (Postgres + autenticação), plano gratuito
- **PDF:** gerado no browser (jsPDF)

## Áreas da aplicação

| Área | O que faz |
|---|---|
| **Associados** | Lista com pesquisa e filtros; ficha com foto, nome, contactos, NIF, morada, data de entrada, estado (ativo/inativo + motivo e data de saída) e notas. Registo de pagamentos de quotas por ano (vários anos de uma vez), com a **data real do pagamento**, método de pagamento e a **joia** de novo associado (valor configurável). |
| **Finanças** | Painel de saldos (conta bancária e numerário) com o último saldo confirmado e a **previsão** a partir dos movimentos posteriores, por método de pagamento. Extrato tipo bancário (mais recente primeiro), filtros por período/tipo/categoria/texto e totais do período. Registo de receitas e despesas (data, descrição, valor, categoria, método de pagamento, notas). Os pagamentos de quotas e joias geram automaticamente movimentos de receita nas categorias "Quotas" e "Joias". |
| **Relatórios** | Escolha do período (de dia a dia). O **saldo da gerência anterior é automático**: total dos saldos do último relatório final anterior ao período (ou o saldo inicial das definições). Saldos de conta e numerário pré-preenchidos com a previsão e ajustáveis. Duas grelhas (receitas e despesas) por categoria × mês e resumo. **Exportar rascunho** (PDF com marca de água) ou **Emitir relatório final**, que grava o relatório como aprovado, confirma os saldos à data de fim do período e passa a alimentar o saldo anterior do próximo. Lista de relatórios emitidos com PDF fiel ao emitido; o mais recente pode ser anulado. As quotas contam na data em que foram **recebidas**, não no ano a que respeitam. |
| **Listas e definições** | Categorias de receita e despesa, motivos de inatividade, métodos de pagamento, nome da associação, valores da quota e da joia por defeito e rodapé do relatório. |
| **Utilizadores** | Geridos no painel do Supabase (*Authentication → Users*). Qualquer utilizador autenticado acede a tudo. |

---

## 1. Configurar o Supabase (uma vez)

1. Crie um projeto em [supabase.com](https://supabase.com) (plano Free). Guarde a password da base de dados.
2. **Esquema da base de dados:** no painel do projeto abra *SQL Editor → New query*, cole o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em *Run*. Cria as tabelas, as regras de segurança e alguns dados iniciais (categorias, motivos).
3. **Desativar registos públicos:** em *Authentication → Sign In / Providers → Email* desligue **"Allow new users to sign up"** (para que só quem for criado por vós possa entrar). Pode também desligar *"Confirm email"* se quiser criar utilizadores pelo painel sem confirmação.
4. **Primeiro utilizador:** em *Authentication → Users → Add user → Create new user*, preencha email e password e marque *Auto Confirm User*.
5. **Chaves:** em *Project Settings → API* copie o **Project URL** e a **anon public key**.

### Gestão de utilizadores

Os utilizadores criam-se e removem-se no painel do Supabase em *Authentication → Users* (*Add user → Create new user*, com *Auto Confirm User*). Cada utilizador pode alterar a sua password dentro da app, no menu do canto superior direito.

### Atualizações ao esquema

Se a base de dados já foi criada com uma versão anterior, execute no SQL Editor os ficheiros de `supabase/migrations/` por ordem (cada um pode ser corrido mais do que uma vez). Numa instalação nova basta o `schema.sql`, que já inclui tudo.

> **Nota sobre o plano gratuito:** o Supabase pausa projetos gratuitos após ~7 dias sem atividade. Basta entrar no painel e clicar em *Restore project*; os dados mantêm-se.

---

## 2. Correr localmente

```bash
npm install --legacy-peer-deps
```

Edite `src/environments/environment.ts` (e `environment.prod.ts`) com o URL e a anon key do Supabase, depois:

```bash
npm start
```

Abra http://localhost:4200.

---

## 3. Publicar no GitHub Pages

1. Envie o código para o repositório no GitHub (branch `main`).
2. Em *Settings → Pages → Build and deployment → Source* escolha **GitHub Actions**.
3. (Recomendado) Em *Settings → Secrets and variables → Actions → Variables* crie `SUPABASE_URL` e `SUPABASE_ANON_KEY`. Assim não precisa de escrever as chaves em `environment.prod.ts`. Se preferir, pode simplesmente editar esse ficheiro e fazer commit — a anon key é pública por desenho e os dados estão protegidos pelas regras de segurança (RLS) da base de dados.
4. Cada `git push` para `main` corre o workflow em `.github/workflows/deploy.yml` e publica em `https://<utilizador>.github.io/<repositório>/`.

A app usa rotas com `#` (ex.: `/#/socios`), que funcionam sem configuração especial no GitHub Pages.

---

## Estrutura do código

```
src/app/
  core/          supabase.service, auth.service, auth.guard, data.service, models
  shared/        confirm-dialog, name-dialog, ui.service (toasts/confirm), dates, money
  layout/        shell (menu lateral + barra superior)
  features/
    auth/        login, alterar password
    members/     lista, ficha, diálogos de associado, quotas e joia
    finance/     extrato, diálogo de movimento
    lists/       categorias, motivos, definições
    reports/     página, cálculo (report.model), PDF (report-pdf)
supabase/
  schema.sql                 esquema completo (executar no SQL Editor numa instalação nova)
  migrations/                alterações incrementais para bases já criadas
.github/workflows/deploy.yml publicação automática no GitHub Pages
```

## Modelo de dados (resumo)

- `members` — associados; inclui `photo_path` (Storage, bucket privado `member-photos`) e os campos da joia (`joining_fee_*`). `status` = `active`/`inactive`; `inactive_reason_id` aponta para `inactive_reasons`.
- `membership_fees` — uma linha por associado/ano (`year`), com `amount`, `paid_on` (data real do pagamento) e `payment_method_id`.
- `transactions` — movimentos; `type` = `income`/`expense`; `fee_id` / `joining_fee_member_id` ligam ao pagamento de quota ou joia que o gerou (esses movimentos são só de leitura na app e desaparecem se o pagamento for eliminado).
- `categories` — categorias por tipo; "Quotas" e "Joias" são de sistema (não se eliminam).
- `payment_methods` — métodos de pagamento (numerário, transferência, …); `account` diz se pertencem à conta bancária (`bank`) ou ao numerário (`cash`), o que alimenta a previsão dos saldos.
- `reports` — relatórios finais emitidos (período, totais, saldos, número sequencial, emissor, e as grelhas em `data` para regenerar o PDF).
- `settings` guarda também o saldo inicial e os últimos saldos confirmados de conta e numerário com a respetiva data.
- `settings` — uma única linha (id = 1).

Triggers em Postgres (`sync_fee_transaction`, `sync_joining_fee_transaction`) mantêm `transactions` em sincronia com as quotas e joias, por isso o extrato e os relatórios refletem sempre o que foi recebido. Contar as joias de um ano no relatório dá o número de novos associados nesse ano.

## Migração do Excel

Ainda não incluída. O caminho mais simples será um script que leia o Excel e insira em `members`, `membership_fees` e `transactions` via API do Supabase, ou preparar CSVs e importá-los em *Table Editor → Import data from CSV*.
