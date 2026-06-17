import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    "[VEXO] Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não definidas. " +
    "Crie um arquivo .env.local na raiz do projeto."
  );
}

// GERENCIADOR DE COOKIES COMPARTILHADO (Igualzinho ao seu programa de Estoque)
const cookieStorage = {
  getItem: (key: string) => {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(new RegExp('(^| )' + key + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  },
  setItem: (key: string, value: string) => {
    if (typeof document === 'undefined') return;
    document.cookie = `${key}=${encodeURIComponent(value)}; domain=.vexodev.com.br; path=/; max-age=31536000; SameSite=Lax; secure`;
  },
  removeItem: (key: string) => {
    if (typeof document === 'undefined') return;
    document.cookie = `${key}=; domain=.vexodev.com.br; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: cookieStorage, // Trocado localStorage por cookieStorage!
    flowType: 'pkce',      // Alinhado com o fluxo do Estoque!
  },
});

// ──────────────────────────────────────────────
// Seus Helpers de autenticação originais (Mantidos intactos)
// ──────────────────────────────────────────────

/**
 * Permissões padrão para um novo usuário admin auto-provisionado
 * (acesso total ao módulo de devoluções).
 */
function defaultPermissoes() {
  return {
    estoque: true,
    pedidos: true,
    fornecedores: true,
    historico: true,
    scanner: true,
    etiquetas: true,
    configuracoes: true,
    devolucoes: true,
  };
}

/**
 * Garante que o usuário logado tenha uma linha em `usuarios` + um `workspace`
 * vinculado. Se já existir, apenas retorna o workspace_id. Caso contrário,
 * cria workspace + usuario (auto-provisionamento para quem entra direto pelo
 * Devoluções Pro sem ter passado pelo Estoque Pro).
 */
export async function getWorkspaceId(): Promise<string | null> {
  // 1. Usuário logado
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData.user) {
    console.error("[VEXO] getWorkspaceId: sem usuário autenticado.");
    return null;
  }
  const user = authData.user;

  // 2. Tenta achar a linha em `usuarios` (filtro explícito por id)
  const { data: row, error: selErr } = await supabase
    .from("usuarios")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (selErr) {
    console.error("[VEXO] getWorkspaceId select error:", selErr.message);
    return null;
  }
  if (row?.workspace_id) return row.workspace_id;

  // 3. Auto-provisionamento — não existe usuario nem workspace vinculado
  console.log("[VEXO] Provisionando workspace para novo usuário…");
  const meta = (user.user_metadata ?? {}) as Record<string, string>;
  const nome = meta.full_name || meta.name || (user.email?.split("@")[0] ?? "Usuário");
  const username = (user.email ?? `user_${user.id.slice(0, 8)}`).toLowerCase();
  // Documento placeholder (15d) — usuário pode atualizar depois nas configurações
  const placeholderDoc = `D${Date.now()}`.slice(0, 14);

  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 15);

  const { data: ws, error: wsErr } = await supabase
    .from("workspaces")
    .insert([
      {
        cnpj_cpf: placeholderDoc,
        nome_empresa: meta.company_name || `${nome} - Devoluções`,
        cpf_titular: placeholderDoc,
        status_assinatura: "trialing",
        plano_atual: "devolucoes_pro",
        data_vencimento: trialEnd.toISOString(),
      },
    ])
    .select("id")
    .single();

  if (wsErr || !ws) {
    console.error("[VEXO] getWorkspaceId: falha ao criar workspace:", wsErr?.message);
    return null;
  }

  const { error: uErr } = await supabase.from("usuarios").insert([
    {
      id: user.id,
      workspace_id: ws.id,
      nome,
      username,
      tipo: "admin",
      permissoes: defaultPermissoes(),
      ativo: true,
      senha_hash: "managed_by_auth",
    },
  ]);

  if (uErr) {
    console.error("[VEXO] getWorkspaceId: falha ao criar usuario:", uErr.message);
    return null;
  }

  return ws.id;
}

/** Retorna a sessão atual. Null se não autenticado. */
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/** Listener de mudança de estado de auth — use no AppLayout. */
export function onAuthChange(
  cb: (event: string, userId: string | null) => void
) {
  return supabase.auth.onAuthStateChange((event, session) => {
    cb(event, session?.user?.id ?? null);
  });
}