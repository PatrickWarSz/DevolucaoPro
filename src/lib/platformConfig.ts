/**
 * platformConfig.ts
 *
 * Configuração de custos de devolução por plataforma (taxa fixa + frete médio
 * estimado). Usada para:
 *   1) Pré-preencher o campo "Custo da devolução" no Registrar quando o
 *      usuário ganha disputa mas a plataforma não informa o valor recuperado.
 *   2) Estimar valor em risco em disputas no Dashboard.
 *
 * Persistido em localStorage (não vai pro Supabase) — é configuração 100%
 * do operador, não precisa sincronizar entre dispositivos por enquanto.
 */

import { useSyncExternalStore } from "react";

export interface PlatformFees {
  /** Taxa fixa cobrada quando o erro é do vendedor (Shopee: R$ 15) */
  taxaFixa: number;
  /** Frete médio (ida + reverso) estimado para essa plataforma */
  freteMedio: number;
}

const STORAGE_KEY = "vexo-platform-fees-v1";

type Store = Record<string, PlatformFees>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function write(s: Store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  listeners.forEach((l) => l());
}

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getPlatformFees(plataformaId: string): PlatformFees | null {
  const s = read();
  return s[plataformaId] ?? null;
}

export function setPlatformFees(plataformaId: string, fees: PlatformFees) {
  const s = read();
  s[plataformaId] = fees;
  write(s);
}

export function estimarCustoDevolucao(plataformaId: string): number | null {
  const f = getPlatformFees(plataformaId);
  if (!f) return null;
  const v = Number(f.taxaFixa || 0) + Number(f.freteMedio || 0);
  return v > 0 ? v : null;
}

/** Hook React reativo */
export function usePlatformFees(): Store {
  return useSyncExternalStore(subscribe, read, () => ({}));
}
