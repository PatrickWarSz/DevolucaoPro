import { useCallback, useRef, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface QuickSelectOption {
  value: string;
  label: string;
}

interface QuickSelectProps {
  value: string;
  onValueChange: (v: string) => void;
  options: QuickSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  /** Ref para o trigger (foco programático). */
  triggerRef?: React.Ref<HTMLButtonElement>;
  /**
   * Ref do próximo campo a focar após selecionar uma opção.
   * Quando informado, garante avanço determinístico (não depende de varredura do DOM).
   */
  nextFocusRef?: React.RefObject<HTMLElement>;
  /** Após Enter/clique numa opção, foca o próximo campo. Default true. */
  advanceOnSelect?: boolean;
  /** id opcional para acessibilidade / label. */
  id?: string;
}

/**
 * Select otimizado para data-entry rápido e PREVISÍVEL:
 * - NÃO abre automaticamente ao receber foco (Tab continua nativo).
 * - Enter / Espaço abre o dropdown (comportamento nativo do Radix).
 * - Setas ↑/↓ navegam pelas opções dentro do dropdown aberto.
 * - Ao selecionar uma opção, o foco avança para `nextFocusRef` se informado,
 *   ou para o próximo focável do form como fallback.
 * - Tab nunca abre o dropdown nem rouba foco.
 */
export function QuickSelect({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  triggerRef,
  nextFocusRef,
  advanceOnSelect = true,
  id,
}: QuickSelectProps) {
    const [open, setOpen] = useState(false);
  const innerRef = useRef<HTMLButtonElement>(null);

  // Blindagem: se o valor já salvo no registro não existir mais na lista de
  // opções (catálogo excluído ou desvinculado depois que o registro foi
  // criado), injeta um item extra só para exibição. Sem isso, o Radix
  // Select renderiza em branco mesmo com o dado correto salvo no banco —
  // parece perda de dado pro usuário, mas é só um filtro de UI escondendo
  // um valor válido. Aplicado aqui na origem para proteger todo mundo que
  // usa QuickSelect (cores, tamanhos, motivos, peças, etc.), não só um caso.
  const safeOptions =
    value && !options.some((opt) => opt.value === value)
      ? [...options, { value, label: value }]
      : options;

  const setRef = useCallback(
    (node: HTMLButtonElement | null) => {
      innerRef.current = node;
      if (typeof triggerRef === "function") triggerRef(node);
      else if (triggerRef)
        (triggerRef as React.MutableRefObject<HTMLButtonElement | null>).current = node;
    },
    [triggerRef],
  );

  const focusNext = () => {
    // Preferência: ref explícito (ordem determinística).
    const explicit = nextFocusRef?.current;
    if (explicit) {
      explicit.focus();
      // Se for input/textarea, seleciona o conteúdo para sobrescrever rápido.
      if (
        explicit instanceof HTMLInputElement ||
        explicit instanceof HTMLTextAreaElement
      ) {
        try {
          explicit.select();
        } catch {
          /* ignore */
        }
      }
      return;
    }
    // Fallback: próximo focável do form.
    const trigger = innerRef.current;
    if (!trigger) return;
    const form = trigger.closest("form");
    const root: HTMLElement = form ?? document.body;
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(
      (el) => !el.hasAttribute("data-skip-focus") && el.offsetParent !== null,
    );
    const idx = focusables.indexOf(trigger);
    const next = focusables[idx + 1];
    next?.focus();
  };

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        onValueChange(v);
        if (advanceOnSelect) {
          // Aguarda o Radix fechar o popover e devolver foco ao trigger
          // antes de mover o foco para o próximo campo.
          setTimeout(focusNext, 30);
        }
      }}
      open={open}
      onOpenChange={setOpen}
      disabled={disabled}
    >
      <SelectTrigger ref={setRef} id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
              <SelectContent>
        {safeOptions.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
