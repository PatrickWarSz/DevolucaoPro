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

/** Retorna o ID do workspace do usuário logado (via tabela `usuarios`). */
export async function getWorkspaceId(): Promise<string | null> {
  const { data, error } = await supabase
    .from("usuarios")
    .select("workspace_id")
    .maybeSingle();
  if (error) {
    console.error("[VEXO] getWorkspaceId error:", error.message);
    return null;
  }
  return data?.workspace_id ?? null;
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