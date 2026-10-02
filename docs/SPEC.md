# Gestão da Associação fotografARTE — Especificação e contexto

> Documento vivo. Regista o que a aplicação faz, as decisões tomadas e porquê, para que futuras alterações (por pessoas ou por assistentes de IA) partam do contexto certo. Atualizar sempre que uma regra de negócio ou uma decisão mudar.
>
> Última atualização: 2026-10-02.

## 1. Objetivo

Aplicação web para a Associação fotografARTE gerir **associados e quotas**, **finanças** (receitas e despesas), **relatórios de contas** para aprovação em assembleia, e as **listas de apoio**. Substitui um Excel. Qualquer utilizador autenticado tem acesso total; não há perfis nem permissões.

Vocabulário: usa-se **associado** (não "sócio"), **quota** (anual), **joia** (valor único pago na entrada), **apuramento** (receitas − despesas), **saldo da gerência anterior**, **relatório final** (aprovado), **rascunho**.

## 2. Decisões estruturais (e porquê)

| Decisão | Motivo |
|---|---|
| Frontend **Angular 21 + Angular Material** (TypeScript, standalone components, signals) | Preferência da Ana (Angular é o que domina). Angular 22 exigia Node ≥ 22.22.3, indisponível no ambiente de build na altura. |
| Backend **Supabase** (Postgres + Auth + Storage), plano gratuito | Alojamento gratuito pedido; GitHub Pages só serve estáticos. O frontend fala diretamente com o Supabase (sem servidor próprio). Projeto: `zsknznmgzajvvmlclsmr`. |
| Alojamento **GitHub Pages** via GitHub Actions | Gratuito. Repositório `AnaSofiaGrilo96/associacao-fotografarte` (público). URL: https://anasofiagrilo96.github.io/associacao-fotografarte/ |
| **Hash routing** (`/#/associados`) | Evita 404 em refresh no GitHub Pages sem truques. |
| **Utilizadores geridos no painel do Supabase**, não na app | A Ana preferiu não ter área de utilizadores na app (foi implementada com Edge Function e depois removida). Login é por **email** (username foi considerado e recusado). Registos públicos devem estar desligados no Supabase. |
| **Movimentos de quotas e joias gerados por triggers em Postgres** | Garante que o extrato e os relatórios refletem sempre o que foi recebido, sem lógica duplicada no cliente. Esses movimentos são só de leitura na app. |
| **PDF gerado no browser** (jsPDF + autotable) | Sem servidor. |
| **Exportação completa para Excel** (exceljs, carregado sob demanda) escondida no menu do utilizador | Pedido explícito: "saída de emergência" para voltar ao Excel e cópia de segurança; não deve estar em evidência. |
| Chaves do Supabase (URL + anon key) **commitadas** em `src/environments/*.ts` | A anon key é pública por desenho; a segurança está nas políticas RLS + login. O workflow também aceita variáveis `SUPABASE_URL`/`SUPABASE_ANON_KEY` do repositório, se definidas. |

## 3. Arquitetura e código

```
src/app/
  core/        supabase.service (cliente), auth.service (sessão, signals), auth.guard,
               data.service (todo o acesso a dados), models.ts (tipos), theme.service (temas)
  shared/      ui.service (toasts/confirm), confirm-dialog, name-dialog, dates.ts, money.ts,
               images.ts (redimensionar fotos), balances.ts (saldos por conta)
  layout/      shell (menu lateral, barra superior: tema, menu do utilizador)
  features/
    auth/      login.page, change-password.dialog
    members/   members.page (lista), member-detail.page (ficha), member.dialog,
               fee.dialog (quotas, vários anos), joining-fee.dialog (joia)
    finance/   finance.page (saldos + extrato), transaction.dialog
    lists/     lists.page (categorias, motivos, métodos, definições), simple-list
    reports/   reports.page, report.model (cálculo), report-pdf (PDF), emit-report.dialog
    export/    export.service (Excel completo)
supabase/
  schema.sql                esquema completo para instalações novas (idempotente)
  migrations/00N_*.sql      alterações incrementais para a base já existente (idempotentes)
.github/workflows/deploy.yml  build + deploy para GitHub Pages em cada push para main
docs/SPEC.md              este documento
```

Convenções: componentes standalone com template inline; estado em `signal`/`computed`; formulários reativos; datas em `yyyy-mm-dd` (helpers `toIsoDate`/`fromIsoDate` evitam desvios de fuso); dinheiro em `numeric(10,2)`, arredondado com `round2`; textos da UI em português de Portugal; locale `pt-PT`.

## 4. Modelo de dados (Supabase / Postgres)

Todas as tabelas têm RLS com uma política `authenticated_all` (utilizador autenticado pode tudo).

