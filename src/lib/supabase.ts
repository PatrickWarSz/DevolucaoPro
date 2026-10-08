import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    "[VEXO] Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não definidas. " +
    "Crie um arquivo .env.local na raiz do projeto."
  );
}

// ─── ARMAZENAMENTO DA SESSÃO ────────────────────────────────────────────────
// - A sessão PRÓPRIA do DevoluçõesPro fica no localStorage deste domínio
//   (sem limite de 4KB de cookie) → sair daqui não desloga o Estoque Pro.
// - Se ainda não houver sessão própria, herda a do hub de login VEXO, que fica
//   em cookie compartilhado .vexodev.com.br (inteiro ou dividido em pedaços
//   key.0, key.1… como o Estoque Pro grava).
const OWN_KEY = 'vexo-devolucoes-auth';
const HUB_KEY = 'sb-rqqiiwcxuhcsdizohodi-auth-token';
// Guarda o refresh_token do hub no momento do "Sair" para não re-herdar a
// mesma sessão logo após sair. Um novo login no hub gera outro token.
const LOGOUT_MARK = 'vexo-devolucoes-logout-mark';

const readCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp('(^| )' + esc + '=([^;]*)'));
  return match && match[2] ? decodeURIComponent(match[2]) : null;
};
const readCookieValue = (key: string): string | null => {
  const single = readCookie(key);
  if (single) return single;
  let out = '';
  for (let i = 0; i < 10; i++) {
    const part = readCookie(`${key}.${i}`);
    if (!part) break;
    out += part;
  }
  return out || null;
};
const refreshTokenOf = (raw: string | null): string | null => {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    return s?.refresh_token ?? s?.currentSession?.refresh_token ?? null;
  } catch {
    return null;
  }
};
const safeLocal = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

/** Lê a sessão do hub (cookie compartilhado), respeitando o "Sair" local. */
function readHubSession(): string | null {
  const hub = readCookieValue(HUB_KEY);
  if (!hub) return null;
  const mark = safeLocal.get(LOGOUT_MARK);
  if (mark && mark === refreshTokenOf(hub)) return null;
  return hub;
}

const sessionStorageAdapter = {
  getItem: (key: string) => {
    if (typeof window === 'undefined') return null;
    const own = safeLocal.get(key);
    if (own) return own;
    if (key === OWN_KEY) {
      // Limpa cookie antigo (versões anteriores gravavam a sessão própria em cookie)
      const legacy = readCookie(OWN_KEY);
      if (legacy) {
        document.cookie = `${OWN_KEY}=; domain=.vexodev.com.br; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      }
      return readHubSession();
    }
    return null;
  },
  setItem: (key: string, value: string) => {
    safeLocal.set(key, value);
    if (key === OWN_KEY) safeLocal.del(LOGOUT_MARK);
  },
  removeItem: (key: string) => {
    safeLocal.del(key);
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: sessionStorageAdapter,
    storageKey: OWN_KEY,
    flowType: 'pkce',
  },
});

/** Sai SOMENTE do DevoluçõesPro (não mexe no Estoque Pro nem no hub). */
export async function signOutLocal() {
  const hubToken = refreshTokenOf(readCookieValue(HUB_KEY));
  await supabase.auth.signOut({ scope: 'local' });
  safeLocal.del(OWN_KEY);
  if (hubToken) safeLocal.set(LOGOUT_MARK, hubToken);
}

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