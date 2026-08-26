import { useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { QuickSelect } from "@/components/QuickSelect";
import { useStore, selectVariantesDoModelo } from "@/lib/store";
import { cn } from "@/lib/utils";

interface VariantPickerProps {
  /** "cor" ou "tamanho" — define qual variante o picker controla. */
  kind: "cor" | "tamanho";
  modeloId: string;
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
}

/**
 * Select de cor OU tamanho que respeita os vínculos do modelo:
 * - Quando o modelo TEM vínculo, mostra só as opções vinculadas.
 * - Quando NÃO tem, mostra tudo do catálogo (fallback).
 * - Botão "+" abre um popover para "Adicionar e vincular" uma nova opção
 *   ao modelo sem sair da tela. Cria no catálogo + vincula em uma ação.
 */
export function VariantPicker({
  kind,
  modeloId,
  value,
  onValueChange,
  placeholder = "—",
}: VariantPickerProps) {
  const todasCores = useStore((s) => s.cores);
  const todosTamanhos = useStore((s) => s.tamanhos);
  const modeloVariantes = useStore((s) => s.modeloVariantes);
  const addCorEVincular = useStore((s) => s.addCorEVincular);
  const addTamanhoEVincular = useStore((s) => s.addTamanhoEVincular);

  const [popOpen, setPopOpen] = useState(false);
  const [novo, setNovo] = useState("");

    const variantes = selectVariantesDoModelo(
    modeloId,
    todasCores,
    todosTamanhos,
    modeloVariantes,
  );
  const listaBase = kind === "cor" ? variantes.cores : variantes.tamanhos;
  // Blindagem: o valor já salvo (ex.: puxado de "A Caminho" ou de uma
  // devolução antiga) pode não estar mais vinculado ao modelo. Sem isso,
  // o Select do Radix renderiza em branco mesmo com o dado correto no
  // banco — parece perda de dado pro usuário, mas é só filtro de UI.
  const lista =
    value && !listaBase.some((opt) => opt.nome === value)
      ? [...listaBase, { nome: value }]
      : listaBase;

  const confirmar = () => {
    const trimmed = novo.trim();
    if (!trimmed || !modeloId) return;
    if (kind === "cor") addCorEVincular(modeloId, trimmed);
    else addTamanhoEVincular(modeloId, trimmed);
    onValueChange(trimmed);
    setNovo("");
    setPopOpen(false);
  };

  return (
    <div className="flex items-stretch gap-1">
      <div className="flex-1 min-w-0">
        <QuickSelect
          value={value}
          onValueChange={onValueChange}
          placeholder={placeholder}
          options={lista.map((opt) => ({ value: opt.nome, label: opt.nome }))}
          disabled={!modeloId}
        />
      </div>
      {modeloId && (
        <Popover open={popOpen} onOpenChange={setPopOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              data-skip-focus
              className={cn(
                "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface-muted text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              )}
              title={
                variantes.hasVinculo
                  ? `Adicionar nova ${kind} a este modelo`
                  : `Cadastrar ${kind} no modelo (acelera próximos cadastros)`
              }
              aria-label={`Adicionar ${kind}`}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="end">
            <div className="space-y-2">
              <div>
                <p className="text-xs font-medium flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-primary" />
                  Adicionar {kind} e vincular
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {variantes.hasVinculo
                    ? `Será adicionada à lista deste modelo.`
                    : `Da próxima vez, este modelo já mostra só suas ${kind === "cor" ? "cores" : "tamanhos"}.`}
                </p>
              </div>
              <Input
                autoFocus
                value={novo}
                onChange={(e) => setNovo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    confirmar();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setPopOpen(false);
                    setNovo("");
                  }
                }}
                placeholder={
                  kind === "cor" ? "Ex: Verde militar" : "Ex: GG"
                }
                className="h-8 text-sm"
              />
              <div className="flex justify-end gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPopOpen(false);
                    setNovo("");
                  }}
                  className="h-7"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={confirmar}
                  disabled={!novo.trim()}
                  className="h-7"
                >
                  Adicionar e vincular
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
