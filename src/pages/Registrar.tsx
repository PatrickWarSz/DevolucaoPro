import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QuickSelect } from "@/components/QuickSelect";
import { VariantPicker } from "@/components/VariantPicker";
import { useStore, lookup } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import type { ReturnStatus, DevolucaoItem, PedidoACaminho } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertCircle, XCircle, Clock, Trash2, Sparkles, Plus, Package, Truck, X } from "lucide-react";
import { fmtBRL, fmtDateTime, isToday, statusLabel, valorTotal, quantidadeTotal, motivoGeraPerda } from "@/lib/format";
import { advanceOnEnter } from "@/lib/focus";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { estimarCustoDevolucao } from "@/lib/platformConfig";

type ItemForm = Omit<DevolucaoItem, "id"> & { id: string };

interface FormState {
  empresaId: string;
  plataformaId: string;
  competencia: string;
  pedidoId: string;
  devolucaoId: string;
  motivoId: string;
  tipoDefeitoId: string;
  status: ReturnStatus;
  valorPedido: number; // valor total da devolução (único, não por item)
  valorPerda: number;  // valor REAL da perda quando status = loss (pode ser < valorPedido)
  notas: string;       // observações livres — usadas pela IA do dashboard pra contexto qualitativo
  itens: ItemForm[];
}

const todayCompetencia = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

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

const empty = (): FormState => ({
  empresaId: "",
  plataformaId: "",
  competencia: todayCompetencia(),
  pedidoId: "",
  devolucaoId: "",
  motivoId: "",
  tipoDefeitoId: "",
  status: "resolved",
  valorPedido: 0,
  valorPerda: 0,
  notas: "",
  itens: [emptyItem()],
});



const statusOptions: { value: ReturnStatus; label: string; Icon: typeof CheckCircle2; cls: string }[] = [
  {
    value: "resolved",
    label: "Resolvida",
    Icon: CheckCircle2,
    cls: "data-[active=true]:bg-success-soft data-[active=true]:border-success/40 data-[active=true]:text-success-soft-foreground",
  },
  {
    value: "dispute",
    label: "Em disputa",
    Icon: AlertCircle,
    cls: "data-[active=true]:bg-warning-soft data-[active=true]:border-warning/40 data-[active=true]:text-warning-soft-foreground",
  },
  {
    value: "loss",
    label: "Perda confirmada",
    Icon: XCircle,
    cls: "data-[active=true]:bg-destructive-soft data-[active=true]:border-destructive/40 data-[active=true]:text-destructive-soft-foreground",
  },
  {
    value: "pending",
    label: "Aguardando valor",
    Icon: Clock,
    cls: "data-[active=true]:bg-primary-soft data-[active=true]:border-primary/40 data-[active=true]:text-primary",
  },
];

