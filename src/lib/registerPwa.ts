/**
 * Guarded PWA service worker registration.
 * Never registers in dev / Lovable preview / iframe. Supports ?sw=off kill-switch.
 */
const SW_URL = "/sw.js";

function isRefusedContext(): boolean {
  if (!import.meta.env.PROD) return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const host = window.location.hostname;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return true;
  if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return true;
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return true;
  if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  return false;
}

async function unregisterMatching() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((r) => {
          const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
          return url.endsWith(SW_URL);
        })
        .map((r) => r.unregister()),
    );
  } catch {
    /* ignore */
  }
}

export function registerPwa() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  if (isRefusedContext()) {
    void unregisterMatching();
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(SW_URL, { scope: "/" })
      .then((registration) => {
        // Checa por versão nova a cada 15 minutos, mesmo com a aba aberta
        // (sem isso, o navegador só verifica em navegações/reloads, o que
        // pode demorar horas se a pessoa deixar o app aberto o dia todo).
        setInterval(() => {
          registration.update().catch(() => {
            /* offline ou falha temporária — ignora, tenta de novo no próximo ciclo */
          });
        }, 15 * 60 * 1000);
      })
      .catch(() => {
        /* registration may fail offline — ignore */
      });
  });

  // Rede de segurança do "autoUpdate": quando o Service Worker novo assume
  // o controle da página, a aba recarrega sozinha uma única vez pra buscar
  // o JS/CSS novo. Sem isso, quem já está com o app aberto continua rodando
  // código antigo mesmo depois do SW novo já ter assumido.
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}
