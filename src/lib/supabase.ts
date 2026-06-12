import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    "[VEXO] Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não definidas. " +
    "Crie um arquivo .env.local na raiz do projeto."
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,     // mantém sessão no localStorage do browser
    detectSessionInUrl: true, // captura tokens no hash da URL (redirect do auth hub)
  },
});

// ──────────────────────────────────────────────
// Helpers de autenticação
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