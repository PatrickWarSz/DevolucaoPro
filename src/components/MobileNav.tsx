import { NavLink, useLocation } from "react-router-dom";
import {
  PlusCircle,
  ListChecks,
  ShieldAlert,
  BarChart3,
  Truck,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

const items = [
  { to: "/registrar", label: "Registrar", icon: PlusCircle },
  { to: "/a-caminho", label: "A Caminho", icon: Truck },
  { to: "/fila", label: "Fila", icon: ListChecks },
  { to: "/disputas", label: "Disputas", icon: ShieldAlert },
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
];

export function MobileNav() {
  const location = useLocation();
  const devolucoes = useStore((s) => s.devolucoes);
  const pedidosACaminho = useStore((s) => s.pedidosACaminho);
  const disputaCount = useMemo(
    () => devolucoes.filter((d) => d.status === "dispute").length,
    [devolucoes],
  );

  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex items-stretch justify-between px-1">
        {items.map((item) => {
          const active = location.pathname === item.to;
          const Icon = item.icon;
          const badge =
            item.to === "/disputas" && disputaCount > 0
              ? disputaCount
              : item.to === "/a-caminho" && pedidosACaminho.length > 0
                ? pedidosACaminho.length
                : null;
          return (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="truncate">{item.label}</span>
                {badge != null && (
                  <span className="absolute top-1 right-1/2 translate-x-3 min-w-[1rem] rounded-full bg-warning px-1 text-[9px] font-bold text-warning-foreground tabular leading-tight">
                    {badge}
                  </span>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
