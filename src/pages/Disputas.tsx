import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/KpiCard";
import { useStore, lookup } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ShieldAlert, Calendar, Trophy, X, Package, Clock, AlertTriangle, Trash2 } from "lucide-react";
import { fmtBRL, fmtDate, daysBetween, valorTotal, quantidadeTotal } from "@/lib/format";
import { avaliarPrazo, prazoStatusOrder, type PrazoInfo, type PrazoStatus } from "@/lib/disputaPrazo";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Devolucao } from "@/lib/types";

type ResolucaoKind = "win" | "loss";

interface ResolucaoState {
  devolucao: Devolucao;
  kind: ResolucaoKind;
}

const prazoBadgeCls: Record<PrazoStatus, string> = {
  ok: "bg-muted text-muted-foreground",
  proximo: "bg-warning-soft text-warning-soft-foreground border border-warning/30",
  vencido: "bg-destructive-soft text-destructive-soft-foreground border border-destructive/30",
  atrasado: "bg-destructive text-destructive-foreground",
};

export default function Disputas() {
  const devolucoes = useStore((s) => s.devolucoes);
  const setStatus = useStore((s) => s.setStatus);
  const deleteDevolucao = useStore((s) => s.deleteDevolucao);
  const empresas = useStore((s) => s.empresas);
  const plataformas = useStore((s) => s.plataformas);
  const modelos = useStore((s) => s.modelos);
  const pecas = useStore((s) => s.pecas);
  const motivos = useStore((s) => s.motivos);
  const { toast } = useToast();

  const [resolucao, setResolucao] = useState<ResolucaoState | null>(null);
  const [valorFinal, setValorFinal] = useState("");
  const [excluir, setExcluir] = useState<Devolucao | null>(null);

  const disputas = useMemo(
    () =>
      devolucoes
        .filter((d) => d.status === "dispute" || d.status === "pending")
        .map((d) => ({ d, prazo: avaliarPrazo(d, plataformas) }))
        .sort((a, b) => {
          const so = prazoStatusOrder[a.prazo.status] - prazoStatusOrder[b.prazo.status];
          if (so !== 0) return so;
          return a.d.createdAt.localeCompare(b.d.createdAt);
        }),
    [devolucoes, plataformas],
  );

  const stats = useMemo(() => {
    const valorRisco = disputas.reduce((s, x) => s + Number(x.d.valorRecuperado ?? 0), 0);
    const vencidas = disputas.filter(
      (x) => x.prazo.status === "vencido" || x.prazo.status === "atrasado",
    );
    const proximas = disputas.filter((x) => x.prazo.status === "proximo");
    const maisAntiga = disputas[disputas.length - 1]?.d.createdAt
      ? disputas.reduce((acc, x) =>
          x.d.createdAt < acc.d.createdAt ? x : acc,
        disputas[0]).d.createdAt
      : undefined;
    return {
      total: disputas.length,
      valorRisco,
      vencidas: vencidas.length,
      proximas: proximas.length,
      maisAntigaDias: maisAntiga ? daysBetween(maisAntiga) : 0,
      maisAntigaData: maisAntiga,
    };
  }, [disputas]);

  const abrirResolucao = (d: Devolucao, kind: ResolucaoKind) => {
    setResolucao({ devolucao: d, kind });
    // Prefill com o valor em disputa informado no registro (se houver).
    // Esse é o valor que o operador colocou em risco — é o que deve ser
    // recuperado (ganho) ou perdido, e não o bruto do pedido.
    const emDisputa = Number(d.valorRecuperado ?? 0);
    setValorFinal(emDisputa > 0 ? String(emDisputa) : "");
  };

  const fecharResolucao = () => {
    setResolucao(null);
    setValorFinal("");
  };

  const confirmar = () => {
    if (!resolucao) return;
    const v = Number(valorFinal);
    if (Number.isNaN(v) || v < 0) {
      toast({ title: "Valor inválido", variant: "destructive" });
      return;
    }
    const emDisputa = Number(resolucao.devolucao.valorRecuperado ?? 0);

    if (resolucao.kind === "win") {
      setStatus(resolucao.devolucao.id, "resolved", v);
      toast({
        title: "Disputa ganha 🏆",
        description: `${fmtBRL(v)} recuperados${emDisputa > 0 && v !== emDisputa ? ` (em disputa: ${fmtBRL(emDisputa)})` : ""}.`,
      });
    } else {
      setStatus(resolucao.devolucao.id, "loss", v);
      toast({
        title: "Perda registrada",
        description: `${fmtBRL(v)} confirmados como perda${emDisputa > 0 && v !== emDisputa ? ` (em disputa: ${fmtBRL(emDisputa)})` : ""}.`,
        variant: "destructive",
      });
    }
    fecharResolucao();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Disputas e pendências"
        description="Disputas abertas + devoluções aguardando o valor final da plataforma. Marque Ganhei ou Perdi quando a resolução chegar."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Em disputa agora"
          value={stats.total}
          tone="warning"
          icon={<ShieldAlert className="h-4 w-4" />}
          sub="pedidos pendentes"
        />
        <KpiCard
          label="Prazo vencido"
          value={stats.vencidas}
          tone={stats.vencidas > 0 ? "destructive" : "default"}
          icon={<AlertTriangle className="h-4 w-4" />}
          sub="verificar agora"
        />
        <KpiCard
          label="Vencendo"
          value={stats.proximas}
          tone={stats.proximas > 0 ? "warning" : "default"}
          icon={<Clock className="h-4 w-4" />}
          sub="≤ 1 dia restante"
        />
        <KpiCard
          label="Valor em risco"
          value={fmtBRL(stats.valorRisco)}
          tone="warning"
          sub={
            stats.maisAntigaData
              ? `mais antiga: ${stats.maisAntigaDias}d (${fmtDate(stats.maisAntigaData)})`
              : "—"
          }
          icon={<Calendar className="h-4 w-4" />}
        />
      </div>

      {(stats.vencidas > 0 || stats.proximas > 0) && (
        <div className="rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Há disputas que precisam de verificação</p>
            <p className="text-xs opacity-90 mt-0.5">
              {stats.vencidas > 0 && (
                <>
                  <strong>{stats.vencidas}</strong> {stats.vencidas === 1 ? "disputa passou" : "disputas passaram"} do prazo da plataforma
                </>
              )}
              {stats.vencidas > 0 && stats.proximas > 0 && " · "}
              {stats.proximas > 0 && (
                <>
                  <strong>{stats.proximas}</strong> {stats.proximas === 1 ? "vence" : "vencem"} em 1 dia ou menos
                </>
              )}
              . Confira o ID do pedido na plataforma e atualize o status.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card shadow-xs">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium">Casos pendentes</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ordenados por urgência: vencidas → próximas do prazo → no prazo
          </p>
        </div>

        {disputas.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Trophy}
              title="Sem disputas em aberto"
              description="Bom trabalho. Todas as devoluções foram resolvidas."
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {disputas.map(({ d, prazo }) => {
              const total = valorTotal(d);
              const qtd = quantidadeTotal(d);
              const principal = d.itens[0];
              const restante = d.itens.length - 1;
              return (
                <li key={d.id} className="px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex-1 min-w-[260px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">
                          {principal ? lookup(modelos, principal.modeloId) : "—"}
                          {principal && (
                            <span className="text-muted-foreground"> · {lookup(pecas, principal.pecaId)}</span>
                          )}
                        </p>
                        {restante > 0 && (
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground inline-flex items-center gap-1">
                            <Package className="h-2.5 w-2.5" />
                            +{restante} {restante === 1 ? "item" : "itens"}
                          </span>
                        )}
                        <PrazoBadge prazo={prazo} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        <span className="font-mono">{d.devolucaoId || d.pedidoId}</span> ·{" "}
                        {lookup(empresas, d.empresaId)} · {lookup(plataformas, d.plataformaId)} ·{" "}
                        {lookup(motivos, d.motivoId)} · {qtd} un. · aberta há {prazo.diasAberta}d (prazo {prazo.prazo}d)
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-warning tabular min-w-[80px] text-right">
                        {fmtBRL(total)}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-success/40 bg-success-soft text-success-soft-foreground hover:bg-success-soft/80"
                        onClick={() => abrirResolucao(d, "win")}
                      >
                        <Trophy className="h-3.5 w-3.5 mr-1" />
                        Ganhei
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-destructive/40 bg-destructive-soft text-destructive-soft-foreground hover:bg-destructive-soft/80"
                        onClick={() => abrirResolucao(d, "loss")}
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        Perdi
                      </Button>
                      <button
                        type="button"
                        onClick={() => setExcluir(d)}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive-soft/40 transition-colors"
                        aria-label="Excluir registro"
                        title="Excluir registro"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {restante > 0 && (
                    <div className="mt-2 ml-1 flex flex-wrap gap-1.5">
                      {d.itens.slice(1).map((it) => (
                        <span
                          key={it.id}
                          className="rounded-md border border-border bg-surface-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {lookup(modelos, it.modeloId)} · {it.cor || "—"} · {it.quantidade}un · {fmtBRL(it.valor)}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog
        open={!!resolucao}
        onOpenChange={(o) => {
          if (!o) fecharResolucao();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {resolucao?.kind === "win"
                ? "Confirmar disputa ganha"
                : "Confirmar perda da disputa"}
            </DialogTitle>
            <DialogDescription>
              {resolucao?.kind === "win"
                ? "Informe o valor total efetivamente recuperado nesta devolução."
                : "Informe o valor final perdido. Algumas plataformas (ex: Shopee) aplicam taxas que só são definidas após a finalização da disputa."}
              {resolucao && resolucao.devolucao.itens.length > 1
                ? ` (${resolucao.devolucao.itens.length} itens)`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">
                {resolucao?.kind === "win" ? "Valor recuperado (R$)" : "Valor da perda (R$)"}
              </Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={valorFinal}
                onChange={(e) => setValorFinal(e.target.value)}
                autoFocus
                className="tabular"
              />
              {resolucao && (
                <p className="text-xs text-muted-foreground">
                  Valor bruto da devolução: {fmtBRL(valorTotal(resolucao.devolucao))}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={fecharResolucao}>
              Cancelar
            </Button>
            <Button
              onClick={confirmar}
              variant={resolucao?.kind === "loss" ? "destructive" : "default"}
            >
              {resolucao?.kind === "win" ? "Confirmar recuperação" : "Confirmar perda"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!excluir} onOpenChange={(o) => !o && setExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registro de devolução?</AlertDialogTitle>
            <AlertDialogDescription>
              {excluir && (
                <>
                  Você vai remover permanentemente o pedido{" "}
                  <span className="font-mono font-medium">
                    {excluir.devolucaoId || excluir.pedidoId || "(sem ID)"}
                  </span>
                  {" "}({fmtBRL(valorTotal(excluir))}). Esta ação não pode ser desfeita.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!excluir) return;
                deleteDevolucao(excluir.id);
                toast({
                  title: "Registro excluído",
                  description: `${excluir.devolucaoId || excluir.pedidoId || "Pedido"} removido.`,
                });
                setExcluir(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PrazoBadge({ prazo }: { prazo: PrazoInfo }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-medium tabular inline-flex items-center gap-1",
        prazoBadgeCls[prazo.status],
      )}
    >
      <Clock className="h-2.5 w-2.5" />
      {prazo.label}
    </span>
  );
}
