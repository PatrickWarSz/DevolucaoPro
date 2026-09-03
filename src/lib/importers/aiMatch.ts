/**
 * aiMatch.ts — camada 3 do importador: IA em lote, invisível.
 *
 * Só é chamada para as linhas que sobraram duvidosas depois da normalização
 * determinística (normalize.ts) e da memória de recorrência (history.ts).
 * Qualquer falha é engolida: o importador segue igual a antes.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Cor, Modelo, Motivo, Tamanho } from "@/lib/types";
import type { Confianca, ShopeeImportRow } from "./shopee";
import type { HistoryIndex } from "./history";

export interface AiSugestao {
  key: string;
  modeloId?: string;
  cor?: string;
  tamanho?: string;
  motivoId?: string;
  confianca?: Confianca;
}

/** Linha precisa de IA? Falta modelo/motivo, ou variação não casou. */
export function precisaIA(r: ShopeeImportRow): boolean {
  if (r.status === "skip" || r.status === "duplicate") return false;
  if (!r.itens[0]?.modeloId) return true;
  if (!r.motivoId) return true;
  return r.itens.some((i) => (i.cor && !i.corCasou) || (i.tamanho && !i.tamanhoCasou));
}

interface Args {
  rows: ShopeeImportRow[];
  modelos: Modelo[];
  motivos: Motivo[];
  cores: Cor[];
  tamanhos: Tamanho[];
  history: HistoryIndex;
}

/** Aplica as sugestões da IA nas linhas — só onde o campo está vazio/não casou. */
export async function aplicarSugestoesIA({
  rows,
  modelos,
  motivos,
  cores,
  tamanhos,
  history,
}: Args): Promise<ShopeeImportRow[]> {
  const alvo = rows.filter(precisaIA);
  if (alvo.length === 0 || modelos.length === 0) return rows;

  const exemplos = Object.entries(history.memory.produtos)
    .slice(0, 60)
    .map(([produto, ids]) => {
      const modeloId = Object.entries(ids).sort((a, b) => b[1] - a[1])[0]?.[0];
      const modelo = modelos.find((m) => m.id === modeloId)?.nome;
      return modelo ? { produto, modelo } : null;
    })
    .filter(Boolean) as { produto: string; modelo: string }[];

  let sugestoes: AiSugestao[] = [];
  try {
    const { data, error } = await supabase.functions.invoke("import-match", {
      body: {
        linhas: alvo.slice(0, 120).map((r) => ({
          key: r.key,
          produto: r.produtoTextoOriginal,
          variacao: r.variacaoTextoOriginal,
          motivoShopee: r.motivoTextoOriginal,
          comentario: r.observacoes,
        })),
        catalogo: {
          modelos: modelos.map((m) => ({ id: m.id, nome: m.nome })),
          motivos: motivos.map((m) => ({ id: m.id, nome: m.nome })),
          cores: cores.map((c) => c.nome),
          tamanhos: tamanhos.map((t) => t.nome),
        },
        exemplos,
      },
    });
    if (error) throw error;
    sugestoes = (data?.sugestoes ?? []) as AiSugestao[];
  } catch {
    return rows; // IA fora do ar / sem chave → segue como hoje
  }

  const byKey = new Map(sugestoes.map((s) => [s.key, s]));

  return rows.map((r) => {
    const s = byKey.get(r.key);
    if (!s) return r;

    const itens = r.itens.map((i) => ({
      ...i,
      modeloId: i.modeloId || s.modeloId || "",
      cor: i.corCasou ? i.cor : s.cor ?? i.cor,
      corCasou: i.corCasou || (s.cor ? true : false),
      tamanho: i.tamanhoCasou ? i.tamanho : s.tamanho ?? i.tamanho,
      tamanhoCasou: i.tamanhoCasou || (s.tamanho ? true : false),
    }));

    const motivoId = r.motivoId || s.motivoId || "";
    const mudou =
      motivoId !== r.motivoId ||
      itens.some((i, idx) => i.modeloId !== r.itens[idx].modeloId || i.cor !== r.itens[idx].cor || i.tamanho !== r.itens[idx].tamanho);
    if (!mudou) return r;

    // Sugestão de IA nunca entra como "alta": exige o OK do usuário.
    const confianca: Confianca = s.confianca === "alta" ? "media" : "baixa";
    return { ...r, itens, motivoId, origem: "ia", confianca };
  });
}
