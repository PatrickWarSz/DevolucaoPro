import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { QuickSelect } from "@/components/QuickSelect";
import { VariantPicker } from "@/components/VariantPicker";
import { useStore, lookup } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { fmtBRL, fmtDateTime, daysBetween, valorTotal, quantidadeTotal } from "@/lib/format";
import { advanceOnEnter } from "@/lib/focus";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import {
  Truck,
  Plus,
  Trash2,
  Package,
  ArrowRight,
  Search,
  Sparkles,
  Pencil,
  FileSpreadsheet,
} from "lucide-react";
import type { DevolucaoItem, PedidoACaminho } from "@/lib/types";
import { ImportShopeeDialog } from "@/components/ImportShopeeDialog";
import { useNavigate } from "react-router-dom";

type ItemForm = Omit<DevolucaoItem, "id"> & { id: string };

const localUid = () => `tmp-${Math.random().toString(36).slice(2, 8)}`;

const emptyItem = (): ItemForm => ({
  id: localUid(),
  modeloId: "",
  pecaId: "",
  cor: "",
  tamanho: "",
  quantidade: 1,
  valor: 0,
});

interface FormState {
  empresaId: string;
  plataformaId: string;
  pedidoId: string;
  devolucaoId: string;
  motivoId: string;
  notas: string;
  valorPedido: number; // valor total único da devolução
  itens: ItemForm[];
}

const empty = (): FormState => ({
  empresaId: "",
  plataformaId: "",
  pedidoId: "",
  devolucaoId: "",
  motivoId: "",
  notas: "",
  valorPedido: 0,
  itens: [emptyItem()],
});

