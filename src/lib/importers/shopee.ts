/**
 * shopee.ts — parser + normalizador da planilha oficial de devoluções da Shopee.
 *
 * Camadas de inteligência (nessa ordem):
 *  1. determinística: encaixa cor/tamanho/modelo/motivo no catálogo existente
 *     (ver normalize.ts) — "Preta" → "PRETO", nunca cria texto novo;
 *  2. memória/recorrência: usa o histórico do sistema e as correções que o
 *     usuário já fez em importações anteriores (ver history.ts);
 *  3. IA (fora deste arquivo): só nas linhas que sobraram sem match.
 */

import * as XLSX from "xlsx";
import type { Cor, Devolucao, Modelo, ModeloVariantes, Motivo, PedidoACaminho, Tamanho } from "@/lib/types";
import {
  canonizarNome,
  detectarKit,
  matchCatalog,
  matchModeloPesado,
  norm,
  splitCoresKit,
} from "./normalize";
import {
  buildHistoryIndex,
  modeloDaMemoria,
  motivoDaMemoria,
  type HistoryIndex,
} from "./history";

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
export type Confianca = "alta" | "media" | "baixa";

export interface ShopeeImportItem {
  id: string;
  modeloId: string;
  cor: string;
  tamanho: string;
  quantidade: number;
  valor: number;
  /** true quando a cor/tamanho casou com o catálogo (não é texto solto). */
  corCasou?: boolean;
  tamanhoCasou?: boolean;
}

export interface ShopeeImportRow {
  /** ID estável para uso no React (index-based). */
  key: string;
  status: RowStatus;
  /** Motivo humano do status quando não é "ready". */
  reason?: string;
  /** Quão confiável é a sugestão automática desta linha. */
  confianca: Confianca;
  /** Origem do vínculo — só para diagnóstico interno. */
  origem?: "catalogo" | "memoria" | "ia";

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
  cores?: Cor[];
  tamanhos?: Tamanho[];
  modeloVariantes?: ModeloVariantes[];
  /** Índice de recorrência; se ausente, é montado na hora. */
  history?: HistoryIndex;
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
    const ms = (s - 25569) * 86400 * 1000;
    return new Date(ms).toISOString();
  }
  const iso = String(s).trim().replace(" ", "T");
  const d = new Date(iso);
  if (Number.isFinite(d.getTime())) return d.toISOString();
  return new Date().toISOString();
}

/** "Cinza Mescla,G" → { cor: "Cinza Mescla", tamanho: "G" } */
function splitVariacao(v: string): { cor: string; tamanho: string } {
  if (!v) return { cor: "", tamanho: "" };
  const parts = v.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { cor: "", tamanho: "" };
  if (parts.length === 1) return { cor: parts[0], tamanho: "" };
  const tamanho = parts[parts.length - 1];
  const cor = parts.slice(0, -1).join(", ");
  return { cor, tamanho };
}

/** Cores/tamanhos permitidos para um modelo (vínculo), com fallback no catálogo. */
function opcoesDoModelo(
  modeloId: string,
  ctx: ClassifyContext,
): { cores: { nome: string }[]; tamanhos: { nome: string }[] } {
  const todasCores = ctx.cores ?? [];
  const todosTam = ctx.tamanhos ?? [];
  const mv = ctx.modeloVariantes?.find((m) => m.modeloId === modeloId);
  const cores = mv && mv.cores.length > 0 ? mv.cores.map((nome) => ({ nome })) : todasCores;
  const tamanhos = mv && mv.tamanhos.length > 0 ? mv.tamanhos.map((nome) => ({ nome })) : todosTam;
  return { cores, tamanhos };
}

/** Encaixa cor no catálogo: primeiro nas cores do modelo, depois no catálogo todo. */
function resolverCor(
  texto: string,
  modeloId: string,
  ctx: ClassifyContext,
): { nome: string; casou: boolean } {
  if (!texto) return { nome: "", casou: false };
  const memoria = ctx.history?.memory.cores;
  const { cores } = opcoesDoModelo(modeloId, ctx);
  const doModelo = canonizarNome(texto, cores, "cor");
  if (doModelo.casou) return doModelo;
  const global = canonizarNome(texto, ctx.cores ?? [], "cor");
  if (global.casou) return global;
  if (memoria) {
    const aprendido = memoria[norm(texto).split(" ").map((t) => t).join(" ")];
    if (aprendido) return { nome: aprendido, casou: true };
  }
  return { nome: texto, casou: false };
}

