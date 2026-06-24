import type { Devolucao, DevolucaoItem, Motivo } from "./types";

export const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });

export const fmtBRLCompact = (v: number) => {
  if (Math.abs(v) >= 1000) {
    return "R$ " + (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "k";
  }
  return fmtBRL(v);
};

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export const daysBetween = (iso: string) => {
  const d = new Date(iso).getTime();
  const now = Date.now();
  return Math.floor((now - d) / (1000 * 60 * 60 * 24));
};

export const isToday = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
};

export const statusLabel: Record<Devolucao["status"], string> = {
  resolved: "Resolvida",
  dispute: "Em disputa",
  loss: "Perda confirmada",
  pending: "Aguardando valor",
};

// ============= Helpers de itens =============

/** Quantidade total somando todos os itens */
export const quantidadeTotal = (d: Devolucao) =>
  d.itens.reduce((s, it) => s + it.quantidade, 0);

/** Valor bruto total (soma do valor total de cada item).
 *  Cada item já guarda o valor TOTAL (não unitário) — a multiplicação por
 *  quantidade não é feita aqui para evitar dupla contagem. */
export const valorTotal = (d: Pick<Devolucao, "itens">) =>
  d.itens.reduce((s, it) => s + Number(it.valor || 0), 0);

/** Valor de um único item (já é o total) */
export const valorItem = (it: DevolucaoItem) => Number(it.valor || 0);

/** Retorna true se o motivo gera perda operacional (erro do vendedor).
 *  Quando o motivo não está na lista (legado/removido), assume true por segurança. */
export const motivoGeraPerda = (motivos: Motivo[], motivoId: string) => {
  const m = motivos.find((x) => x.id === motivoId);
  if (!m) return true;
  return m.geraPerda !== false;
};

/**
 * Valor "efetivo" usado em relatórios financeiros.
 *
 * Regras:
 * - dispute: R$ 1 simbólico (independente do número de itens).
 * - resolved + motivo sem perda operacional: R$ 0 (devolução resolvida sem
 *   custo para o vendedor — não entra em "recuperado" nem em "perda").
 * - resolved + motivo com perda: valorRecuperado se houver, senão valorTotal.
 * - loss: valorTotal (perda confirmada).
 *
 * Passe a lista de motivos para aplicar a regra "sem perda". Sem ela, mantém
 * o comportamento legado.
 */
export const valorEfetivo = (d: Devolucao, motivos?: Motivo[]) => {
  if (d.status === "dispute") return 1;
  // pending = aguardando a plataforma informar o valor da perda. Não entra
  // em "recuperado" nem em "perda" enquanto não for resolvido para loss/resolved.
  if (d.status === "pending") return 0;
  const total = valorTotal(d);
  // Em perda, o usuário pode informar um valor real de perda menor que o total
  // do pedido (ex.: reembolso parcial). Guardamos esse valor em `valorRecuperado`
  // por simplicidade — semanticamente é o "valor da perda" quando status=loss.
  if (d.status === "loss") return d.valorRecuperado ?? total;
  // resolved
  if (motivos && !motivoGeraPerda(motivos, d.motivoId)) return 0;
  return d.valorRecuperado ?? total;
};


export function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (s.includes('"') || s.includes(",") || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
