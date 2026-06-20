import { NavLink, useLocation } from "react-router-dom";
import {
  PlusCircle,
  ListChecks,
  ShieldAlert,
  BarChart3,
  Settings,
  Truck,
  Users,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

const items = [
  { to: "/registrar", label: "Registrar", icon: PlusCircle, kbd: "R" },
  { to: "/a-caminho", label: "A Caminho", icon: Truck, kbd: "A" },
  { to: "/fila", label: "Fila do Dia", icon: ListChecks, kbd: "F" },
  { to: "/disputas", label: "Disputas", icon: ShieldAlert, kbd: "D" },
  { to: "/dashboard", label: "Dashboard", icon: BarChart3, kbd: "B" },
];

export function AppSidebar() {
  const location = useLocation();
  const devolucoes = useStore((s) => s.devolucoes);
  const pedidosACaminho = useStore((s) => s.pedidosACaminho);
  const disputaCount = useMemo(
    () => devolucoes.filter((d) => d.status === "dispute").length,
    [devolucoes],
  );
  const aCaminhoCount = pedidosACaminho.length;

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Brand — DevoluçõesPro by VEXO */}
      <div className="flex items-center gap-3 px-3 py-3 border-b border-sidebar-border">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground text-background shadow-sm mono text-[11px] font-medium">
          <span className="text-primary">&gt;</span>
          <span className="px-0.5">V</span>
          <span className="text-primary">&lt;</span>
        </div>
        <div className="flex flex-col leading-tight min-w-0">
          <span className="mono text-[11px] font-medium tracking-[0.18em] text-foreground">
            <span className="text-primary">&gt;</span> V E X O <span className="text-primary">&lt;</span>
          </span>
          <span className="font-display text-[14px] font-semibold tracking-tight text-foreground truncate">
            DevoluçõesPro
          </span>
          <span className="vexo-tagline">software &amp; solutions</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3">
        <p className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Operação
        </p>
        <ul className="space-y-0.5">
          {items.map((item) => {
            const active = location.pathname === item.to;
            const Icon = item.icon;
            const showDisputaBadge = item.to === "/disputas" && disputaCount > 0;
            const showCaminhoBadge = item.to === "/a-caminho" && aCaminhoCount > 0;
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/60",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <span className="flex-1 truncate">{item.label}</span>
                  {showDisputaBadge && (
                    <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium text-warning-soft-foreground tabular">
                      {disputaCount}
                    </span>
                  )}
                  {showCaminhoBadge && (
                    <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium text-primary tabular">
                      {aCaminhoCount}
                    </span>
                  )}
                  <span className="kbd opacity-0 group-hover:opacity-100 transition-opacity">
                    {item.kbd}
                  </span>
                </NavLink>
              </li>
            );
          })}
        </ul>

        <p className="mt-5 mb-1.5 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Sistema
        </p>
        <ul className="space-y-0.5">
          <li>
            <NavLink
              to="/configuracoes"
              className={({ isActive }) =>
                cn(
                  "group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60",
                )
              }
            >
              <Settings className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1">Configurações</span>
            </NavLink>
          </li>
        </ul>
      </nav>

      {/* Selo de endosso powered by >VEXO< — rodapé absoluto da sidebar */}
      <div className="border-t border-sidebar-border px-4 py-3">
        <p className="text-[10px] text-muted-foreground">
          powered by <span className="vexo-wordmark text-[11px]"><span className="op">&gt;</span>VEXO<span className="op">&lt;</span></span>
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {devolucoes.length} registros · <span className="kbd">?</span> atalhos
        </p>
      </div>
    </aside>
  );
}