function resolverTamanho(
  texto: string,
  modeloId: string,
  ctx: ClassifyContext,
): { nome: string; casou: boolean } {
  if (!texto) return { nome: "", casou: false };
  const { tamanhos } = opcoesDoModelo(modeloId, ctx);
  const doModelo = canonizarNome(texto, tamanhos, "tamanho");
  if (doModelo.casou) return doModelo;
  const global = canonizarNome(texto, ctx.tamanhos ?? [], "tamanho");
  if (global.casou) return global;
  return { nome: texto, casou: false };
}

/** Keywords Shopee + comentário do cliente → motivo do catálogo. */
function matchMotivo(
  motivoTexto: string,
  observacoes: string,
  motivos: Motivo[],
): Motivo | null {
  if (motivos.length === 0) return null;
  const blob = norm(`${motivoTexto} ${observacoes}`);
  if (!blob) return null;

  type Group = { triggers: string[]; catalogHints: string[] };
  const groups: Group[] = [
    {
      triggers: [
        "nao serviu",
        "nao servio",
        "nao servio",
        "nao serve",
        "ficou pequeno",
        "ficou grande",
        "ficou apertad",
        "ficou folgad",
        "muito pequen",
        "muito grand",
        "tamanho errado",
        "tamanho",
        "numero errado",
      ],
      catalogHints: ["tamanho", "servi", "medida", "arrependi"],
    },
    {
      triggers: [
        "defeito",
        "damage",
        "danificado",
        "rasgou",
        "rasgad",
        "quebrad",
        "costura",
        "furad",
        "mancha",
        "desfiando",
        "bolinha",
        "descosturad",
        "com problema",
        "veio ruim",
      ],
      catalogHints: ["defeito", "avaria", "damage", "qualidade"],
    },
    {
      triggers: [
        "errado",
        "wrong item",
        "outra cor",
        "cor diferente",
        "outro tamanho",
        "diferente do anunciado",
        "nao era o que pedi",
        "veio outro",
        "produto diferente",
        "faltou",
        "veio so um",
        "incompleto",
      ],
      catalogHints: ["errado", "trocad", "diferente", "incomplet", "falta"],
    },
    {
      triggers: ["arrependi", "desisti", "nao quero mais", "mudou de ideia", "comprei sem querer", "nao gostei"],
      catalogHints: ["arrependi", "desist", "nao gostou"],
    },
    {
      triggers: ["nao chegou", "extraviad", "not received", "nunca recebi", "sumiu"],
      catalogHints: ["extravio", "nao chegou", "nao entregue"],
    },
  ];

  for (const g of groups) {
    if (!g.triggers.some((t) => blob.includes(t))) continue;
    const found = motivos.find((m) => g.catalogHints.some((h) => norm(m.nome).includes(h)));
    if (found) return found;
  }
  // Último recurso: nome do motivo do catálogo aparece no blob.
  const direto = matchCatalog(motivoTexto, motivos);
  return direto.match ?? null;
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
  ctxIn: ClassifyContext,
): ShopeeImportRow[] {
  const ctx: ClassifyContext = {
    ...ctxIn,
    history: ctxIn.history ?? buildHistoryIndex(ctxIn.devolucoes, ctxIn.pedidosACaminho),
  };
  const hist = ctx.history!;

  const existingIds = new Set<string>();
  ctx.pedidosACaminho.forEach((p) => existingIds.add(p.pedidoId.trim().toLowerCase()));
  ctx.devolucoes.forEach((d) => existingIds.add(d.pedidoId.trim().toLowerCase()));

  const seenInFile = new Set<string>();

  return raw.map((r, idx) => {
    const pedidoId = String(r["ID do pedido"] ?? "").trim();
    const devolucaoId = String(r["ID da Devolução"] ?? "").trim();
    const produto = String(r["Nome do Produto"] ?? "").trim();
    const variacao = String(r["Nome da variação"] ?? "").trim();
    const { cor: corBruta, tamanho: tamBruto } = splitVariacao(variacao);
    const valor = parseBRL(String(r["Preço da unidade"] ?? ""));
    const qtd = Number(r["Quantidade de Devoluções"]) || 1;
    const motivoTxt = String(r["Motivo da Devolução"] ?? "").trim();
    const obs = String(r["Observações da Devolução"] ?? "").trim();
    const statusShopee = String(r["Status da Devolução / Reembolso"] ?? "").trim();
    const createdAt = parseDate(r["Data de criação do pedido"] ?? "");

    // ── modelo: memória primeiro, depois match pesado (IDF) ──
    let origem: ShopeeImportRow["origem"] | undefined;
    let modeloId = "";
    let modeloScore = 0;
    const doMemoria = modeloDaMemoria(produto, hist.memory);
    if (doMemoria && ctx.modelos.some((m) => m.id === doMemoria)) {
      modeloId = doMemoria;
      modeloScore = 1;
      origem = "memoria";
    } else {
      const pesado = matchModeloPesado(produto, ctx.modelos);
      if (pesado.match) {
        modeloId = pesado.match.id;
        modeloScore = pesado.score;
        origem = "catalogo";
      }
    }

    // ── motivo: memória → keywords + comentário → histórico do modelo ──
    let motivoId = "";
    const motivoMem = motivoDaMemoria(`${motivoTxt} ${obs}`, hist.memory);
    if (motivoMem && ctx.motivos.some((m) => m.id === motivoMem)) {
      motivoId = motivoMem;
    } else {
      const m = matchMotivo(motivoTxt, obs, ctx.motivos);
      if (m) motivoId = m.id;
      else if (modeloId && hist.motivoPorModelo[modeloId] && !motivoTxt && !obs) {
        motivoId = hist.motivoPorModelo[modeloId];
      }
    }

    // ── cor/tamanho canonizados contra o catálogo ──
    const pecasKit = detectarKit(produto);
    const coresKit = splitCoresKit(corBruta);
    const coresParaItens =
      pecasKit > 1 && coresKit.length > 1 ? coresKit.slice(0, pecasKit) : [corBruta];

    const itens: ShopeeImportItem[] = coresParaItens.map((corTexto, i) => {
      const cor = resolverCor(corTexto, modeloId, ctx);
      const tam = resolverTamanho(tamBruto, modeloId, ctx);
      return {
        id: `it-${idx}-${i}`,
        modeloId,
        cor: cor.nome,
        tamanho: tam.nome,
        corCasou: cor.casou,
        tamanhoCasou: tam.casou,
        quantidade: coresParaItens.length > 1 ? 1 : qtd,
        valor: coresParaItens.length > 1 ? valor / coresParaItens.length : valor,
      };
    });

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
    } else if (!modeloId) {
      status = "review";
      reason = `Produto "${produto}" não bate com nenhum modelo do catálogo`;
    } else if (!motivoId) {
      status = "review";
      reason = `Motivo "${motivoTxt || "(vazio)"}" não bate com nenhum motivo do catálogo`;
    }

    if (status !== "duplicate" && status !== "skip") seenInFile.add(pedidoKey);

    // Confiança: só é alta quando modelo veio da memória ou com match forte
    // E as variações casaram com o catálogo.
    const variacoesOk = itens.every((i) => (!i.cor || i.corCasou) && (!i.tamanho || i.tamanhoCasou));
    let confianca: Confianca = "baixa";
    if (modeloId && motivoId) {
      if ((origem === "memoria" || modeloScore >= 0.8) && variacoesOk) confianca = "alta";
      else confianca = "media";
    }

    return {
      key: `row-${idx}`,
      status,
      reason,
      confianca,
      origem,
      devolucaoId,
      pedidoId,
      createdAt,
      produtoTextoOriginal: produto,
      variacaoTextoOriginal: variacao,
      motivoTextoOriginal: motivoTxt,
      observacoes: obs,
      statusShopee,
      motivoId,
      itens,
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

  if (row.itens.length === 0 || row.itens.some((i) => !i.modeloId)) {
    return { ...row, status: "review", reason: "Escolha o modelo de cada item" };
  }
  if (!row.motivoId) {
    return { ...row, status: "review", reason: "Escolha um motivo" };
  }
  return { ...row, status: "ready", reason: undefined };
}

/** Reencaixa cor/tamanho de uma linha no catálogo depois que o modelo mudou
 *  (o vínculo do modelo pode restringir as opções). */
export function recanonizarLinha(
  row: ShopeeImportRow,
  ctx: ClassifyContext,
): ShopeeImportRow {
  const itens = row.itens.map((i) => {
    const cor = resolverCor(i.cor, i.modeloId, ctx);
    const tam = resolverTamanho(i.tamanho, i.modeloId, ctx);
    return { ...i, cor: cor.nome, tamanho: tam.nome, corCasou: cor.casou, tamanhoCasou: tam.casou };
  });
  return { ...row, itens };
}
