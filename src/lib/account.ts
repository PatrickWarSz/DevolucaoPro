/**
 * account.ts — leitura simples de informações do usuário/workspace logado.
 *
 * Usa as MESMAS tabelas do EstoquePro (`usuarios`, `workspaces`) que ficam
 * no Supabase compartilhado (rqqiiwcxuhcsdizohodi). Por isso o login flui
 * naturalmente entre os dois apps via cookie .vexodev.com.br.
 */

import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export interface SubscriptionInfo {
  status: "trialing" | "active" | "past_due" | "canceled" | null;
  dataVencimento: string | null;
  asaasPortalUrl: string | null;
  planoAtual: string | null;
}

export interface CurrentUserInfo {
  userId: string;
  workspaceId: string;
  nome: string;
  email: string;
  isAdmin: boolean;
}

export interface Funcionario {
  id: string;
  nome: string;
  username: string;
  email: string;
  ativo: boolean;
  isAdmin: boolean;
  criadoEm: string;
}

/** Hook: retorna informações do usuário atual + workspace. */
export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        if (alive) {
          setUser(null);
          setLoading(false);
        }
        return;
      }
      const { data } = await supabase
        .from("usuarios")
        .select("id, workspace_id, nome, username, tipo")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (!alive) return;
      if (data) {
        setUser({
          userId: data.id,
          workspaceId: data.workspace_id,
          nome: data.nome,
          email: auth.user.email ?? data.username ?? "",
          isAdmin: data.tipo === "admin",
        });
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { user, loading };
}

/** Hook: status da assinatura do workspace atual (lê de `workspaces`). */
export function useSubscription(workspaceId: string | null) {
  const [info, setInfo] = useState<SubscriptionInfo>({
    status: null,
    dataVencimento: null,
    asaasPortalUrl: null,
    planoAtual: null,
  });
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!workspaceId) return;
    const { data } = await supabase
      .from("workspaces")
      .select("status_assinatura, data_vencimento, asaas_portal_url, plano_atual")
      .eq("id", workspaceId)
      .maybeSingle();
    if (data) {
      setInfo({
        status: data.status_assinatura as SubscriptionInfo["status"],
        dataVencimento: data.data_vencimento,
        asaasPortalUrl: data.asaas_portal_url,
        planoAtual: data.plano_atual,
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  return { info, loading, refresh };
}

/** Lista funcionários (não-admin) do workspace. */
export async function listFuncionarios(workspaceId: string): Promise<Funcionario[]> {
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nome, username, ativo, tipo, criado_em")
    .eq("workspace_id", workspaceId)
    .order("criado_em", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    nome: r.nome,
    username: r.username,
    email: r.username,
    ativo: r.ativo ?? true,
    isAdmin: r.tipo === "admin",
    criadoEm: r.criado_em,
  }));
}

/** Cria funcionário via edge function compartilhada do EstoquePro. */
export async function createFuncionario(input: {
  workspaceId: string;
  nome: string;
  username: string;
  password: string;
}): Promise<{ ok: boolean; error?: string; login?: string; id?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { ok: false, error: "Sessão expirada." };

  // Acesso total ao app de devoluções + estoque (visto que é tudo compartilhado)
  const permissoes = {
    estoque: true,
    pedidos: true,
    fornecedores: true,
    historico: true,
    scanner: true,
    etiquetas: true,
    somatorios: true,
    configuracoes: true,
    devolucoes: true,
  };

  const { data, error } = await supabase.functions.invoke("create-employee-auth", {
    body: {
      username: input.username,
      password: input.password,
      name: input.nome,
      permissions: permissoes,
      isAdmin: false,
      workspaceId: input.workspaceId,
      produto: "devolucoes_pro",
    },
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error || !data?.success) {
    return { ok: false, error: data?.error || error?.message || "Falha ao criar funcionário." };
  }
  return { ok: true, id: data.id, login: data.employeeLogin };
}

/** Revoga sessão ativa de um funcionário. */
export async function revokeFuncionarioSession(employeeId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { ok: false, error: "Sessão expirada." };
  const { data, error } = await supabase.functions.invoke("revoke-employee-session", {
    body: { employeeId },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error || data?.error) return { ok: false, error: data?.error || error?.message };
  return { ok: true };
}

/** Remove funcionário (auth + linha em `usuarios`). */
export async function deleteFuncionario(employeeId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { ok: false, error: "Sessão expirada." };
  const { data, error } = await supabase.functions.invoke("delete-auth-user", {
    body: { userId: employeeId },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error || data?.error) return { ok: false, error: data?.error || error?.message };
  return { ok: true };
}

/** Chama edge function asaas-checkout para criar/recuperar fatura. */
export async function asaasCheckout(workspaceId: string, plan: "monthly" | "annual"): Promise<{ ok: boolean; invoiceUrl?: string; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { ok: false, error: "Sessão expirada." };
  const { data, error } = await supabase.functions.invoke("asaas-checkout", {
    body: { workspaceId, plan, produto: "devolucoes_pro" },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error || data?.error) return { ok: false, error: data?.error || error?.message };
  return { ok: true, invoiceUrl: data?.invoiceUrl };
}

/** Cancela assinatura. */
export async function asaasCancel(workspaceId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { ok: false, error: "Sessão expirada." };
  const { data, error } = await supabase.functions.invoke("asaas-cancel-sub", {
    body: { workspaceId, produto: "devolucoes_pro" },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error || data?.error) return { ok: false, error: data?.error || error?.message };
  return { ok: true };
}
