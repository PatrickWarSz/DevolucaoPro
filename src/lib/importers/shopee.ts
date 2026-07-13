/**
 * shopee.ts — parser + normalizador da planilha oficial de devoluções da Shopee.
 *
 * Fluxo:
 *  1. `parseShopeeFile(file)` lê o .xls/.xlsx via SheetJS e devolve as linhas cruas.
 *  2. `classifyRows(rawRows, ctx)` cruza com o catálogo/base atual e produz
 *     `ShopeeImportRow[]` — cada linha já com status (ready/review/duplicate/skip),
 *     modelo sugerido, cor/tamanho extraídos e motivo mapeado.
 *
 * Não toca no store; só devolve dados. Quem escreve no store é o dialog.
 */

import * as XLSX from "xlsx";
import type { Devolucao, Modelo, Motivo, PedidoACaminho } from "@/lib/types";

// ── Tipos ───────────────────────────────────────────────────────────────

/** Nome exato das colunas na planilha da Shopee (v. 2026-07). */
interface ShopeeRawRow {
  "ID da Devolução"?: string;
  "ID do pedido"?: string;
  "Data de criação do pedido"?: string;
  "Nome do Produto"?: string;
  "Nome da variação"?: string;
  "Preço da unidade"?: string;
  "Quantidade de Devoluções"?: number | string;
  "Motivo da Devolução"?: string;
  "Observações da Devolução"?: string;
  "Status da Devolução / Reembolso"?: string;
}

export type RowStatus = "ready" | "review" | "duplicate" | "skip";

export interface ShopeeImportItem {
  id: string;
  modeloId: string;
  cor: string;
  tamanho: string;
  quantidade: number;
  valor: number;
}

export interface ShopeeImportRow {
  /** ID estável para uso no React (index-based). */
  key: string;
  status: RowStatus;
  /** Motivo humano do status quando não é "ready". */
  reason?: string;

  // Dados extraídos
  devolucaoId: string;
  pedidoId: string;
  createdAt: string; // ISO
  produtoTextoOriginal: string;
  variacaoTextoOriginal: string;
  motivoTextoOriginal: string;
  observacoes: string;
  statusShopee: string;

  // Vínculos resolvidos
  motivoId: string;

  /** 1+ itens. Kits podem ter mais que um; usuário adiciona manualmente. */
  itens: ShopeeImportItem[];
}

export interface ClassifyContext {
  modelos: Modelo[];
  motivos: Motivo[];
  pedidosACaminho: PedidoACaminho[];
  devolucoes: Devolucao[];
}

// ── Parse ───────────────────────────────────────────────────────────────

export async function parseShopeeFile(file: File): Promise<ShopeeRawRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("Planilha vazia ou ilegível.");
  const rows = XLSX.utils.sheet_to_json<ShopeeRawRow>(sheet, { defval: "" });
  return rows;
}

// ── Helpers ─────────────────────────────────────────────────────────────

