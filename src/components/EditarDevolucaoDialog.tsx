import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import type { Devolucao, DevolucaoItem, ReturnStatus } from "@/lib/types";
import { statusLabel } from "@/lib/format";

interface Props {
  devolucao: Devolucao | null;
  onClose: () => void;
}

const localUid = () => `tmp-${Math.random().toString(36).slice(2, 9)}`;

const toDateInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function EditarDevolucaoDialog({ devolucao, onClose }: Props) {
  const empresas = useStore((s) => s.empresas);
  const plataformas = useStore((s) => s.plataformas);
  const modelos = useStore((s) => s.modelos);
  const pecas = useStore((s) => s.pecas);
  const motivos = useStore((s) => s.motivos);
  const updateDevolucao = useStore((s) => s.updateDevolucao);
  const { toast } = useToast();

  const [dataStr, setDataStr] = useState("");
  const [empresaId, setEmpresaId] = useState("");
  const [plataformaId, setPlataformaId] = useState("");
  const [pedidoId, setPedidoId] = useState("");
  const [devolucaoId, setDevolucaoIdStr] = useState("");
  const [motivoId, setMotivoId] = useState("");
  const [status, setStatus] = useState<ReturnStatus>("resolved");
  const [valor, setValor] = useState("");
  const [notas, setNotas] = useState("");
  const [itens, setItens] = useState<DevolucaoItem[]>([]);

  useEffect(() => {
    if (!devolucao) return;
    setDataStr(toDateInput(devolucao.createdAt));
    setEmpresaId(devolucao.empresaId);
    setPlataformaId(devolucao.plataformaId);
    setPedidoId(devolucao.pedidoId);
    setDevolucaoIdStr(devolucao.devolucaoId);
    setMotivoId(devolucao.motivoId);
    setStatus(devolucao.status);
    setValor(devolucao.valorRecuperado != null ? String(devolucao.valorRecuperado) : "");
    setNotas(devolucao.notas ?? "");
    setItens(devolucao.itens.map((it) => ({ ...it })));
  }, [devolucao]);

  const valorLabel = useMemo(() => {
    if (status === "loss") return "Valor da perda (R$)";
    if (status === "dispute") return "Valor em disputa (R$)";
    if (status === "resolved") return "Valor recuperado (R$)";
    return "Valor (R$)";
  }, [status]);

  const salvar = () => {
    if (!devolucao) return;
    if (!dataStr) {
      toast({ title: "Data obrigatória", variant: "destructive" });
      return;
    }
    // Preserva hora/minuto originais para não bagunçar a ordenação
    const orig = new Date(devolucao.createdAt);
    const [ano, mes, dia] = dataStr.split("-").map(Number);
    const novaData = new Date(orig);
    novaData.setFullYear(ano, mes - 1, dia);
    const createdAt = novaData.toISOString();
    const competencia = `${ano}-${String(mes).padStart(2, "0")}`;

    const valorNum = valor.trim() === "" ? undefined : Number(valor);
    if (valorNum != null && Number.isNaN(valorNum)) {
      toast({ title: "Valor inválido", variant: "destructive" });
      return;
    }

    const itensValidos = itens.filter((it) => it.modeloId && Number(it.quantidade) > 0);
    if (itensValidos.length === 0) {
      toast({ title: "Adicione ao menos um item", variant: "destructive" });
      return;
    }

    updateDevolucao(devolucao.id, {
      createdAt,
      competencia,
      empresaId,
      plataformaId,
      pedidoId: pedidoId.trim(),
      devolucaoId: devolucaoId.trim(),
      motivoId,
      status,
      valorRecuperado: valorNum,
      notas: notas.trim() || undefined,
      itens: itensValidos,
    });

    toast({
      title: "Devolução atualizada",
      description: `${pedidoId || devolucaoId || "Registro"} — mudanças refletidas no dashboard.`,
    });
    onClose();
  };

  const atualizarItem = (id: string, patch: Partial<DevolucaoItem>) =>
    setItens((arr) => arr.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const addItem = () =>
    setItens((arr) => [
      ...arr,
      { id: localUid(), modeloId: "", pecaId: "", cor: "", tamanho: "", quantidade: 1, valor: 0 },
    ]);

  const removerItem = (id: string) =>
    setItens((arr) => (arr.length <= 1 ? arr : arr.filter((it) => it.id !== id)));

  return (
    <Dialog open={!!devolucao} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar devolução</DialogTitle>
          <DialogDescription>
            Ajuste os dados incorretos. As mudanças refletem no dashboard imediatamente.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Data</Label>
              <Input
                type="date"
                value={dataStr}
                onChange={(e) => setDataStr(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ReturnStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["resolved", "dispute", "loss", "pending"] as ReturnStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{statusLabel[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Empresa</Label>
              <Select value={empresaId} onValueChange={setEmpresaId}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {empresas.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Plataforma</Label>
              <Select value={plataformaId} onValueChange={setPlataformaId}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {plataformas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">ID do Pedido</Label>
              <Input value={pedidoId} onChange={(e) => setPedidoId(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ID da Devolução</Label>
              <Input value={devolucaoId} onChange={(e) => setDevolucaoIdStr(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Motivo</Label>
              <Select value={motivoId} onValueChange={setMotivoId}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {motivos.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{valorLabel}</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
                className="tabular"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notas</Label>
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Itens do pedido</Label>
              <Button type="button" variant="ghost" size="sm" onClick={addItem} className="h-7">
                <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar item
              </Button>
            </div>
            <div className="space-y-2">
              {itens.map((it) => (
                <div key={it.id} className="grid grid-cols-12 gap-2 items-end rounded-md border border-border p-2">
                  <div className="col-span-5 space-y-1">
                    <span className="text-[10px] uppercase text-muted-foreground">Modelo</span>
                    <Select
                      value={it.modeloId}
                      onValueChange={(v) => atualizarItem(it.id, { modeloId: v })}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {modelos.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3 space-y-1">
                    <span className="text-[10px] uppercase text-muted-foreground">Componente</span>
                    <Select
                      value={it.pecaId}
                      onValueChange={(v) => atualizarItem(it.id, { pecaId: v })}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {pecas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-1 space-y-1">
                    <span className="text-[10px] uppercase text-muted-foreground">Qtd</span>
                    <Input
                      type="number"
                      min={1}
                      value={it.quantidade}
                      onChange={(e) => atualizarItem(it.id, { quantidade: Number(e.target.value) })}
                      className="h-8 text-xs tabular"
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <span className="text-[10px] uppercase text-muted-foreground">Valor</span>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={it.valor}
                      onChange={(e) => atualizarItem(it.id, { valor: Number(e.target.value) })}
                      className="h-8 text-xs tabular"
                    />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => removerItem(it.id)}
                      disabled={itens.length <= 1}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive-soft/40 disabled:opacity-30"
                      aria-label="Remover item"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar}>Salvar alterações</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
