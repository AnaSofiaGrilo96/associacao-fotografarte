# Instruções para assistentes de IA neste repositório

Antes de qualquer alteração, ler **docs/SPEC.md**: contém o objetivo da aplicação, as decisões tomadas (e as recusadas), o modelo de dados, as regras de negócio e os pendentes. Após uma alteração que mude regras de negócio, esquema ou decisões, atualizar o SPEC.md no mesmo commit.

Regras práticas:
- Vocabulário da UI em português de Portugal: associado (não sócio), quota, joia, apuramento, saldo da gerência anterior.
- Alterações de esquema: nova migração idempotente em `supabase/migrations/` (terminar com `notify pgrst, 'reload schema';`) **e** atualizar `supabase/schema.sql`.
- Instalar dependências com `npm install --legacy-peer-deps`.
- Esta sessão pode fazer commit na pasta ligada, mas o push é feito pela Ana.