export default function ACaminho() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const empresas = useStore((s) => s.empresas);
  const plataformas = useStore((s) => s.plataformas);
  const contas = useStore((s) => s.contas);
  const modelos = useStore((s) => s.modelos);
  const pecas = useStore((s) => s.pecas);
  const cores = useStore((s) => s.cores);
  const tamanhos = useStore((s) => s.tamanhos);
  const motivos = useStore((s) => s.motivos);
  const pedidosACaminho = useStore((s) => s.pedidosACaminho);
  const devolucoes = useStore((s) => s.devolucoes);
  const addPedidoACaminho = useStore((s) => s.addPedidoACaminho);
  const deletePedidoACaminho = useStore((s) => s.deletePedidoACaminho);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmBulk, setConfirmBulk] = useState(false);

  const [form, setForm] = useState<FormState>(empty());
  const [busca, setBusca] = useState("");
  // Refs para navegação determinística por teclado.
  const pedidoIdRef = useRef<HTMLInputElement>(null);
  const empresaRef = useRef<HTMLButtonElement>(null);
  const plataformaRef = useRef<HTMLButtonElement>(null);
  const devolucaoIdRef = useRef<HTMLInputElement>(null);
  const motivoRef = useRef<HTMLButtonElement>(null);
  const notasRef = useRef<HTMLInputElement>(null);
  const valorRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const firstFieldRef = pedidoIdRef;

  const plataformasDisponiveis = useMemo(() => {
    if (!form.empresaId) return [];
    const ids = contas.filter((c) => c.empresaId === form.empresaId).map((c) => c.plataformaId);
    return plataformas.filter((p) => ids.includes(p.id));
  }, [form.empresaId, contas, plataformas]);

  useEffect(() => {
    if (form.plataformaId && !plataformasDisponiveis.find((p) => p.id === form.plataformaId)) {
      setForm((f) => ({ ...f, plataformaId: "" }));
    }
  }, [plataformasDisponiveis, form.plataformaId]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const updateItem = (id: string, patch: Partial<ItemForm>) =>
    setForm((f) => ({
      ...f,
      itens: f.itens.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }));

  const addItem = () => setForm((f) => ({ ...f, itens: [...f.itens, emptyItem()] }));
  const removeItem = (id: string) =>
    setForm((f) => ({
      ...f,
      itens: f.itens.length === 1 ? f.itens : f.itens.filter((it) => it.id !== id),
    }));

  const itensValidos = form.itens.filter(
    (it) => it.modeloId && Number(it.quantidade) > 0,
  );
  const valid =
    form.empresaId &&
    form.plataformaId &&
    form.pedidoId.trim().length > 0 &&
    itensValidos.length === form.itens.length;

  const totalCalc = Number(form.valorPedido || 0);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!valid) {
      toast({
        title: "Preencha os campos obrigatórios",
        description: "Empresa, plataforma, ID do pedido e ao menos 1 item com modelo.",
        variant: "destructive",
      });
      return;
    }
    // Anti-duplicidade contra a própria lista "a caminho"
    const pedidoNorm = form.pedidoId.trim().toLowerCase();
    const dupCaminho = pedidosACaminho.find(
      (p) => p.id !== editingId && p.pedidoId.trim().toLowerCase() === pedidoNorm,
    );
    if (dupCaminho) {
      toast({
        title: "Pedido já está a caminho",
        description: `O ID "${form.pedidoId.trim()}" já foi pré-cadastrado. Use "Receber" ou "Editar" na lista.`,
        variant: "destructive",
      });
      return;
    }
    // Anti-duplicidade contra devoluções já registradas — evita re-cadastro
    const dupDev = devolucoes.find(
      (d) => d.pedidoId.trim().toLowerCase() === pedidoNorm,
    );
    if (dupDev) {
      toast({
        title: "Pedido já registrado como devolução",
        description: `"${form.pedidoId.trim()}" já consta na Fila/Disputas — não precisa re-cadastrar aqui.`,
        variant: "destructive",
      });
      return;
    }
    // Modo edição: deletar o antigo e re-inserir (mantém sync DB consistente)
    if (editingId) deletePedidoACaminho(editingId);
    addPedidoACaminho({
      empresaId: form.empresaId,
      plataformaId: form.plataformaId,
      pedidoId: form.pedidoId.trim(),
      devolucaoId: form.devolucaoId.trim() || undefined,
      motivoId: form.motivoId || undefined,
      notas: form.notas.trim() || undefined,
      itens: form.itens.map((it, idx) => ({
        id: it.id,
        modeloId: it.modeloId,
        pecaId: it.pecaId,
        cor: it.cor,
        tamanho: it.tamanho,
        quantidade: Number(it.quantidade),
        valor: idx === 0 ? totalCalc : 0,
      })),
    });
    toast({
      title: editingId ? "Pedido atualizado" : "Pedido a caminho registrado",
      description: `${form.pedidoId.trim()} · ${form.itens.length} item(ns)`,
    });
    setEditingId(null);
    setForm({
      ...empty(),
      empresaId: form.empresaId,
      plataformaId: form.plataformaId,
    });
    setTimeout(() => firstFieldRef.current?.focus(), 0);
  };

  const editarPedido = (p: PedidoACaminho) => {
    const total = p.itens.reduce((s, it) => s + Number(it.valor || 0), 0);
    setEditingId(p.id);
    setForm({
      empresaId: p.empresaId,
      plataformaId: p.plataformaId,
      pedidoId: p.pedidoId,
      devolucaoId: p.devolucaoId ?? "",
      motivoId: p.motivoId ?? "",
      notas: p.notas ?? "",
      valorPedido: total,
      itens: p.itens.length > 0
        ? p.itens.map((it) => ({
            id: localUid(),
            modeloId: it.modeloId,
            pecaId: it.pecaId,
            cor: it.cor,
            tamanho: it.tamanho,
            quantidade: it.quantidade,
            valor: 0,
          }))
        : [emptyItem()],
    });
    // Rola para o formulário
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => pedidoIdRef.current?.focus(), 100);
  };

  const cancelarEdicao = () => {
    setEditingId(null);
    setForm(empty());
  };

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const arr = q
      ? pedidosACaminho.filter((p) => {
          const empresa = lookup(empresas, p.empresaId).toLowerCase();
          const plat = lookup(plataformas, p.plataformaId).toLowerCase();
          return (
            p.pedidoId.toLowerCase().includes(q) ||
            (p.devolucaoId ?? "").toLowerCase().includes(q) ||
            empresa.includes(q) ||
            plat.includes(q)
          );
        })
      : pedidosACaminho;
    return [...arr].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [pedidosACaminho, busca, empresas, plataformas]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visibleIds = lista.map((p) => p.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));

  const toggleOne = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const toggleAllVisible = () =>
    setSelectedIds((prev) =>
      allVisibleSelected
        ? prev.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...prev, ...visibleIds])),
    );

  const removerSelecionados = () => {
    const n = selectedIds.length;
    selectedIds.forEach((id) => deletePedidoACaminho(id));
    setSelectedIds([]);
    setConfirmBulk(false);
    toast({ title: `${n} pedido(s) removido(s)` });
  };

  const irParaRegistrar = (p: PedidoACaminho) => {
    navigate(`/registrar?pedido=${encodeURIComponent(p.pedidoId)}`);
  };


  return (
    <div className="space-y-6">
      <PageHeader
        title="Pedidos a caminho"
        description="Pré-cadastre pedidos que o cliente já postou. Quando chegarem, é só usar o ID no Registrar para puxar tudo."
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
            Importar planilha Shopee
          </Button>
        }
      />

      <ImportShopeeDialog open={importOpen} onOpenChange={setImportOpen} />

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        {/* Form */}
        <form
          onSubmit={submit}
          className="rounded-lg border border-border bg-card shadow-xs h-fit"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
            <div className="flex items-center gap-2">
              <Truck className={cn("h-4 w-4", editingId ? "text-warning" : "text-primary")} />
              <h2 className="text-sm font-medium">
                {editingId ? "Editar pedido a caminho" : "Novo pedido a caminho"}
              </h2>
            </div>
            {editingId && (
              <Button type="button" variant="ghost" size="sm" onClick={cancelarEdicao} className="h-7">
                Cancelar
              </Button>
            )}
          </div>

          <div className="grid gap-4 p-5">
            <Field label="ID do pedido" required>
              <Input
                ref={pedidoIdRef}
                placeholder="Ex: SHP-991023"
                value={form.pedidoId}
                onChange={(e) => set("pedidoId", e.target.value)}
                onKeyDown={advanceOnEnter(empresaRef)}
                className="font-mono text-sm"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Empresa" required>
                <QuickSelect
                  triggerRef={empresaRef}
                  nextFocusRef={plataformaRef}
                  value={form.empresaId}
                  onValueChange={(v) => set("empresaId", v)}
                  placeholder="Empresa"
                  options={empresas.map((e) => ({ value: e.id, label: e.nome }))}
                />
              </Field>
              <Field label="Plataforma" required>
                <QuickSelect
                  triggerRef={plataformaRef}
                  nextFocusRef={devolucaoIdRef}
                  value={form.plataformaId}
                  onValueChange={(v) => set("plataformaId", v)}
                  disabled={!form.empresaId}
                  placeholder={form.empresaId ? "Plataforma" : "—"}
                  options={plataformasDisponiveis.map((p) => ({ value: p.id, label: p.nome }))}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="ID devolução" hint="opcional">
                <Input
                  ref={devolucaoIdRef}
                  placeholder="DEV-00823"
                  value={form.devolucaoId}
                  onChange={(e) => set("devolucaoId", e.target.value)}
                  onKeyDown={advanceOnEnter(motivoRef)}
                  className="font-mono text-sm"
                />
              </Field>
              <Field label="Motivo previsto" hint="opcional">
                <QuickSelect
                  triggerRef={motivoRef}
                  nextFocusRef={notasRef}
                  value={form.motivoId}
                  onValueChange={(v) => set("motivoId", v)}
                  placeholder="—"
                  options={motivos.map((m) => ({ value: m.id, label: m.nome }))}
                />
              </Field>
            </div>

            <Field label="Notas" hint="opcional">
              <Input
                ref={notasRef}
                placeholder="Ex: cliente disse que veio com mancha"
                value={form.notas}
                onChange={(e) => set("notas", e.target.value)}
                onKeyDown={advanceOnEnter(valorRef)}
              />
            </Field>

            <Field label="Valor total da devolução (R$)" required hint="valor único do pedido inteiro">
              <Input
                ref={valorRef}
                type="number"
                min={0}
                step="0.01"
                placeholder="0,00"
                value={form.valorPedido || ""}
                onChange={(e) => set("valorPedido", Number(e.target.value))}
                onKeyDown={advanceOnEnter(submitRef)}
                className="tabular text-base font-medium"
              />
            </Field>
          </div>

          <div className="border-t border-border bg-surface-muted/30 px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-3.5 w-3.5 text-muted-foreground" />
              <h3 className="text-sm font-medium">
                Itens
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {form.itens.length} · {fmtBRL(totalCalc)}
                </span>
              </h3>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={addItem} className="h-7">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Item
            </Button>
          </div>

          <div className="divide-y divide-border">
            {form.itens.map((it, idx) => (
              <ItemRow
                key={it.id}
                index={idx}
                item={it}
                modelos={modelos}
                pecas={pecas}
                cores={cores}
                tamanhos={tamanhos}
                onChange={(patch) => updateItem(it.id, patch)}
                onRemove={() => removeItem(it.id)}
                canRemove={form.itens.length > 1}
              />
            ))}
          </div>

          <div className="border-t border-border bg-surface-muted/40 px-5 py-3 flex justify-end">
            <Button ref={submitRef} type="submit" size="sm" disabled={!valid}>
              <Truck className="h-3.5 w-3.5 mr-1.5" />
              {editingId ? "Salvar alterações" : "Registrar pedido"}
            </Button>
          </div>
        </form>

        {/* Lista */}
        <section className="rounded-lg border border-border bg-card shadow-xs">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
            <div>
              <h2 className="text-sm font-medium">
                {pedidosACaminho.length} pedido{pedidosACaminho.length === 1 ? "" : "s"} aguardando
              </h2>
              <p className="text-xs text-muted-foreground">
                Use o ID do pedido no <span className="font-medium">Registrar</span> para puxar os dados.
              </p>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar ID, empresa…"
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>

          {lista.length > 0 && (
            <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-muted/30 px-5 py-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAllVisible} />
                Selecionar todos ({lista.length})
              </label>
              {selectedIds.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground tabular">
                    {selectedIds.length} selecionado(s)
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    onClick={() => setSelectedIds([])}
                  >
                    Limpar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="h-7"
                    onClick={() => setConfirmBulk(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Remover selecionados
                  </Button>
                </div>
              )}
            </div>
          )}

          {lista.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={pedidosACaminho.length === 0 ? Truck : Sparkles}
                title={pedidosACaminho.length === 0 ? "Nenhum pedido a caminho" : "Nada encontrado"}
                description={
                  pedidosACaminho.length === 0
                    ? "Pré-cadastre aqui pedidos que o cliente já postou para devolução."
                    : "Tente outro termo de busca."
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {lista.map((p) => {
                const total = valorTotal(p as never);
                const qtd = quantidadeTotal(p as never);
                const dias = daysBetween(p.createdAt);
                const principal = p.itens[0];
                const restante = p.itens.length - 1;
                return (
                  <li
                    key={p.id}
                    className="group grid grid-cols-[auto_1fr_auto] gap-3 px-5 py-3.5 transition-colors hover:bg-surface-muted/50"
                  >
                    <div className="pt-1">
                      <Checkbox
                        checked={selectedSet.has(p.id)}
                        onCheckedChange={() => toggleOne(p.id)}
                        aria-label={`Selecionar ${p.pedidoId}`}
                      />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-semibold text-foreground">
                          {p.pedidoId}
                        </span>
                        {p.devolucaoId && (
                          <span className="font-mono text-[11px] text-muted-foreground">
                            · {p.devolucaoId}
                          </span>
                        )}
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular",
                            dias > 14
                              ? "bg-warning-soft text-warning-soft-foreground"
                              : "bg-surface-muted text-muted-foreground",
                          )}
                        >
                          há {dias} {dias === 1 ? "dia" : "dias"}
                        </span>
                      </div>
                      <p className="truncate text-sm text-foreground">
                        {principal ? lookup(modelos, principal.modeloId) : "—"}
                        {restante > 0 && (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            +{restante} {restante === 1 ? "item" : "itens"}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {lookup(empresas, p.empresaId)} · {lookup(plataformas, p.plataformaId)} · {qtd} un. · {fmtBRL(total)}
                      </p>
                      {p.notas && (
                        <p className="text-xs text-muted-foreground italic truncate">
                          "{p.notas}"
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground">
                        Cadastrado em {fmtDateTime(p.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end justify-between gap-2">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => editarPedido(p)}
                          className="text-muted-foreground hover:text-primary transition-colors p-1"
                          aria-label="Editar"
                          title="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deletePedidoACaminho(p.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors p-1"
                          aria-label="Remover"
                          title="Remover"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => irParaRegistrar(p)} className="h-7">
                        Receber
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <AlertDialog open={confirmBulk} onOpenChange={setConfirmBulk}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {selectedIds.length} pedido(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Os pedidos selecionados serão removidos da lista
              "a caminho".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={removerSelecionados}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ItemRow({
  index,
  item,
  modelos,
  pecas,
  cores,
  tamanhos,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number;
  item: ItemForm;
  modelos: { id: string; nome: string }[];
  pecas: { id: string; nome: string }[];
  cores: { id: string; nome: string }[];
  tamanhos: { id: string; nome: string }[];
  onChange: (patch: Partial<ItemForm>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="px-5 py-3.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Item {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="grid gap-2 grid-cols-2">
        <div className="col-span-2">
          <Field label="Modelo" required compact>
            <QuickSelect
              value={item.modeloId}
              onValueChange={(v) => onChange({ modeloId: v })}
              placeholder="Modelo"
              options={modelos.map((m) => ({ value: m.id, label: m.nome }))}
            />
          </Field>
        </div>
        <Field label="Cor" compact>
          <VariantPicker
            kind="cor"
            modeloId={item.modeloId}
            value={item.cor}
            onValueChange={(v) => onChange({ cor: v })}
          />
        </Field>
        <Field label="Tamanho" compact>
          <VariantPicker
            kind="tamanho"
            modeloId={item.modeloId}
            value={item.tamanho}
            onValueChange={(v) => onChange({ tamanho: v })}
          />
        </Field>
        <Field label="Qtd" required compact>
          <Input
            type="number"
            min={1}
            value={item.quantidade}
            onChange={(e) => onChange({ quantidade: Number(e.target.value) })}
            className="tabular"
          />
        </Field>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
  compact,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      <div className="flex items-baseline justify-between">
        <Label className={cn(compact ? "text-[11px]" : "text-xs", "font-medium text-muted-foreground")}>
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