export default function Registrar() {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(empty());
  const empresas = useStore((s) => s.empresas);
  const plataformas = useStore((s) => s.plataformas);
  const contas = useStore((s) => s.contas);
  const modelos = useStore((s) => s.modelos);
  const pecas = useStore((s) => s.pecas);
  const cores = useStore((s) => s.cores);
  const tamanhos = useStore((s) => s.tamanhos);
  const motivos = useStore((s) => s.motivos);
  const tiposDefeito = useStore((s) => s.tiposDefeito);
  const devolucoes = useStore((s) => s.devolucoes);
  const addDevolucao = useStore((s) => s.addDevolucao);
  const deleteDevolucao = useStore((s) => s.deleteDevolucao);
  const pedidosACaminho = useStore((s) => s.pedidosACaminho);
  const deletePedidoACaminho = useStore((s) => s.deletePedidoACaminho);

  // Refs para navegação determinística por teclado (Enter avança, sem depender
  // de varredura genérica do DOM). Ordem: Empresa → Plataforma → Competência →
  // Motivo → [Tipo defeito] → ID Pedido → ID Devolução → Valor → Submit.
  const empresaRef = useRef<HTMLButtonElement>(null);
  const plataformaRef = useRef<HTMLButtonElement>(null);
  const competenciaRef = useRef<HTMLInputElement>(null);
  const motivoRef = useRef<HTMLButtonElement>(null);
  const tipoDefeitoRef = useRef<HTMLButtonElement>(null);
  const pedidoIdRef = useRef<HTMLInputElement>(null);
  const devolucaoIdRef = useRef<HTMLInputElement>(null);
  const valorRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const firstFieldRef = empresaRef; // mantém o nome usado em outros pontos
  const pedidoBuscaRef = useRef<HTMLInputElement>(null);
  const [pedidoBusca, setPedidoBusca] = useState("");
  const [pedidoOriginalId, setPedidoOriginalId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

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

  // Limpa tipo de defeito se o motivo passar a não exigir
  useEffect(() => {
    if (form.tipoDefeitoId && form.motivoId && !motivoGeraPerda(motivos, form.motivoId)) {
      setForm((f) => ({ ...f, tipoDefeitoId: "" }));
    }
  }, [form.motivoId, form.tipoDefeitoId, motivos]);

  const filaHoje = useMemo(
    () =>
      devolucoes
        .filter((d) => isToday(d.createdAt))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [devolucoes],
  );

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const updateItem = (id: string, patch: Partial<ItemForm>) =>
    setForm((f) => ({
      ...f,
      itens: f.itens.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }));

  const addItem = () =>
    setForm((f) => ({ ...f, itens: [...f.itens, emptyItem()] }));

  const removeItem = (id: string) =>
    setForm((f) => ({
      ...f,
      itens: f.itens.length === 1 ? f.itens : f.itens.filter((it) => it.id !== id),
    }));

  // Pedido obrigatório apenas em disputa/perda (precisa rastrear)
  const pedidoObrigatorio = form.status === "dispute" || form.status === "loss" || form.status === "pending";

  // Detecta se o motivo selecionado é "defeito" (case-insensitive, match parcial)
  const motivoSelecionado = motivos.find((m) => m.id === form.motivoId);
  const isDefeito = !!motivoSelecionado?.nome.toLowerCase().includes("defeito");
  // Tipo de defeito só faz sentido quando o motivo gera perda operacional
  // (defeito, envio errado etc.). Para arrependimento/não serviu não aparece.
  const exigeTipoDefeito = !!form.motivoId && motivoGeraPerda(motivos, form.motivoId);

  const itensValidos = form.itens.filter(
    (it) => it.modeloId && Number(it.quantidade) > 0,
  );

  // Lista legível de campos faltando — usada para tooltip nos botões e toast.
  // Mantemos os botões clicáveis para que o usuário entenda o motivo (em vez
  // de ficar travado sem feedback algum).
  const pedidoFaltando = pedidoObrigatorio && form.pedidoId.trim().length === 0;
  const camposFaltando: string[] = [];
  if (!form.empresaId) camposFaltando.push("Empresa");
  if (!form.plataformaId) camposFaltando.push("Plataforma");
  if (!form.motivoId) camposFaltando.push("Motivo");
  if (pedidoFaltando) camposFaltando.push("ID do Pedido (obrigatório em disputa/perda/aguardando)");
  if (form.itens.length === 0 || itensValidos.length !== form.itens.length) {
    camposFaltando.push("Modelo e quantidade em todos os itens");
  }
  if (Number(form.valorPedido) < 0) camposFaltando.push("Valor da devolução válido");

  const valid = camposFaltando.length === 0;

  const totalCalc = Number(form.valorPedido || 0);

  // ============= Pedidos a caminho =============

  const sugestoes = useMemo(() => {
    const q = pedidoBusca.trim().toLowerCase();
    if (!q) return [];
    return pedidosACaminho
      .filter(
        (p) =>
          p.pedidoId.toLowerCase().includes(q) ||
          (p.devolucaoId ?? "").toLowerCase().includes(q),
      )
      .slice(0, 5);
  }, [pedidoBusca, pedidosACaminho]);

  // Detecção em tempo real: o ID que o usuário está digitando (no campo de
  // busca OU no ID do Pedido do formulário) já existe em algum lugar?
  // Avisa ANTES de gastar tempo preenchendo o restante.
  const idDigitado = (pedidoBusca.trim() || form.pedidoId.trim()).toLowerCase();
  const devolucaoExistente = useMemo(() => {
    if (!idDigitado) return null;
    return devolucoes.find((d) => d.pedidoId.trim().toLowerCase() === idDigitado) ?? null;
  }, [idDigitado, devolucoes]);
  const aCaminhoExistente = useMemo(() => {
    if (!idDigitado) return null;
    // Só considera "match exato" para não atrapalhar a digitação de IDs longos
    return pedidosACaminho.find((p) => p.pedidoId.trim().toLowerCase() === idDigitado) ?? null;
  }, [idDigitado, pedidosACaminho]);

  const aplicarPedido = (p: PedidoACaminho) => {
    const totalPedido = p.itens.reduce((s, it) => s + Number(it.valor || 0), 0);
    // Garante que a empresa+plataforma do pedido a caminho estão vinculadas
    // como conta — caso contrário o useEffect de plataformasDisponiveis limparia
    // o plataformaId logo após o setForm.
    const { contas: contasNow, toggleConta } = useStore.getState();
    const hasConta = contasNow.some(
      (c) => c.empresaId === p.empresaId && c.plataformaId === p.plataformaId,
    );
    if (p.empresaId && p.plataformaId && !hasConta) {
      toggleConta(p.empresaId, p.plataformaId);
    }
    setForm((f) => ({
      ...f,
      empresaId: p.empresaId,
      plataformaId: p.plataformaId,
      pedidoId: p.pedidoId,
      devolucaoId: p.devolucaoId ?? "",
      motivoId: p.motivoId ?? f.motivoId,
      notas: p.notas ?? f.notas,
      valorPedido: totalPedido,

      itens: p.itens.map((it) => ({
        id: localUid(),
        modeloId: it.modeloId,
        pecaId: it.pecaId,
        cor: it.cor,
        tamanho: it.tamanho,
        quantidade: it.quantidade,
        valor: 0,
      })),
    }));
    setPedidoOriginalId(p.id);
    setPedidoBusca("");
    toast({
      title: "Pedido carregado",
      description: `${p.pedidoId} · ${p.itens.length} item(ns) preenchido(s).`,
    });
  };


  const limparVinculo = () => {
    setPedidoOriginalId(null);
  };

  // Aplica ?pedido=XXX vindo do link "Receber" da página A Caminho.
  // Roda quando a lista de pedidos a caminho estiver disponível (Zustand persist
  // hidrata de forma async, então `pedidosACaminho` pode iniciar vazio).
  const pedidoAplicadoRef = useRef(false);
  useEffect(() => {
    if (pedidoAplicadoRef.current) return;
    const param = searchParams.get("pedido");
    if (!param) return;
    if (pedidosACaminho.length === 0) return; // aguarda hidratação
    const match = pedidosACaminho.find((p) => p.pedidoId === param);
    if (match) {
      aplicarPedido(match);
      pedidoAplicadoRef.current = true;
    } else {
      // ID não existe — ainda assim limpa o param para não tentar de novo
      pedidoAplicadoRef.current = true;
      toast({
        title: "Pedido não encontrado",
        description: `O ID "${param}" não está mais na lista de a caminho.`,
        variant: "destructive",
      });
    }
    searchParams.delete("pedido");
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidosACaminho]);

  const submit = (e?: React.FormEvent, andNext = false) => {
    e?.preventDefault();
    if (!valid) {
      toast({
        title: "Faltam campos para registrar",
        description: camposFaltando.join(" · "),
        variant: "destructive",
      });
      return;
    }
    // Anti-duplicidade: não permite cadastrar a mesma ID de pedido duas vezes
    // (case-insensitive, ignora espaços). Vazio é permitido (status sem pedido obrigatório).
    const pedidoNorm = form.pedidoId.trim().toLowerCase();
    if (pedidoNorm) {
      const existente = devolucoes.find(
        (d) => d.pedidoId.trim().toLowerCase() === pedidoNorm,
      );
      if (existente) {
        toast({
          title: "Pedido já registrado",
          description: `Já existe uma devolução para "${form.pedidoId.trim()}" (${statusLabel[existente.status]}). Verifique a Fila antes de duplicar.`,
          variant: "destructive",
        });
        return;
      }
    }
    // NOVO MODELO: valorRecuperado guarda o CUSTO REAL da devolução (frete +
    // taxas), tanto em perda confirmada quanto em resolvida pós-disputa.
    // Não usamos mais o valor bruto do pedido como financeiro — o bruto é
    // neutro (produto e dinheiro voltam). O que importa é o custo operacional.
    const custoInformado = Number(form.valorPerda) || 0;
    const exigeCusto = form.status === "loss" || (form.status === "resolved" && motivoGeraPerda(motivos, form.motivoId));
    const valorRecuperado = exigeCusto ? custoInformado : undefined;
    addDevolucao({
      empresaId: form.empresaId,
      plataformaId: form.plataformaId,
      competencia: form.competencia,
      pedidoId: form.pedidoId.trim(),
      devolucaoId: form.devolucaoId.trim(),
      motivoId: form.motivoId,
      tipoDefeitoId: exigeTipoDefeito ? form.tipoDefeitoId || undefined : undefined,
      status: form.status,
      valorRecuperado,
      notas: form.notas.trim() || undefined,

      // Distribui o valor total uniformemente entre os itens — assim a soma
      // bate com o total do pedido e nenhum item fica "zerado" no display.
      itens: form.itens.map((it) => ({
        id: it.id,
        modeloId: it.modeloId,
        pecaId: it.pecaId,
        cor: it.cor,
        tamanho: it.tamanho,
        quantidade: Number(it.quantidade),
        valor: form.itens.length > 0 ? totalCalc / form.itens.length : 0,
      })),
    });


    // Se a devolução foi criada a partir de um pedido a caminho, remove-o da lista
    if (pedidoOriginalId) {
      deletePedidoACaminho(pedidoOriginalId);
      setPedidoOriginalId(null);
    }
    toast({
      title: "Devolução registrada",
      description: `${form.itens.length} ite${form.itens.length === 1 ? "m" : "ns"} · ${fmtBRL(totalCalc)} · ${statusLabel[form.status]}`,
    });
    if (andNext) {
      setForm({
        ...empty(),
        empresaId: form.empresaId,
        plataformaId: form.plataformaId,
        competencia: form.competencia,
      });
      setTimeout(() => firstFieldRef.current?.focus(), 0);
    } else {
      setForm(empty());
      setTimeout(() => firstFieldRef.current?.focus(), 0);
    }
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        submit(undefined, e.shiftKey);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Registrar devolução"
        description="Enter avança · Tab pula · ↑/↓ navegam dentro de uma lista · ⌘/Ctrl + Enter salva"
        actions={
          <Button variant="ghost" size="sm" onClick={() => setForm(empty())}>
            Limpar
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Formulário */}
        <form
          onSubmit={(e) => submit(e)}
          className="rounded-lg border border-border bg-card shadow-xs"
        >
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-medium">Nova devolução</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Preencha os dados do pedido e adicione um ou mais produtos.
            </p>
          </div>

          {/* Busca por pedido a caminho — autocomplete no topo */}
          <div className="border-b border-border bg-primary-soft/30 px-5 py-3">
            {pedidoOriginalId ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <Truck className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-foreground">
                    Vinculado ao pedido a caminho{" "}
                    <span className="font-mono font-semibold">{form.pedidoId}</span>
                    <span className="text-muted-foreground"> — será removido da lista ao registrar.</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={limparVinculo}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Desvincular"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5" />
                  Pedido a caminho? Cole o ID do pedido OU da devolução para puxar os dados
                  {pedidosACaminho.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      · {pedidosACaminho.length} aguardando
                    </span>
                  )}
                </Label>
                <div className="relative">
                  <Input
                    ref={pedidoBuscaRef}
                    value={pedidoBusca}
                    onChange={(e) => setPedidoBusca(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && sugestoes.length > 0) {
                        e.preventDefault();
                        aplicarPedido(sugestoes[0]);
                      }
                    }}
                    placeholder="Ex: SHP-991023 ou DEV-00823"
                    className="font-mono text-sm"
                    data-skip-focus
                  />
                  {sugestoes.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-md border border-border bg-popover shadow-md max-h-64 overflow-auto">
                      {sugestoes.map((p) => {
                        const principal = p.itens[0];
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => aplicarPedido(p)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between gap-3 border-b border-border last:border-0"
                          >
                            <div className="min-w-0">
                              <div className="font-mono text-sm font-medium">
                                {p.pedidoId}
                                {p.devolucaoId && (
                                  <span className="ml-1.5 text-[11px] text-muted-foreground font-normal">
                                    · {p.devolucaoId}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {lookup(empresas, p.empresaId)} · {lookup(plataformas, p.plataformaId)} ·{" "}
                                {principal ? lookup(modelos, principal.modeloId) : "—"}
                                {p.itens.length > 1 && ` +${p.itens.length - 1}`}
                              </div>
                            </div>
                            <span className="text-xs text-muted-foreground tabular shrink-0">
                              {fmtBRL(p.itens.reduce((s, it) => s + it.valor, 0))}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Aviso anti-duplicidade — em tempo real, antes do usuário perder tempo */}
          {(devolucaoExistente || (aCaminhoExistente && pedidoOriginalId !== aCaminhoExistente.id)) && (
            <div
              className={cn(
                "border-b px-5 py-3 flex items-start gap-3",
                devolucaoExistente
                  ? "bg-destructive-soft/60 border-destructive/30"
                  : "bg-warning-soft/60 border-warning/30",
              )}
            >
              {devolucaoExistente ? (
                <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0 text-sm">
                {devolucaoExistente ? (
                  <>
                    <p className="font-medium text-destructive-soft-foreground">
                      Este pedido já foi registrado
                    </p>
                    <p className="text-xs text-destructive-soft-foreground/80 mt-0.5">
                      <span className="font-mono">{devolucaoExistente.pedidoId}</span> ·{" "}
                      {statusLabel[devolucaoExistente.status]} ·{" "}
                      {fmtDateTime(devolucaoExistente.createdAt)}. Não cadastre de novo —
                      verifique a Fila ou Disputas.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-warning-soft-foreground">
                      Este pedido já está "a caminho"
                    </p>
                    <p className="text-xs text-warning-soft-foreground/80 mt-0.5">
                      Você já pré-cadastrou{" "}
                      <span className="font-mono font-medium">{aCaminhoExistente!.pedidoId}</span>.
                      Use o botão abaixo para puxar os dados em vez de preencher tudo de novo.
                    </p>
                  </>
                )}
              </div>
              {aCaminhoExistente && !devolucaoExistente && pedidoOriginalId !== aCaminhoExistente.id && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => aplicarPedido(aCaminhoExistente)}
                  className="h-7 shrink-0"
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  Puxar dados
                </Button>
              )}
            </div>
          )}

          {/* Cabeçalho da devolução */}
          <div className="grid gap-x-4 gap-y-4 p-5 md:grid-cols-2">
            <Field label="Empresa" required>
              <QuickSelect
                triggerRef={empresaRef}
                nextFocusRef={plataformaRef}
                value={form.empresaId}
                onValueChange={(v) => set("empresaId", v)}
                placeholder="Selecione a empresa"
                options={empresas.map((e) => ({ value: e.id, label: e.nome }))}
              />
            </Field>

            <Field
              label="Plataforma / Loja"
              required
              hint={
                form.empresaId
                  ? `${plataformasDisponiveis.length} disponível(is)`
                  : "Selecione uma empresa primeiro"
              }
            >
              <QuickSelect
                triggerRef={plataformaRef}
                nextFocusRef={competenciaRef}
                value={form.plataformaId}
                onValueChange={(v) => set("plataformaId", v)}
                disabled={!form.empresaId}
                placeholder={
                  form.empresaId
                    ? plataformasDisponiveis.length
                      ? "Selecione a plataforma"
                      : "Nenhuma plataforma vinculada"
                    : "—"
                }
                options={plataformasDisponiveis.map((p) => ({ value: p.id, label: p.nome }))}
              />
            </Field>

            <Field label="Mês / Competência">
              <Input
                ref={competenciaRef}
                type="month"
                value={form.competencia}
                onChange={(e) => set("competencia", e.target.value)}
                onKeyDown={advanceOnEnter(motivoRef)}
              />
            </Field>

            <Field label="Motivo da devolução" required>
              <QuickSelect
                triggerRef={motivoRef}
                nextFocusRef={exigeTipoDefeito ? tipoDefeitoRef : pedidoIdRef}
                value={form.motivoId}
                onValueChange={(v) => set("motivoId", v)}
                placeholder="Selecione o motivo"
                options={motivos.map((m) => ({ value: m.id, label: m.nome }))}
              />
              {motivoSelecionado && (
                <p
                  className={
                    "mt-1.5 text-[11px] leading-tight " +
                    (motivoSelecionado.geraPerda === false
                      ? "text-muted-foreground"
                      : "text-destructive-soft-foreground")
                  }
                >
                  {motivoSelecionado.geraPerda === false ? (
                    <>
                      <span className="font-medium">Sem perda operacional.</span>{" "}
                      Não conta em valor recuperado/perda no dashboard.
                    </>
                  ) : (
                    <>
                      <span className="font-medium">Gera perda operacional.</span>{" "}
                      Entra nos cálculos financeiros do dashboard.
                    </>
                  )}
                </p>
              )}
            </Field>

            {exigeTipoDefeito && (
              <Field
                label="Tipo de defeito constatado"
                hint="opcional · ajuda nas análises"
              >
                <QuickSelect
                  triggerRef={tipoDefeitoRef}
                  nextFocusRef={pedidoIdRef}
                  value={form.tipoDefeitoId || "__none__"}
                  onValueChange={(v) =>
                    set("tipoDefeitoId", v === "__none__" ? "" : v)
                  }
                  placeholder="Selecione o tipo de defeito"
                  options={[
                    { value: "__none__", label: "— Não informar —" },
                    ...tiposDefeito.map((t) => ({ value: t.id, label: t.nome })),
                  ]}
                />
              </Field>
            )}

            <Field
              label="ID do Pedido"
              required={pedidoObrigatorio}
              hint={pedidoObrigatorio ? "Necessário para rastrear disputa/perda" : "Opcional"}
            >
              <Input
                ref={pedidoIdRef}
                placeholder={pedidoObrigatorio ? "Obrigatório — ex: SHP-991023" : "Ex: SHP-991023"}
                value={form.pedidoId}
                onChange={(e) => set("pedidoId", e.target.value)}
                onKeyDown={advanceOnEnter(devolucaoIdRef)}
                className={cn(
                  "font-mono text-sm",
                  pedidoFaltando && "border-destructive/60 focus-visible:ring-destructive/40",
                )}
                aria-invalid={pedidoFaltando}
              />
              {pedidoFaltando && (
                <p className="text-[11px] text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  Informe o ID do pedido para registrar uma devolução em{" "}
                  {form.status === "dispute" ? "disputa" : form.status === "pending" ? "aguardando valor" : "perda"}.
                </p>
              )}
            </Field>

            <Field label="ID da Devolução" hint="Opcional">
              <Input
                ref={devolucaoIdRef}
                placeholder="Ex: DEV-00823"
                value={form.devolucaoId}
                onChange={(e) => set("devolucaoId", e.target.value)}
                onKeyDown={advanceOnEnter(valorRef)}
                className="font-mono text-sm"
              />
            </Field>

            <div className="md:col-span-2">
              <Field
                label="Valor total da devolução (R$)"
                required
                hint="valor único do pedido inteiro — independente de quantos itens"
              >
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

            <div className="md:col-span-2">
              <Field
                label="Notas / observações"
                hint="opcional · vira contexto qualitativo para a IA do dashboard (ex.: 'cliente disse que veio com mancha', 'tamanho menor que o padrão')"
              >
                <textarea
                  value={form.notas}
                  onChange={(e) => set("notas", e.target.value)}
                  placeholder="Ex: cliente reclamou de costura solta na lateral; segundo defeito do mesmo modelo na semana"
                  rows={2}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                />
              </Field>
            </div>
          </div>


          {/* Status — definido antes dos itens para destravar regras (ID obrigatório, etc.) */}
          <div className="border-t border-border bg-surface-muted/20 px-5 py-4">
            <Label className="text-xs font-medium text-muted-foreground">
              Status da devolução
            </Label>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {statusOptions.map((opt) => {
                const active = form.status === opt.value;
                const Icon = opt.Icon;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    data-active={active}
                    data-skip-focus
                    onClick={() => set("status", opt.value)}
                    className={cn(
                      "flex items-center gap-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-foreground transition-all hover:bg-muted",
                      opt.cls,
                      active && "shadow-xs",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="font-medium">{opt.label}</span>
                  </button>
                );
              })}
            </div>

            {form.status === "loss" && (
              <div className="mt-3 rounded-md border border-destructive/30 bg-destructive-soft/40 px-3 py-2.5">
                <Label className="text-xs font-medium text-destructive-soft-foreground">
                  Valor real da perda (R$) *
                </Label>
                <p className="text-[11px] text-destructive-soft-foreground/80 mt-0.5">
                  Quanto a empresa perdeu de fato neste pedido (descontando reembolso parcial, taxas etc.).
                  Geralmente é menor que o valor total do pedido.
                </p>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0,00"
                  value={form.valorPerda || ""}
                  onChange={(e) => set("valorPerda", Number(e.target.value))}
                  className="mt-2 tabular text-base font-medium bg-card"
                />
              </div>
            )}
          </div>


          {/* Itens */}
          <div className="border-t border-border bg-surface-muted/30 px-5 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="text-sm font-medium">
                  Itens da devolução
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {form.itens.length} {form.itens.length === 1 ? "item" : "itens"} · {fmtBRL(totalCalc)}
                  </span>
                </h3>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={addItem} className="h-7">
                <Plus className="h-3.5 w-3.5 mr-1" />
                Adicionar item
              </Button>
            </div>
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
                showPeca={true}
                pecaRequired={isDefeito}
                onChange={(patch) => updateItem(it.id, patch)}
                onRemove={() => removeItem(it.id)}
                canRemove={form.itens.length > 1}
              />
            ))}
          </div>


          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-muted/40 px-5 py-3">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">
                <span className="kbd">⌘</span> <span className="kbd">↵</span> salvar ·{" "}
                <span className="kbd">⌘⇧</span> <span className="kbd">↵</span> salvar e próxima
              </p>
              {!valid && (
                <p className="text-[11px] text-warning-soft-foreground flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  Falta preencher: {camposFaltando.join(", ")}.
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => submit(undefined, true)}
                title={!valid ? `Falta preencher: ${camposFaltando.join(", ")}` : undefined}
              >
                Salvar e próxima
              </Button>
              <Button
                ref={submitRef}
                type="submit"
                size="sm"
                title={!valid ? `Falta preencher: ${camposFaltando.join(", ")}` : undefined}
              >
                Registrar devolução
              </Button>
            </div>
          </div>
        </form>

        {/* Fila de hoje */}
        <aside className="rounded-lg border border-border bg-card shadow-xs">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-medium">Fila de hoje</h2>
              <p className="text-xs text-muted-foreground">
                {filaHoje.length} registro{filaHoje.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-soft text-primary">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="max-h-[640px] overflow-y-auto">
            {filaHoje.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={Sparkles}
                  title="Nenhum registro hoje"
                  description="Os lançamentos do dia aparecem aqui em tempo real."
                />
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filaHoje.map((d) => {
                  const total = valorTotal(d);
                  const qtd = quantidadeTotal(d);
                  const primeiroItem = d.itens[0];
                  const restante = d.itens.length - 1;
                  return (
                    <li
                      key={d.id}
                      className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-muted"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={d.status} />
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {fmtDateTime(d.createdAt).split(" ")[1]}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-sm font-medium">
                          {primeiroItem ? lookup(modelos, primeiroItem.modeloId) : "—"}
                          {restante > 0 && (
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                              +{restante} {restante === 1 ? "item" : "itens"}
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {lookup(empresas, d.empresaId)} · {lookup(plataformas, d.plataformaId)} · {qtd} un.
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span
                          className={cn(
                            "text-sm font-semibold tabular",
                            d.status === "loss"
                              ? "text-destructive"
                              : d.status === "dispute"
                                ? "text-warning"
                                : "text-foreground",
                          )}
                        >
                          {d.status === "dispute" ? "R$ 1,00" : d.status === "pending" ? "—" : fmtBRL(total)}
                        </span>
                        <button
                          onClick={() => deleteDevolucao(d.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                          aria-label="Excluir"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ============= Item Row =============

function ItemRow({
  index,
  item,
  modelos,
  pecas,
  cores,
  tamanhos,
  showPeca,
  pecaRequired,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number;
  item: ItemForm;
  modelos: { id: string; nome: string }[];
  pecas: { id: string; nome: string }[];
  cores: { id?: string; nome: string }[] | string[];
  tamanhos: { id?: string; nome: string }[] | string[];
  showPeca: boolean;
  pecaRequired: boolean;
  onChange: (patch: Partial<ItemForm>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Item {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive transition-colors"
            aria-label="Remover item"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="grid gap-x-3 gap-y-3 md:grid-cols-6">
        <div className={showPeca ? "md:col-span-3" : "md:col-span-4"}>
          <Field label="Modelo" required compact>
            <QuickSelect
              value={item.modeloId}
              onValueChange={(v) => onChange({ modeloId: v })}
              placeholder="Modelo"
              options={modelos.map((m) => ({ value: m.id, label: m.nome }))}
            />
          </Field>
        </div>
        {showPeca && (
          <div className="md:col-span-3">
            <Field
              label="Componente afetado"
              compact
              required={pecaRequired}
              hint={pecaRequired ? "obrigatório p/ defeito" : "ex.: top, legging (opcional)"}
            >
              <QuickSelect
                value={item.pecaId}
                onValueChange={(v) => onChange({ pecaId: v })}
                placeholder="Selecione a peça"
                options={pecas.map((p) => ({ value: p.id, label: p.nome }))}
              />
            </Field>
          </div>
        )}
        <Field label="Cor" compact hint={item.modeloId ? undefined : "escolha o modelo"}>
          <VariantPicker
            kind="cor"
            modeloId={item.modeloId}
            value={item.cor}
            onValueChange={(v) => onChange({ cor: v })}
          />
        </Field>
        <Field label="Tamanho" compact hint={item.modeloId ? undefined : "escolha o modelo"}>
          <VariantPicker
            kind="tamanho"
            modeloId={item.modeloId}
            value={item.tamanho}
            onValueChange={(v) => onChange({ tamanho: v })}
          />
        </Field>
        <Field label="Quantidade" required compact>
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
