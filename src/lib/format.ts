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
 * NOVO MODELO (jun/2026): o número que importa é o CUSTO REAL da devolução
 * (frete ida + frete reverso + taxa fixa da plataforma), não o valor bruto
 * do pedido. O bruto é neutro — o produto volta pro estoque e o dinheiro
 * volta pro comprador. O que machuca o vendedor são as taxas.
 *
 * Por isso `valorRecuperado` agora guarda o "custo da devolução":
 * - status=loss   → custo que saiu da carteira do vendedor
 * - status=resolved (pós-disputa, motivo gera perda) → custo evitado / recuperado
 *
 * Regras:
 * - dispute: R$ 1 simbólico (para aparecer na lista; valor real só após resolver).
 * - pending: R$ 0 (aguardando a plataforma informar o valor).
 * - resolved + motivo sem perda (arrependimento): R$ 0.
 * - resolved + motivo com perda: valorRecuperado (custo evitado) ou 0 se não informado.
 * - loss: valorRecuperado (custo real perdido) ou 0 se não informado.
 *
 * Atenção: NÃO há mais fallback para valorTotal. Devoluções sem custo informado
 * contam R$ 0 — assim o dashboard reflete só dinheiro real, não faturamento bruto.
 */
export const valorEfetivo = (d: Devolucao, motivos?: Motivo[]) => {
  // Em disputa: mostra o valor que o operador informou como "em risco".
  // Se não informou nada ainda, retorna 0 (aparece como "—" no display).
  if (d.status === "dispute") return Number(d.valorRecuperado ?? 0);
  if (d.status === "pending") return 0;
  if (d.status === "loss") return Number(d.valorRecuperado ?? 0);
  // resolved
  // Se a devolução passou por uma disputa formal (foiDisputa), o valor
  // recuperado é dinheiro real que voltou pro caixa — conta sempre, mesmo
  // que o motivo original do item seja classificado como "sem culpa do
  // vendedor" (ex.: Não Serviu). O filtro de `geraPerda` existe para não
  // contar "custo" de devoluções resolvidas SEM disputa (ex.: cliente só
  // mudou de ideia); uma disputa ganha é um evento financeiro à parte e
  // não deve ser apagada por essa regra.
  if (d.foiDisputa) return Number(d.valorRecuperado ?? 0);
  if (motivos && !motivoGeraPerda(motivos, d.motivoId)) return 0;
  return Number(d.valorRecuperado ?? 0);
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