const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** "R$53,90" → 53.9   "R$ 1.234,56" → 1234.56 */
function parseBRL(s: string): number {
  if (!s) return 0;
  const cleaned = String(s)
    .replace(/R\$\s?/gi, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** "2026-06-19 11:18" → ISO string. Aceita datas ISO ou serial Excel. */
function parseDate(s: string | number): string {
  if (!s) return new Date().toISOString();
  if (typeof s === "number") {
    // Excel serial (dias desde 1900-01-01, com bug de 1900)
    const ms = (s - 25569) * 86400 * 1000;
    return new Date(ms).toISOString();
  }
  const iso = String(s).trim().replace(" ", "T");
  const d = new Date(iso);
  if (Number.isFinite(d.getTime())) return d.toISOString();
  return new Date().toISOString();
}

/** "Cinza Mescla,G" → { cor: "Cinza Mescla", tamanho: "G" }
 *  Split pelo ÚLTIMO ',' — cor pode ter vírgula? Improvável, mas seguro. */
function splitVariacao(v: string): { cor: string; tamanho: string } {
  if (!v) return { cor: "", tamanho: "" };
  const parts = v.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { cor: "", tamanho: "" };
  if (parts.length === 1) return { cor: parts[0], tamanho: "" };
  // último token = tamanho, resto = cor
  const tamanho = parts[parts.length - 1];
  const cor = parts.slice(0, -1).join(", ");
  return { cor, tamanho };
}

/** Match de modelo por sobreposição de tokens. Retorna melhor match e score. */
function matchModelo(produto: string, modelos: Modelo[]): Modelo | null {
  if (!produto || modelos.length === 0) return null;
  const target = new Set(norm(produto).split(" ").filter((t) => t.length > 2));
  if (target.size === 0) return null;
  let best: Modelo | null = null;
  let bestScore = 0;
  for (const m of modelos) {
    const tokens = new Set(norm(m.nome).split(" ").filter((t) => t.length > 2));
    if (tokens.size === 0) continue;
    let hits = 0;
    tokens.forEach((t) => {
      if (target.has(t)) hits++;
    });
    // score = fração dos tokens do modelo encontrados no produto
    const score = hits / tokens.size;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  // Precisa cobrir pelo menos 60% dos tokens do nome do modelo.
  return bestScore >= 0.6 ? best : null;
}

/** Keywords Shopee → motivo do catálogo do usuário.
 *  Retorna o Motivo escolhido ou null se não achou. */
function matchMotivo(
  motivoTexto: string,
  observacoes: string,
  motivos: Motivo[],
): Motivo | null {
  if (motivos.length === 0) return null;

  const blob = norm(`${motivoTexto} ${observacoes}`);
  if (!blob) return null;

  // Grupos: keyword do Shopee → keywords do catálogo do cliente.
  // Se qualquer keyword do grupo bate no blob, tenta encontrar motivo no
  // catálogo cujo nome contenha alguma das keywords do catálogo.
  type Group = { triggers: string[]; catalogHints: string[]; geraPerdaFallback?: boolean };
  const groups: Group[] = [
    {
      triggers: ["nao serviu", "ficou pequeno", "ficou grande", "tamanho"],
      catalogHints: ["tamanho", "servi", "arrependi"],
      geraPerdaFallback: false,
    },
    {
      triggers: ["defeito", "damage", "danificado", "rasgou", "rasgado", "quebrad", "costura", "furad", "mancha"],
      catalogHints: ["defeito", "avaria", "damage"],
      geraPerdaFallback: true,
    },
    {
      triggers: ["errado", "wrong item", "outra cor", "outro tamanho", "diferente"],
      catalogHints: ["errado", "trocad", "diferente"],
      geraPerdaFallback: true,
    },
    {
      triggers: ["arrependi", "desisti", "nao quero mais", "mudou de ideia"],
      catalogHints: ["arrependi", "desist"],
      geraPerdaFallback: false,
    },
    {
      triggers: ["nao chegou", "extraviado", "not received"],
      catalogHints: ["extravio", "nao chegou", "nao entregue"],
      geraPerdaFallback: true,
    },
  ];

  for (const g of groups) {
    if (!g.triggers.some((t) => blob.includes(t))) continue;
    // achou grupo — procura motivo do catálogo que combine
    const found = motivos.find((m) =>
      g.catalogHints.some((h) => norm(m.nome).includes(h)),
    );
    if (found) return found;
  }
  return null;
}

// ── Classifica ──────────────────────────────────────────────────────────

const FINAL_STATUSES = [
  "reembolso completo",
  "concluido",
  "concluído",
  "finalizado",
  "cancelado",
  "rejeitado",
];

export function classifyRows(
  raw: ShopeeRawRow[],
  ctx: ClassifyContext,
): ShopeeImportRow[] {
  // Índice de duplicidade (case-insensitive)
  const existingIds = new Set<string>();
  ctx.pedidosACaminho.forEach((p) => existingIds.add(p.pedidoId.trim().toLowerCase()));
  ctx.devolucoes.forEach((d) => existingIds.add(d.pedidoId.trim().toLowerCase()));

  // Deduplica também dentro da própria planilha (mesmo pedidoId aparecendo 2x).
  const seenInFile = new Set<string>();

  return raw.map((r, idx) => {
    const pedidoId = String(r["ID do pedido"] ?? "").trim();
    const devolucaoId = String(r["ID da Devolução"] ?? "").trim();
    const produto = String(r["Nome do Produto"] ?? "").trim();
    const variacao = String(r["Nome da variação"] ?? "").trim();
    const { cor, tamanho } = splitVariacao(variacao);
    const valor = parseBRL(String(r["Preço da unidade"] ?? ""));
    const qtd = Number(r["Quantidade de Devoluções"]) || 1;
    const motivoTxt = String(r["Motivo da Devolução"] ?? "").trim();
    const obs = String(r["Observações da Devolução"] ?? "").trim();
    const statusShopee = String(r["Status da Devolução / Reembolso"] ?? "").trim();
    const createdAt = parseDate(r["Data de criação do pedido"] ?? "");

    const modelo = matchModelo(produto, ctx.modelos);
    const motivo = matchMotivo(motivoTxt, obs, ctx.motivos);

    let status: RowStatus = "ready";
    let reason: string | undefined;

    const pedidoKey = pedidoId.toLowerCase();

    if (!pedidoId) {
      status = "skip";
      reason = "Linha sem ID de pedido";
    } else if (FINAL_STATUSES.some((s) => norm(statusShopee).includes(s))) {
      status = "skip";
      reason = `Status Shopee "${statusShopee}" já finalizado — não vai para "a caminho"`;
    } else if (existingIds.has(pedidoKey) || seenInFile.has(pedidoKey)) {
      status = "duplicate";
      reason = "Pedido já cadastrado no sistema";
    } else if (!modelo) {
      status = "review";
      reason = `Produto "${produto}" não bate com nenhum modelo do catálogo`;
    } else if (!motivo) {
      status = "review";
      reason = `Motivo "${motivoTxt || "(vazio)"}" não bate com nenhum motivo do catálogo`;
    }

    if (status !== "duplicate" && status !== "skip") {
      seenInFile.add(pedidoKey);
    }

    return {
      key: `row-${idx}`,
      status,
      reason,
      devolucaoId,
      pedidoId,
      createdAt,
      produtoTextoOriginal: produto,
      variacaoTextoOriginal: variacao,
      cor,
      tamanho,
      quantidade: qtd,
      valor,
      motivoTextoOriginal: motivoTxt,
      observacoes: obs,
      statusShopee,
      modeloId: modelo?.id ?? "",
      motivoId: motivo?.id ?? "",
    };
  });
}

/** Recalcula o status de UMA linha depois de o usuário resolver campos
 *  ausentes na tela de revisão. Não muda motivos externos (skip/duplicate). */
export function revalidateRow(
  row: ShopeeImportRow,
  ctx: ClassifyContext,
): ShopeeImportRow {
  if (row.status === "skip" || row.status === "duplicate") return row;

  if (!row.modeloId) {
    return { ...row, status: "review", reason: "Escolha um modelo" };
  }
  if (!row.motivoId) {
    return { ...row, status: "review", reason: "Escolha um motivo" };
  }
  return { ...row, status: "ready", reason: undefined };
}