| Tabela | Campos relevantes | Notas |
|---|---|---|
| `members` | `member_number` (único, sugerido automaticamente), `name`, `email`, `phone`, `nif`, `address`, `joined_at`, `status` (`active`/`inactive`), `inactive_reason_id`, `inactive_at`, `notes`, `photo_path`, `joining_fee_paid_on`, `joining_fee_amount`, `joining_fee_payment_method_id` | A joia vive na ficha do associado (uma por associado). |
| `membership_fees` | `member_id`, `year`, `amount`, `paid_on`, `payment_method_id`, `notes`; único `(member_id, year)` | Uma linha por associado/ano. `paid_on` é a data real do pagamento. |
| `transactions` | `date`, `description`, `amount` (≥0), `type` (`income`/`expense`), `category_id`, `payment_method_id`, `fee_id` (único), `joining_fee_member_id` (único), `notes` | `fee_id`/`joining_fee_member_id` marcam movimentos gerados automaticamente (só leitura na app; apagados em cascata). |
| `categories` | `name`, `type`, `is_system`, `active`, `sort_order`; único `(name, type)` | **"Quotas"** e **"Joias"** são de sistema (receita), não se eliminam. |
| `payment_methods` | `name`, `account` (`bank`/`cash`), `active`, `sort_order` | `account` determina em que conta o movimento entra/sai. Seed: Numerário (cash), Transferência bancária, MB WAY, Multibanco, Cheque (bank). |
| `inactive_reasons` | `name`, `active`, `sort_order` | Seed: Desistência, Falta de pagamento, Falecimento, Outro. |
| `settings` (linha única `id=1`) | `association_name`, `default_fee_amount`, `default_joining_fee_amount` (3 €), `report_footer`, `bank_balance`, `bank_balance_date`, `cash_balance`, `cash_balance_date`, `initial_balance` | `bank_balance`/`cash_balance` são os **saldos iniciais** (o que havia quando a app começou), com data de referência; `initial_balance` = soma dos dois (gravado pela UI). |
| `reports` | `number` (sequencial, trigger), `period_from`, `period_to`, `previous_balance`, `income_total`, `expense_total`, `net`, `expected_balance`, `bank_balance`, `cash_balance`, `total_balance`, `difference`, `status` (`approved`), `issued_at`, `issued_by`, `data` (jsonb com as grelhas) | Relatórios finais emitidos. `data` permite regenerar o PDF tal como foi emitido. |
| Storage bucket `member-photos` (privado) | `members.photo_path` = `<member_id>/<timestamp>.jpg` | Acesso por URLs assinados (1 h). Fotos redimensionadas no browser para 600 px, JPEG. |

Triggers:
- `sync_fee_transaction` (membership_fees insert/update): cria/atualiza o movimento de receita "Quota {ano} — {nome}" na categoria Quotas, com `date = paid_on`, valor, notas e método.
- `sync_joining_fee_transaction` (members insert/update): se `joining_fee_paid_on` tiver valor, cria/atualiza o movimento "Joia — {nome}" na categoria Joias; se for null, apaga o movimento.
- `sync_member_name` (members update): propaga mudanças de nome às descrições dos movimentos de quotas.
- `reports_assign_number`: número sequencial.
- `set_updated_at` em members e transactions.

Após alterações de esquema, o PostgREST precisa de `notify pgrst, 'reload schema';` (já incluído no fim dos scripts).

## 5. Regras de negócio

### Associados e quotas
- Ficha com dados pessoais, estado (ativo/inativo + motivo + data de saída), notas, foto.
- Quotas são anuais, mas a data que conta é a do **pagamento** (`paid_on`): a quota de 2024 paga em 2026 é receita de 2026. Pode pagar-se qualquer ano, passado ou futuro.
- O diálogo "Registar pagamento" permite escolher **vários anos de uma vez** (um registo por ano, mesma data, método e valor por ano), mostra o total e sugere o primeiro ano em falta. Anos já pagos ficam desativados.
- **Joia**: valor configurável (3 € por defeito), pago uma vez na entrada. Registada na ficha (registar/editar/remover). Ao registar quotas de um associado sem quotas nem joia, a opção "Incluir joia" vem pré-marcada. Contar joias de um ano = número de novos associados nesse ano.
- "Quotas em falta" na ficha = anos desde `joined_at` até ao ano atual sem pagamento (só para ativos).

### Finanças
- Extrato do mais recente para o mais antigo, com saldo acumulado dos movimentos, filtros (período, tipo, categoria, texto), totais do período.
- Movimentos manuais: data, descrição, valor, tipo, categoria, **método de pagamento** (opcional, mas sem ele o movimento não entra em nenhuma conta — a UI avisa quantos estão nessa situação), notas.
- **Saldos por conta** (conta bancária e numerário) = saldo inicial (Definições) + todos os movimentos posteriores à data de referência cujo método pertença a essa conta. São considerados **reais** (resultam de movimentos reais); **não há** conceito de "previsão" nem de "confirmar saldo" nesta área (foi implementado e removido a pedido).

