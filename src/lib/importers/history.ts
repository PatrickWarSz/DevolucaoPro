/**
 * history.ts — memória de recorrência do importador.
 *
 * Duas fontes:
 *  1. O que já está registrado no sistema (devoluções + pedidos a caminho):
 *     quais modelos mais voltam, quais cores/tamanhos cada modelo costuma ter,
 *     qual motivo costuma vir com cada modelo.
 *  2. O que o usuário corrigiu à mão na tela de revisão da importação
 *     (persistido em localStorage). Isso é o "aprendizado": se ele já ligou
 *     "LEGGING CIRRE" ao modelo X uma vez, na próxima já vem certo.
 */

import type { Devolucao, PedidoACaminho } from "@/lib/types";
import { canonKey } from "./normalize";

const LS_KEY = "devpro:import-memory:v1";

interface ImportMemory {
  /** canonKey(texto do produto na planilha) → { modeloId: vezes } */
  produtos: Record<string, Record<string, number>>;
  /** canonKey(motivo+comentário) → { motivoId: vezes } */
  motivos: Record<string, Record<string, number>>;
  /** canonKey(cor crua) → nome exato de cor escolhido */
  cores: Record<string, string>;
  /** canonKey(tamanho cru) → nome exato de tamanho escolhido */
  tamanhos: Record<string, string>;
}

const empty = (): ImportMemory => ({ produtos: {}, motivos: {}, cores: {}, tamanhos: {} });

export function loadImportMemory(): ImportMemory {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<ImportMemory>;
    return { ...empty(), ...parsed };
  } catch {
    return empty();
  }
}

function save(mem: ImportMemory) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(mem));
  } catch {
    /* quota / modo privado — memória é opcional */
  }
}

const bump = (obj: Record<string, Record<string, number>>, key: string, id: string) => {
  if (!key || !id) return;
  obj[key] = obj[key] ?? {};
  obj[key][id] = (obj[key][id] ?? 0) + 1;
};

/** Grava o que o usuário confirmou/corrigiu numa importação. */
export function remember(entries: {
  produtos?: { texto: string; modeloId: string }[];
  motivos?: { texto: string; motivoId: string }[];
  cores?: { texto: string; nome: string }[];
  tamanhos?: { texto: string; nome: string }[];
}) {
  const mem = loadImportMemory();
  entries.produtos?.forEach((p) => bump(mem.produtos, canonKey(p.texto), p.modeloId));
  entries.motivos?.forEach((m) => bump(mem.motivos, canonKey(m.texto), m.motivoId));
  entries.cores?.forEach((c) => {
    const k = canonKey(c.texto);
    if (k && c.nome) mem.cores[k] = c.nome;
  });
  entries.tamanhos?.forEach((t) => {
    const k = canonKey(t.texto);
    if (k && t.nome) mem.tamanhos[k] = t.nome;
  });
  save(mem);
}

const topOf = (m: Record<string, number> | undefined): string => {
  if (!m) return "";
  let bestId = "";
  let bestN = 0;
  for (const [id, n] of Object.entries(m)) {
    if (n > bestN) {
      bestN = n;
      bestId = id;
    }
  }
  return bestId;
};

export interface HistoryIndex {
  /** modeloId → quantas vezes já voltou (recorrência). */
  modeloFreq: Record<string, number>;
  /** modeloId → motivoId mais comum. */
  motivoPorModelo: Record<string, string>;
  /** modeloId → cores já usadas (nomes exatos, mais frequentes primeiro). */
  coresPorModelo: Record<string, string[]>;
  /** modeloId → tamanhos já usados. */
  tamanhosPorModelo: Record<string, string[]>;
  /** Memória de correções do usuário. */
  memory: ImportMemory;
}

export function buildHistoryIndex(
  devolucoes: Devolucao[],
  pedidos: PedidoACaminho[],
): HistoryIndex {
  const modeloFreq: Record<string, number> = {};
  const motivoCount: Record<string, Record<string, number>> = {};
  const coresCount: Record<string, Record<string, number>> = {};
  const tamCount: Record<string, Record<string, number>> = {};

  const feed = (itens: { modeloId: string; cor: string; tamanho: string }[], motivoId?: string) => {
    itens.forEach((i) => {
      if (!i.modeloId) return;
      modeloFreq[i.modeloId] = (modeloFreq[i.modeloId] ?? 0) + 1;
      if (motivoId) bump(motivoCount, i.modeloId, motivoId);
      if (i.cor) bump(coresCount, i.modeloId, i.cor);
      if (i.tamanho) bump(tamCount, i.modeloId, i.tamanho);
    });
  };

  devolucoes.forEach((d) => feed(d.itens ?? [], d.motivoId));
  pedidos.forEach((p) => feed(p.itens ?? [], p.motivoId));

  const rank = (src: Record<string, Record<string, number>>) => {
    const out: Record<string, string[]> = {};
    for (const [modeloId, m] of Object.entries(src)) {
      out[modeloId] = Object.entries(m)
        .sort((a, b) => b[1] - a[1])
        .map(([nome]) => nome);
    }
    return out;
  };

  const motivoPorModelo: Record<string, string> = {};
  for (const [modeloId, m] of Object.entries(motivoCount)) {
    motivoPorModelo[modeloId] = topOf(m);
  }

  return {
    modeloFreq,
    motivoPorModelo,
    coresPorModelo: rank(coresCount),
    tamanhosPorModelo: rank(tamCount),
    memory: loadImportMemory(),
  };
}

/** Modelo já aprendido para um texto de produto da planilha. */
export function modeloDaMemoria(texto: string, mem: ImportMemory): string {
  const k = canonKey(texto);
  if (!k) return "";
  const direto = topOf(mem.produtos[k]);
  if (direto) return direto;
  // fallback: chave conhecida contida no texto (títulos variam com promoções)
  let best = "";
  let bestLen = 0;
  for (const [key, ids] of Object.entries(mem.produtos)) {
    if (key.length > 6 && (k.includes(key) || key.includes(k)) && key.length > bestLen) {
      const id = topOf(ids);
      if (id) {
        best = id;
        bestLen = key.length;
      }
    }
  }
  return best;
}

/** Motivo já aprendido para um blob motivo+comentário. */
export function motivoDaMemoria(texto: string, mem: ImportMemory): string {
  const k = canonKey(texto);
  if (!k) return "";
  const direto = topOf(mem.motivos[k]);
  if (direto) return direto;
  let best = "";
  let bestLen = 0;
  for (const [key, ids] of Object.entries(mem.motivos)) {
    if (key.length > 8 && (k.includes(key) || key.includes(k)) && key.length > bestLen) {
      const id = topOf(ids);
      if (id) {
        best = id;
        bestLen = key.length;
      }
    }
  }
  return best;
}
