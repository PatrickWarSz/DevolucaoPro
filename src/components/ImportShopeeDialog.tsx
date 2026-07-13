/**
 * ImportShopeeDialog.tsx
 *
 * Wizard 3 passos para importar a planilha oficial de devoluções da Shopee
 * como "pedidos a caminho":
 *  1) Seleciona empresa + plataforma dona da planilha + upload do arquivo.
 *  2) Revisa cada linha: 🟢 ready · 🟡 review · 🔴 duplicate · ⚫ skip.
 *     Só linhas ready importam. As review precisam ser resolvidas inline
 *     (escolher modelo e/ou motivo). Duplicate/Skip são exibidos e ignorados.
 *  3) Confirma → cria os PedidoACaminho no store. Toast com o resumo.
 *
 * NENHUMA linha entra silenciosamente se tiver divergência (regra do usuário).
 */

import { useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { QuickSelect } from "@/components/QuickSelect";
import { useStore, lookup } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import {
  classifyRows,
  parseShopeeFile,
  revalidateRow,
  type ShopeeImportRow,
} from "@/lib/importers/shopee";
import { fmtBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Ban,
  ArrowLeft,
  ArrowRight,
  Loader2,
} from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

type Step = "upload" | "review" | "done";

export function ImportShopeeDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const empresas = useStore((s) => s.empresas);
  const plataformas = useStore((s) => s.plataformas);
  const contas = useStore((s) => s.contas);
  const modelos = useStore((s) => s.modelos);
  const motivos = useStore((s) => s.motivos);
  const pedidosACaminho = useStore((s) => s.pedidosACaminho);
  const devolucoes = useStore((s) => s.devolucoes);
  const addPedidoACaminho = useStore((s) => s.addPedidoACaminho);
  const addModelo = useStore((s) => s.addModelo);
  const addMotivo = useStore((s) => s.addMotivo);

  const [step, setStep] = useState<Step>("upload");
  const [empresaId, setEmpresaId] = useState("");
  const [plataformaId, setPlataformaId] = useState("");
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ShopeeImportRow[]>([]);
  const [resumo, setResumo] = useState<{
    imported: number;
    duplicates: number;
    skipped: number;
    reviewSkipped: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const plataformasDaEmpresa = useMemo(() => {
    if (!empresaId) return [];
    const ids = contas
      .filter((c) => c.empresaId === empresaId)
      .map((c) => c.plataformaId);
    return plataformas.filter((p) => ids.includes(p.id));
  }, [empresaId, contas, plataformas]);

  const contadores = useMemo(() => {
    const c = { ready: 0, review: 0, duplicate: 0, skip: 0 };
    rows.forEach((r) => c[r.status]++);
    return c;
  }, [rows]);

  const reset = () => {
    setStep("upload");
    setEmpresaId("");
    setPlataformaId("");
    setFileName("");
    setRows([]);
    setResumo(null);
    setLoading(false);
  };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!empresaId || !plataformaId) {
      toast({
        title: "Escolha empresa e plataforma antes",
        description: "Precisamos saber a qual conta essa planilha pertence.",
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }
    setLoading(true);
    setFileName(file.name);
    try {
      const raw = await parseShopeeFile(file);
      if (raw.length === 0) {
        throw new Error("A planilha está vazia.");
      }
      const classified = classifyRows(raw, {
        modelos,
        motivos,
        pedidosACaminho,
        devolucoes,
      });
      setRows(classified);
      setStep("review");
    } catch (err) {
      toast({
        title: "Falha ao ler a planilha",
        description: (err as Error).message,
        variant: "destructive",
      });
      setFileName("");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const updateRow = (key: string, patch: Partial<ShopeeImportRow>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const merged = { ...r, ...patch };
        return revalidateRow(merged, {
          modelos,
          motivos,
          pedidosACaminho,
          devolucoes,
        });
      }),
    );
  };

  const handleConfirm = () => {
    const ready = rows.filter((r) => r.status === "ready");
    if (ready.length === 0) {
      toast({
        title: "Nada para importar",
        description: "Nenhuma linha ficou pronta. Resolva os avisos ou cancele.",
        variant: "destructive",
      });
      return;
    }
    ready.forEach((r) => {
      addPedidoACaminho({
        empresaId,
        plataformaId,
        pedidoId: r.pedidoId,
        devolucaoId: r.devolucaoId || undefined,
        motivoId: r.motivoId || undefined,
        notas: [
          r.observacoes,
          r.variacaoTextoOriginal ? `Variação Shopee: ${r.variacaoTextoOriginal}` : "",
        ]
          .filter(Boolean)
          .join(" · ") || undefined,
        itens: [
          {
            id: crypto.randomUUID(),
            modeloId: r.modeloId,
            pecaId: "",
            cor: r.cor,
            tamanho: r.tamanho,
            quantidade: r.quantidade,
            valor: r.valor * r.quantidade,
          },
        ],
      });
    });
    const reviewSkipped = rows.filter((r) => r.status === "review").length;
    setResumo({
      imported: ready.length,
      duplicates: contadores.duplicate,
      skipped: contadores.skip,
      reviewSkipped,
    });
    setStep("done");
    toast({
      title: `${ready.length} pedido(s) importado(s)`,
      description: `${contadores.duplicate} duplicado(s), ${contadores.skip} ignorado(s)${
        reviewSkipped > 0 ? `, ${reviewSkipped} não resolvido(s)` : ""
      }.`,
    });
  };

  const canGoToReview = empresaId && plataformaId && fileName;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Importar planilha Shopee
          </DialogTitle>
          <DialogDescription className="text-xs">
            {step === "upload" && "Escolha a conta e faça upload do arquivo de devoluções da Shopee."}
            {step === "review" && "Revise cada linha antes de importar. Só linhas verdes serão criadas."}
            {step === "done" && "Importação concluída."}
          </DialogDescription>
        </DialogHeader>

        {/* Corpo scrollável */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === "upload" && (
            <div className="space-y-5 max-w-lg">
              <div className="grid gap-2">
                <Label className="text-xs font-medium text-muted-foreground">
                  Empresa <span className="text-destructive">*</span>
                </Label>
                <QuickSelect
                  value={empresaId}
                  onValueChange={(v) => {
                    setEmpresaId(v);
                    setPlataformaId("");
                  }}
                  placeholder="Escolha a empresa"
                  options={empresas.map((e) => ({ value: e.id, label: e.nome }))}
                />
              </div>

              <div className="grid gap-2">
                <Label className="text-xs font-medium text-muted-foreground">
                  Plataforma <span className="text-destructive">*</span>
                </Label>
                <QuickSelect
                  value={plataformaId}
                  onValueChange={setPlataformaId}
                  placeholder={empresaId ? "Escolha a plataforma" : "Escolha a empresa antes"}
                  disabled={!empresaId}
                  options={plataformasDaEmpresa.map((p) => ({
                    value: p.id,
                    label: p.nome,
                  }))}
                />
                {empresaId && plataformasDaEmpresa.length === 0 && (
                  <p className="text-[11px] text-warning">
                    Essa empresa não tem plataforma vinculada. Vá em Configurações → Contas.
                  </p>
                )}
              </div>

              <div className="rounded-lg border-2 border-dashed border-border bg-surface-muted/40 p-6 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xls,.xlsx"
                  className="hidden"
                  onChange={onPickFile}
                />
                <FileSpreadsheet className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm font-medium mb-1">
                  {fileName || "Selecione a planilha .xls"}
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  Aceita o arquivo padrão exportado pelo painel da Shopee (Order.return_refund…).
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!canGoToReview && !fileName ? !empresaId || !plataformaId : false}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      Lendo…
                    </>
                  ) : (
                    <>
                      <Upload className="h-3.5 w-3.5 mr-1.5" />
                      {fileName ? "Trocar arquivo" : "Escolher arquivo"}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {step === "review" && (
            <div className="space-y-3">
              {/* Contadores */}
              <div className="grid grid-cols-4 gap-2">
                <Counter icon={CheckCircle2} label="Pronto" value={contadores.ready} tone="success" />
                <Counter icon={AlertTriangle} label="Revisar" value={contadores.review} tone="warning" />
                <Counter icon={XCircle} label="Duplicado" value={contadores.duplicate} tone="destructive" />
                <Counter icon={Ban} label="Ignorado" value={contadores.skip} tone="muted" />
              </div>

              {/* Tabela */}
              <div className="rounded-md border border-border overflow-hidden">
                <div className="max-h-[52vh] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-surface-muted/70 sticky top-0 z-10">
                      <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-3 py-2 w-8"></th>
                        <th className="px-3 py-2">Pedido</th>
                        <th className="px-3 py-2">Produto → Modelo</th>
                        <th className="px-3 py-2">Cor / Tam</th>
                        <th className="px-3 py-2">Motivo</th>
                        <th className="px-3 py-2 text-right">Qtd</th>
                        <th className="px-3 py-2 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map((r) => (
                        <RowLine
                          key={r.key}
                          row={r}
                          modelos={modelos}
                          motivos={motivos}
                          onChange={(patch) => updateRow(r.key, patch)}
                          onCreateModelo={(nome) => {
                            const m = addModelo(nome);
                            updateRow(r.key, { modeloId: m.id });
                          }}
                          onCreateMotivo={(nome) => {
                            const m = addMotivo(nome, true);
                            updateRow(r.key, { motivoId: m.id });
                          }}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {step === "done" && resumo && (
            <div className="py-8 text-center space-y-3 max-w-md mx-auto">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-soft">
                <CheckCircle2 className="h-6 w-6 text-success" />
              </div>
              <h3 className="text-lg font-semibold">Importação concluída</h3>
              <div className="grid grid-cols-2 gap-3 text-left">
                <ResumoItem label="Importados" value={resumo.imported} tone="success" />
                <ResumoItem label="Duplicados" value={resumo.duplicates} tone="destructive" />
                <ResumoItem label="Ignorados" value={resumo.skipped} tone="muted" />
                <ResumoItem label="Não resolvidos" value={resumo.reviewSkipped} tone="warning" />
              </div>
              <p className="text-xs text-muted-foreground pt-2">
                Os pedidos importados já aparecem na lista "A Caminho".
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border bg-surface-muted/40">
          {step === "upload" && (
            <Button variant="ghost" onClick={() => handleClose(false)}>
              Cancelar
            </Button>
          )}
          {step === "review" && (
            <div className="flex items-center justify-between w-full gap-3">
              <Button variant="ghost" size="sm" onClick={() => setStep("upload")}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                Voltar
              </Button>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {contadores.ready} de {rows.length} pronto{contadores.ready === 1 ? "" : "s"} pra importar
                </span>
                <Button
                  size="sm"
                  onClick={handleConfirm}
                  disabled={contadores.ready === 0}
                >
                  Importar {contadores.ready > 0 ? contadores.ready : ""} pedido{contadores.ready === 1 ? "" : "s"}
                  <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Button>
              </div>
            </div>
          )}
          {step === "done" && (
            <Button onClick={() => handleClose(false)}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-componentes ─────────────────────────────────────────────────────

function Counter({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: number;
  tone: "success" | "warning" | "destructive" | "muted";
}) {
  const tones = {
    success: "bg-success-soft text-success-soft-foreground border-success/20",
    warning: "bg-warning-soft text-warning-soft-foreground border-warning/20",
    destructive: "bg-destructive-soft text-destructive-soft-foreground border-destructive/20",
    muted: "bg-surface-muted text-muted-foreground border-border",
  };
  return (
    <div className={cn("rounded-md border px-3 py-2 flex items-center gap-2", tones[tone])}>
      <Icon className="h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider font-medium">{label}</div>
        <div className="text-lg font-semibold leading-none tabular">{value}</div>
      </div>
    </div>
  );
}

function ResumoItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "warning" | "destructive" | "muted";
}) {
  const tones = {
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
    muted: "text-muted-foreground",
  };
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </div>
      <div className={cn("text-2xl font-semibold tabular", tones[tone])}>{value}</div>
    </div>
  );
}

function RowLine({
  row,
  modelos,
  motivos,
  onChange,
  onCreateModelo,
  onCreateMotivo,
}: {
  row: ShopeeImportRow;
  modelos: { id: string; nome: string }[];
  motivos: { id: string; nome: string }[];
  onChange: (patch: Partial<ShopeeImportRow>) => void;
  onCreateModelo: (nome: string) => void;
  onCreateMotivo: (nome: string) => void;
}) {
  const dim = row.status === "skip" || row.status === "duplicate";
  const statusPill = {
    ready: { icon: CheckCircle2, cls: "text-success", title: "Pronto" },
    review: { icon: AlertTriangle, cls: "text-warning", title: row.reason ?? "Revisar" },
    duplicate: { icon: XCircle, cls: "text-destructive", title: row.reason ?? "Duplicado" },
    skip: { icon: Ban, cls: "text-muted-foreground", title: row.reason ?? "Ignorado" },
  }[row.status];
  const Icon = statusPill.icon;

  return (
    <tr className={cn("align-top", dim && "opacity-50")}>
      <td className="px-3 py-2">
        <span title={statusPill.title} className="inline-flex">
          <Icon className={cn("h-4 w-4", statusPill.cls)} />
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="font-mono text-[11px] font-medium">{row.pedidoId || "—"}</div>
        {row.devolucaoId && (
          <div className="font-mono text-[10px] text-muted-foreground">
            {row.devolucaoId}
          </div>
        )}
      </td>
      <td className="px-3 py-2 min-w-[240px]">
        <div className="text-[11px] text-muted-foreground truncate mb-1" title={row.produtoTextoOriginal}>
          {row.produtoTextoOriginal || "—"}
        </div>
        {dim ? (
          <div className="text-[11px]">
            {row.modeloId ? lookup(modelos as never, row.modeloId) : "—"}
          </div>
        ) : (
          <ModeloPicker
            value={row.modeloId}
            modelos={modelos}
            onChange={(v) => onChange({ modeloId: v })}
            onCreate={onCreateModelo}
            sugestao={row.produtoTextoOriginal}
          />
        )}
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-[11px]">
        <div>{row.cor || "—"}</div>
        <div className="text-muted-foreground">{row.tamanho || "—"}</div>
      </td>
      <td className="px-3 py-2 min-w-[200px]">
        <div className="text-[11px] text-muted-foreground truncate mb-1" title={row.motivoTextoOriginal}>
          {row.motivoTextoOriginal || row.observacoes || "—"}
        </div>
        {dim ? (
          <div className="text-[11px]">
            {row.motivoId ? lookup(motivos as never, row.motivoId) : "—"}
          </div>
        ) : (
          <MotivoPicker
            value={row.motivoId}
            motivos={motivos}
            onChange={(v) => onChange({ motivoId: v })}
            onCreate={onCreateMotivo}
            sugestao={row.motivoTextoOriginal}
          />
        )}
      </td>
      <td className="px-3 py-2 text-right tabular">{row.quantidade}</td>
      <td className="px-3 py-2 text-right tabular">
        {fmtBRL(row.valor * row.quantidade)}
      </td>
    </tr>
  );
}

/** Select de modelo com opção "+ Criar novo com o nome do produto Shopee" */
function ModeloPicker({
  value,
  modelos,
  onChange,
  onCreate,
  sugestao,
}: {
  value: string;
  modelos: { id: string; nome: string }[];
  onChange: (v: string) => void;
  onCreate: (nome: string) => void;
  sugestao: string;
}) {
  return (
    <div className="space-y-1">
      <QuickSelect
        value={value}
        onValueChange={onChange}
        placeholder="Escolha o modelo"
        options={modelos.map((m) => ({ value: m.id, label: m.nome }))}
        advanceOnSelect={false}
      />
      {!value && sugestao && (
        <button
          type="button"
          onClick={() => onCreate(sugestao)}
          className="text-[10px] text-primary hover:underline text-left w-full truncate"
          title={`Criar modelo "${sugestao}"`}
        >
          + Criar modelo "{sugestao.length > 40 ? sugestao.slice(0, 40) + "…" : sugestao}"
        </button>
      )}
    </div>
  );
}

function MotivoPicker({
  value,
  motivos,
  onChange,
  onCreate,
  sugestao,
}: {
  value: string;
  motivos: { id: string; nome: string }[];
  onChange: (v: string) => void;
  onCreate: (nome: string) => void;
  sugestao: string;
}) {
  return (
    <div className="space-y-1">
      <QuickSelect
        value={value}
        onValueChange={onChange}
        placeholder="Escolha o motivo"
        options={motivos.map((m) => ({ value: m.id, label: m.nome }))}
        advanceOnSelect={false}
      />
      {!value && sugestao && (
        <button
          type="button"
          onClick={() => onCreate(sugestao)}
          className="text-[10px] text-primary hover:underline text-left w-full truncate"
          title={`Criar motivo "${sugestao}"`}
        >
          + Criar motivo "{sugestao.length > 40 ? sugestao.slice(0, 40) + "…" : sugestao}"
        </button>
      )}
    </div>
  );
}
