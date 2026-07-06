import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/KpiCard";
import { useStore, lookup } from "@/lib/store";
import {
  fmtBRL,
  isToday,
  statusLabel,
  valorEfetivo,
  valorTotal,
  quantidadeTotal,
} from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, ChevronRight, Download, Inbox } from "lucide-react";
import { downloadCSV } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";
import type { ReturnStatus } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function Fila() {
  const devolucoes = useStore((s) => s.devolucoes);
  const setStatus = useStore((s) => s.setStatus);
  const empresas = useStore((s) => s.empresas);
  const plataformas = useStore((s) => s.plataformas);
  const modelos = useStore((s) => s.modelos);
  const pecas = useStore((s) => s.pecas);
  const motivos = useStore((s) => s.motivos);
  const [busca, setBusca] = useState("");
  const [expandido, setExpandido] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpandido((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const hoje = useMemo(
    () => devolucoes.filter((d) => isToday(d.createdAt)),
    [devolucoes],
  );

  const filtrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return hoje;
    return hoje.filter((d) => {
      const modelosTxt = d.itens.map((it) => lookup(modelos, it.modeloId)).join(" ");
      return [d.pedidoId, d.devolucaoId, modelosTxt, lookup(empresas, d.empresaId)]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [hoje, busca, modelos, empresas]);

  const stats = useMemo(() => {
    const resolvidas = hoje.filter((d) => d.status === "resolved");
    const disputas = hoje.filter((d) => d.status === "dispute");
    const perdas = hoje.filter((d) => d.status === "loss");
    const valorPerda = perdas.reduce((s, d) => s + valorEfetivo(d), 0);
    const itensTotal = hoje.reduce((s, d) => s + quantidadeTotal(d), 0);
    return {
      total: hoje.length,
      itensTotal,
      resolvidas: resolvidas.length,
      disputas: disputas.length,
      valorPerda,
    };
  }, [hoje]);

  const exportar = () => {
    const rows = hoje.flatMap((d) =>
      d.itens.map((it, idx) => ({
        Devolucao: d.devolucaoId,
        Pedido: d.pedidoId,
        Item: idx + 1,
        Empresa: lookup(empresas, d.empresaId),
        Plataforma: lookup(plataformas, d.plataformaId),
        Modelo: lookup(modelos, it.modeloId),
        Componente: lookup(pecas, it.pecaId),
        Cor: it.cor,
        Tamanho: it.tamanho,
        Motivo: lookup(motivos, d.motivoId),
        Quantidade: it.quantidade,
        ValorTotalItem: it.valor,
        Status: statusLabel[d.status],
      })),
    );
    downloadCSV(`devolucoes-hoje-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fila do dia"
        description={`Devoluções registradas hoje · ${new Date().toLocaleDateString("pt-BR", { dateStyle: "long" })}`}
        actions={
          <Button variant="outline" size="sm" onClick={exportar} disabled={!hoje.length}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Exportar CSV
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Devoluções"
          value={stats.total}
          sub={`${stats.itensTotal} itens no total`}
        />
        <KpiCard
          label="Resolvidas"
          value={stats.resolvidas}
          tone="success"
          sub="finalizadas"
        />
        <KpiCard
          label="Em disputa"
          value={stats.disputas}
          tone="warning"
          sub="aguardando"
        />
        <KpiCard
          label="Perda do dia"
          value={fmtBRL(stats.valorPerda)}
          tone="destructive"
          sub="confirmadas"
        />
      </div>

      <div className="rounded-lg border border-border bg-card shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium">Devoluções de hoje</h2>
          <Input
            placeholder="Buscar pedido, modelo…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="h-8 w-full max-w-xs text-sm"
          />
        </div>

        {filtrada.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Inbox}
              title={hoje.length ? "Nada encontrado" : "Sem registros hoje"}
              description={hoje.length ? "Tente outra busca." : "Vá para Registrar para iniciar."}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[36px]"></TableHead>
                  <TableHead className="w-[120px]">Pedido</TableHead>
                  <TableHead>Empresa · Plataforma</TableHead>
                  <TableHead>Itens</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrada.map((d) => {
                  const aberto = expandido.has(d.id);
                  const total = valorTotal(d);
                  const qtd = quantidadeTotal(d);
                  const principal = d.itens[0];
                  const restante = d.itens.length - 1;
                  return (
                    <>
                      <TableRow
                        key={d.id}
                        className={cn(restante > 0 && "cursor-pointer")}
                        onClick={() => restante > 0 && toggle(d.id)}
                      >
                        <TableCell className="text-muted-foreground">
                          {restante > 0 ? (
                            aberto ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {d.devolucaoId || d.pedidoId || "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="font-medium">{lookup(empresas, d.empresaId)}</div>
                          <div className="text-xs text-muted-foreground">
                            {lookup(plataformas, d.plataformaId)}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="font-medium">
                            {principal ? lookup(modelos, principal.modeloId) : "—"}
                          </span>
                          {restante > 0 && (
                            <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              +{restante} {restante === 1 ? "item" : "itens"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {lookup(motivos, d.motivoId)}
                        </TableCell>
                        <TableCell className="text-right tabular text-sm">{qtd}</TableCell>
                        <TableCell className={cn(
                          "text-right tabular text-sm font-medium",
                          d.status === "loss" && "text-destructive",
                        )}>
                          {(() => {
                            if (d.status === "pending") return "—";
                            const v = valorEfetivo(d);
                            if (v <= 0) return d.status === "dispute" ? "—" : fmtBRL(0);
                            return fmtBRL(v);
                          })()}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={d.status} />
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 px-2">
                                <ChevronDown className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {(["resolved", "dispute", "loss", "pending"] as ReturnStatus[]).map((s) => (
                                <DropdownMenuItem
                                  key={s}
                                  disabled={s === d.status}
                                  onClick={() => setStatus(d.id, s)}
                                >
                                  Marcar como {statusLabel[s].toLowerCase()}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                      {aberto && (
                        <TableRow key={`${d.id}-itens`} className="bg-surface-muted/40 hover:bg-surface-muted/40">
                          <TableCell colSpan={9} className="py-0">
                            <div className="px-6 py-3">
                              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                                Itens deste pedido
                              </div>
                              <div className="divide-y divide-border rounded-md border border-border bg-background">
                                {d.itens.map((it, idx) => (
                                  <div
                                    key={it.id}
                                    className="grid grid-cols-12 gap-2 px-3 py-2 text-sm items-center"
                                  >
                                    <div className="col-span-1 text-xs text-muted-foreground tabular">#{idx + 1}</div>
                                    <div className="col-span-4 font-medium">
                                      {lookup(modelos, it.modeloId)}
                                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                        · {lookup(pecas, it.pecaId)}
                                      </span>
                                    </div>
                                    <div className="col-span-2 text-xs text-muted-foreground">
                                      {it.cor || "—"}{it.tamanho ? ` · ${it.tamanho}` : ""}
                                    </div>
                                    <div className="col-span-2 text-right tabular text-xs">{it.quantidade} un.</div>
                                    <div className="col-span-3 text-right tabular text-sm font-medium">
                                      {fmtBRL(it.valor)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