### Relatórios
- Período livre (de dia a dia); atalhos para o ano atual/anterior e para "desde o dia seguinte ao último relatório".
- Duas grelhas (receitas e despesas) categoria × mês com totais; o total de receitas/despesas aparece **só nas grelhas**, não no resumo.
- **Saldo da gerência anterior é automático**: total dos saldos do último relatório final com `period_to < from`; se não existir, `settings.initial_balance`. Campo só de leitura, com indicação da origem.
- Saldos de conta e numerário **pré-preenchidos com o que resulta dos movimentos registados** (até à data de fim do período), editáveis. É uma ajuda para não ter de consultar banco e caixa, mas devem ser verificados.
- Resumo, por esta ordem: saldo da gerência anterior; apuramento do período; saldo esperado (anterior + apuramento); saldo em conta bancária; saldo em numerário; total dos saldos; diferença (saldos − esperado), só quando ≠ 0.
- **Exportar rascunho**: PDF A4 horizontal com marca de água "RASCUNHO"; permitido sempre, mesmo com diferença.
- **Emitir relatório final**: abre diálogo de confirmação com os saldos editáveis e a diferença em tempo real; **só é possível emitir com diferença 0,00 €**. Recusa períodos sobrepostos a relatórios já emitidos; avisa se o período não começa no dia seguinte ao último. Ao emitir: grava em `reports` (status `approved`, número sequencial, emissor, `data` com as grelhas), gera o PDF final (com número e data de emissão) e avança o período sugerido. **Não** altera `settings`.
- Lista de relatórios emitidos com PDF (regenerado a partir de `data`, fiel ao emitido) e **anular** (apenas o mais recente).

### Listas e definições
- Categorias de receita e despesa (renomear, desativar, eliminar se não usadas); as de sistema não se eliminam.
- Motivos de inatividade.
- Métodos de pagamento com indicação e troca de conta (bancária/numerário).
- Definições: nome da associação, valor da quota, valor da joia, **saldos iniciais** em conta e numerário + data de referência, rodapé do relatório.

### Temas
- Seletor na barra superior: 7 paletas Material 3 (azul por defeito, verde, ciano, violeta, rosa, laranja, amarelo) + modo claro/escuro (por defeito segue o sistema). Guardado em `localStorage` (`app-theme`). Implementado com classes `theme-<nome>` e `dark` no `<html>` (`styles.scss` + `ThemeService`).

### Exportação Excel (menu do utilizador → "Exportar tudo para Excel")
Folhas: **Resumo** (fórmulas SUMIFS/COUNTIFS por ano: receitas, despesas, apuramento, saldos por conta, novos associados, por categoria), **Associados** (uma coluna por ano de quota), **Quotas**, **Movimentos** (extrato com saldo acumulado por fórmula e linha TOTAL), **Relatórios**, **Listas**, **Definições** (referenciada pelas fórmulas: B5 conta, B6 numerário, B7 data de referência). Datas e valores como tipos nativos; datas construídas em UTC para evitar desvio de fuso.

## 6. Operação

- **Desenvolvimento local**: `npm install --legacy-peer-deps` (necessário por incompatibilidade vitest/npm), `npm start`.
- **Deploy**: push para `main` → workflow compila com `--base-href /associacao-fotografarte/` e publica no GitHub Pages (Settings → Pages → Source: GitHub Actions).
- **Alterações de esquema**: criar `supabase/migrations/00N_descricao.sql` (idempotente, terminar com `notify pgrst, 'reload schema';`), **e** refletir em `schema.sql`. A Ana executa a migração no SQL Editor do Supabase.
- **Supabase gratuito** pausa após ~7 dias sem uso (restaurar no painel). Sem backups automáticos: usar a exportação Excel periodicamente.
- **Git a partir da sessão de IA**: consegue fazer commit na pasta ligada, mas **não push** (sem credenciais); a Ana faz `git push`. Se a sessão deixar ficheiros `.git/*.lock` ou `tmp_obj_*` (falta de permissão para apagar), removê-los antes do próximo comando git.
- Testes: não há testes automatizados no repositório. Durante o desenvolvimento usou-se um smoke test Playwright com Supabase simulado e validação do SQL num Postgres local; vale a pena repetir esse padrão em alterações grandes.

## 7. Histórico de decisões relevantes

- Removida a área de Utilizadores e a Edge Function `manage-users` (gestão passa a ser no painel do Supabase).
- "Sócios" → "Associados" em toda a UI e na rota.
- Método de pagamento adicionado a quotas, joia e movimentos manuais; passou a ser a base dos saldos por conta.
- Resumo do relatório reordenado; totais de receitas/despesas retirados do resumo.
- "Confirmar saldo" em Finanças implementado e depois **removido**: os saldos em Finanças resultam só dos movimentos; os saldos iniciais passaram para Definições.
- Emissão de relatório final passou a exigir confirmação dos saldos e diferença zero.
- Login por username considerado e **recusado** (mantém-se email).

## 8. Pendentes / ideias

- **Migração do Excel antigo** (prioritário): importar associados, quotas (com datas de pagamento), movimentos e preencher os saldos iniciais e a data de referência em Definições. A Ana vai fornecer o ficheiro.
- Tornar o método de pagamento obrigatório nos movimentos manuais (eliminaria os "sem método").
- Paleta de cores personalizada com as cores da fotografARTE (a partir do logótipo).
- Pequenas melhorias possíveis: filtro "joia paga/em falta" na lista de associados; coluna de método no PDF do extrato.
