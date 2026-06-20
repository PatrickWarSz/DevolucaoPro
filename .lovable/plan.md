
# Plano: Assinatura Asaas + Funcionários no Devoluções Pro

Os dois apps (Estoque Pro e Devoluções Pro) já compartilham o mesmo backend de auth (mesmo Supabase, mesmo cookie `.vexodev.com.br`, mesmas tabelas `workspaces` e `usuarios`). Esse é o motivo do login automático que você curtiu. Vamos aproveitar isso para reutilizar tudo que o Estoque já tem, sem duplicar infra.

## 1. Painel de Assinatura (Configurações → Assinatura)

Nova aba na página `Configuracoes.tsx` chamada **Assinatura**, espelhando o `SubscriptionPanel` do Estoque, mas com identidade do Devoluções:

- Mostra status atual (Trial / Ativo / Vencido / Cancelado) lendo `workspaces.status_assinatura` e `data_vencimento`.
- Botão **Assinar Mensal (R$ 19,90/mês)** e **Assinar Anual** (preço anual a definir depois — campo deixado configurável no código).
- Botão **Gerenciar pagamento** que abre `asaas_portal_url`.
- Botão **Cancelar assinatura**.
- Reusa as edge functions já existentes no Supabase do Estoque: `asaas-customer`, `asaas-checkout`, `asaas-upgrade-sub`, `asaas-cancel-sub`. Vamos passar um parâmetro novo `produto: "devolucoes_pro"` no body para que, no futuro, o webhook saiba qual plano marcar.
- Trial de **15 dias** para quem entrar pela primeira vez no Devoluções sem ter Estoque: já existe auto-provisionamento em `getWorkspaceId()` (cria workspace com `status_assinatura: "trialing"` e `data_vencimento: +15d`). Vamos só garantir que `plano_atual` fique `"devolucoes_pro"` quando o app de origem for esse.

**Importante (decisão sua):** por enquanto o acesso continua **livre** mesmo após o trial vencer. O painel mostra status mas não bloqueia. O bloqueio efetivo entra junto quando o Asaas estiver 100% funcional para o Devoluções (fase futura).

## 2. Funcionários (versão simplificada)

Nova página `/funcionarios` no menu lateral, visível apenas para o admin do workspace:

- Lista os funcionários do workspace (lê de `usuarios` filtrado por `workspace_id` e `tipo != 'admin'`).
- Botão **Adicionar funcionário** → modal com nome, e-mail e senha. Chama a edge function já existente `create-employee-auth` (Estoque) com `permissoes: { devolucoes: true }` (acesso total ao app de devoluções, igual ao admin).
- Botão **Remover** por linha → chama `delete-auth-user`.
- Botão **Revogar sessão** por linha → chama `revoke-employee-session`.
- Sem toggles de permissão por módulo (você confirmou: simplificado, acesso total).

`RequireAuth` simples para a rota: só admin entra.

## 3. Login compartilhado (manter como está)

Nada muda na auth. O comportamento mágico que você gostou (logar no Estoque entra no Devoluções, e vice-versa) é consequência do cookie compartilhado `.vexodev.com.br` em `src/lib/supabase.ts` + tabela `usuarios` única. Vamos só garantir que o funcionário criado pelo Estoque com `permissoes.devolucoes = true` consiga entrar aqui (já consegue) e que funcionário criado aqui também apareça lá (também já vai, pois é a mesma tabela).

## 4. O que NÃO entra agora

- Bloqueio de acesso por trial vencido / assinatura inativa.
- Cobrança real do Devoluções no Asaas (webhook diferenciando produtos, preço anual definitivo, desconto de pacote / upgrade).
- Permissões granulares por página dentro do Devoluções.

Esses ficam para a fase em que o Asaas do Devoluções estiver maduro — o painel de assinatura já fica plugado e visível desde agora, só não corta acesso.

## Detalhes técnicos

- **Arquivos novos:**
  - `src/components/settings/SubscriptionPanel.tsx` (adaptado do Estoque)
  - `src/pages/Funcionarios.tsx`
  - `src/components/auth/RequireAdmin.tsx`
- **Arquivos editados:**
  - `src/pages/Configuracoes.tsx` — adiciona aba "Assinatura".
  - `src/App.tsx` — registra rota `/funcionarios`.
  - `src/components/AppSidebar.tsx` — adiciona item "Funcionários" (só para admin).
  - `src/lib/supabase.ts` — expõe helper `useSubscription()` (status + portalUrl) lendo de `workspaces`.
  - `src/lib/auth-store.ts` (novo, espelhando o do Estoque mas enxuto: só admin/employees CRUD).
- **Backend:** zero edge functions novas, zero migrations. Reaproveita 100% o que o Estoque já publicou no Supabase compartilhado (`rqqiiwcxuhcsdizohodi`).
- **Parâmetro novo:** chamadas a `asaas-checkout` / `asaas-customer` passam `produto: "devolucoes_pro"` no body. Se a função do Estoque ignorar o campo hoje, não quebra nada — fica preparado para quando ela passar a usar.

Posso seguir nessa direção?
