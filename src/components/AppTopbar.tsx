import { Sun, Moon, Search, Truck, User as UserIcon, LogOut, Shield } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useEffect } from "react";
import { fmtBRL, statusLabel, valorTotal } from "@/lib/format";
import { lookup } from "@/lib/store";
import { supabase } from "@/lib/supabase";

export function AppTopbar() {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const devolucoes = useStore((s) => s.devolucoes);
  const empresas = useStore((s) => s.empresas);
  const plataformas = useStore((s) => s.plataformas);
  const modelos = useStore((s) => s.modelos);
  const pedidosACaminho = useStore((s) => s.pedidosACaminho);
  const [user, setUser] = useState<{ email: string; name: string; initial: string } | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      const meta = (u.user_metadata ?? {}) as Record<string, string>;
      const name = meta.full_name || meta.name || (u.email ? u.email.split("@")[0] : "Usuário");
      setUser({
        email: u.email ?? "",
        name,
        initial: (name[0] ?? "U").toUpperCase(),
      });
    });
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    const hub = (import.meta.env.VITE_AUTH_HUB_URL as string) ?? "https://auth.vexodev.com.br";
    window.location.href = `${hub}?app=devolucoes&redirect=${encodeURIComponent(window.location.origin)}`;
  };

  const disputaCount = useMemo(
    () => devolucoes.filter((d) => d.status === "dispute").length,
    [devolucoes],
  );
  const aCaminhoCount = pedidosACaminho.length;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (!open && !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) {
        const k = e.key.toLowerCase();
        if (k === "r") navigate("/registrar");
        if (k === "a") navigate("/a-caminho");
        if (k === "f") navigate("/fila");
        if (k === "d") navigate("/disputas");
        if (k === "b") navigate("/dashboard");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate, open]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-border bg-background/85 px-5 backdrop-blur">
        <div className="flex flex-1 items-center gap-3">
          <button
            onClick={() => setOpen(true)}
            className="group flex w-full max-w-md items-center gap-2 rounded-md border border-border bg-surface-muted px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:bg-muted"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="flex-1 truncate">Buscar pedido, devolução, empresa…</span>
            <span className="kbd">⌘K</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {aCaminhoCount > 0 && (
            <button
              onClick={() => navigate("/a-caminho")}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary tabular hover:bg-primary-soft/80 transition-colors"
              title="Pedidos a caminho aguardando chegada"
            >
              <Truck className="h-3 w-3" />
              {aCaminhoCount} a caminho
            </button>
          )}
          {disputaCount > 0 && (
            <button
              onClick={() => navigate("/disputas")}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning-soft-foreground tabular hover:bg-warning-soft/80 transition-colors"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />
              {disputaCount} em disputa
            </button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label="Alternar tema"
            className="h-8 w-8"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Buscar pedidos, devoluções, navegação…" />
        <CommandList>
          <CommandEmpty>Nada encontrado.</CommandEmpty>
          <CommandGroup heading="Navegar">
            <CommandItem onSelect={() => { navigate("/registrar"); setOpen(false); }}>
              Registrar nova devolução
            </CommandItem>
            <CommandItem onSelect={() => { navigate("/a-caminho"); setOpen(false); }}>
              Pedidos a caminho {aCaminhoCount > 0 && `(${aCaminhoCount})`}
            </CommandItem>
            <CommandItem onSelect={() => { navigate("/fila"); setOpen(false); }}>
              Fila do dia
            </CommandItem>
            <CommandItem onSelect={() => { navigate("/disputas"); setOpen(false); }}>
              Disputas pendentes
            </CommandItem>
            <CommandItem onSelect={() => { navigate("/dashboard"); setOpen(false); }}>
              Dashboard
            </CommandItem>
            <CommandItem onSelect={() => { navigate("/configuracoes"); setOpen(false); }}>
              Configurações
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Devoluções recentes">
            {devolucoes.slice(0, 8).map((d) => {
              const principal = d.itens[0];
              const restante = d.itens.length - 1;
              const modeloLabel = principal ? lookup(modelos, principal.modeloId) : "—";
              return (
                <CommandItem
                  key={d.id}
                  value={`${d.devolucaoId} ${d.pedidoId} ${modeloLabel} ${lookup(empresas, d.empresaId)} ${lookup(plataformas, d.plataformaId)}`}
                  onSelect={() => { navigate("/fila"); setOpen(false); }}
                >
                  <div className="flex w-full items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {d.devolucaoId} · {modeloLabel}
                        {restante > 0 && (
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            +{restante}
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {lookup(empresas, d.empresaId)} · {lookup(plataformas, d.plataformaId)} · {statusLabel[d.status]}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground tabular">{fmtBRL(valorTotal(d))}</span>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
