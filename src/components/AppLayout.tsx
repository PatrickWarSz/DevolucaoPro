/**
 * AppLayout.tsx — VEXO DevolucaoPro
 *
 * Responsabilidades adicionadas vs. versão original:
 *  1. Detecta sessão Supabase (auth guard)
 *  2. Chama store.initialize() uma vez após auth confirmada
 *  3. Exibe loading spinner enquanto carrega dados
 *  4. Redireciona para o hub de login VEXO se não autenticado
 */

import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { AppTopbar } from "./AppTopbar";
import { MobileNav } from "./MobileNav";
import { InstallPrompt } from "./InstallPrompt";
import { OfflineBanner } from "./OfflineBanner";
import { BrandedLoader } from "./BrandedLoader";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/lib/supabase";
import { useStore } from "@/lib/store";


// ─── URL do hub de autenticação VEXO ───────────────────────────────────────
// Quando não autenticado, o usuário é redirecionado para cá.
const AUTH_HUB_URL = import.meta.env.VITE_AUTH_HUB_URL ?? "https://auth.vexodev.com.br";

// ─── Query param que o hub usa para indicar o módulo de destino ─────────────
// Ex: auth.vexodev.com.br?redirect=devolucoes.vexodev.com.br
const REDIRECT_PARAM = `?app=devolucoes&redirect=${encodeURIComponent(window.location.origin)}`;

export function AppLayout() {
  useTheme();

  const initialize   = useStore((s) => s.initialize);
  const _initialized = useStore((s) => s._initialized);
  const _loading     = useStore((s) => s._loading);

  const [authChecked, setAuthChecked] = useState(false);
  const [authed, setAuthed]           = useState(false);

  // ── 1. Verifica sessão ao montar ──────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setAuthed(true);
      } else {
        // Sem sessão → redireciona para o hub de login
        window.location.href = `${AUTH_HUB_URL}${REDIRECT_PARAM}`;
      }
      setAuthChecked(true);
    });

    // Listener para mudanças de sessão (logout externo, token expirado)
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        window.location.href = `${AUTH_HUB_URL}${REDIRECT_PARAM}`;
      }
      if (event === "SIGNED_IN" && session) {
        setAuthed(true);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // ── 2. Inicializa store quando auth estiver confirmada ────────────────────
  useEffect(() => {
    if (authed && !_initialized && !_loading) {
      initialize();
    }
  }, [authed, _initialized, _loading, initialize]);

  // ── 3. Loading state ──────────────────────────────────────────────────────
  const isLoading = !authChecked || (authed && !_initialized);

  if (isLoading) {
    return <BrandedLoader />;
  }


  // ── 4. Layout principal ───────────────────────────────────────────────────
  return (
    <div
      className="flex min-h-screen w-full bg-background"
      style={{
        paddingTop:   "env(safe-area-inset-top)",
        paddingLeft:  "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner />
        <AppTopbar />
        <main className="flex-1 px-4 py-5 md:px-8 md:py-7 pb-[calc(env(safe-area-inset-bottom)+72px)] md:pb-7">
          <div className="mx-auto w-full max-w-[1400px] animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
      <MobileNav />
      <InstallPrompt />
    </div>
  );
}
