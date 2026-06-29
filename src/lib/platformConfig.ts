/**
 * platformConfig.ts
 *
 * Estimativa de custo de devolução por plataforma. Usada para:
 *   1) Pré-preencher "Custo da devolução" no Registrar.
 *   2) Estimar valor em risco em disputas no Dashboard.
 *
 * Há DOIS níveis de configuração:
 *   - Defaults nativos por plataforma (Shopee, Mercado Livre, Shein, TikTok)
 *     embutidos no app — o operador NÃO precisa cadastrar nada.
 *   - Override personalizado em localStorage (Configurações → Plataformas)
 *     pra quem quer ajustar taxa fixa ou frete médio à sua realidade.
 *
 * O cálculo final é sempre: taxaFixa + freteMedio.
 */

import { useSyncExternalStore } from "react";

export interface PlatformFees {
  /** Taxa fixa cobrada quando o erro é do vendedor */
  taxaFixa: number;
  /** Frete médio (ida + reverso) estimado */
  freteMedio: number;
}

// =================== DEFAULTS NATIVOS ===================
// Valores aproximados baseados na política pública de cada marketplace
// (jun/2026). Operador pode sobrescrever em Configurações.
const DEFAULTS: { match: RegExp; fees: PlatformFees }[] = [
  // Shopee: taxa fixa ~R$ 4/item + frete reverso médio ~R$ 18
  { match: /shopee/i, fees: { taxaFixa: 4, freteMedio: 18 } },
  // Mercado Livre: custo fixo ~R$ 6 + frete ida+volta médio ~R$ 35
  { match: /mercado\s*livre|mercadolivre|^ml$/i, fees: { taxaFixa: 6, freteMedio: 35 } },
  // Shein: comissão ~R$ 5 + frete reverso ~R$ 25
  { match: /shein/i, fees: { taxaFixa: 5, freteMedio: 25 } },
  // TikTok Shop: taxa ~R$ 4 + frete ~R$ 20
  { match: /tiktok/i, fees: { taxaFixa: 4, freteMedio: 20 } },
];

export function getDefaultFeesByName(nome: string | undefined | null): PlatformFees | null {
  if (!nome) return null;
  const hit = DEFAULTS.find((d) => d.match.test(nome));
  return hit ? { ...hit.fees } : null;
}

// =================== OVERRIDES (localStorage) ===================

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

let cache: Store = read();
let cacheRaw: string | null =
  typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;

function getSnapshot(): Store {
  if (typeof window === "undefined") return cache;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    try {
      cache = raw ? (JSON.parse(raw) as Store) : {};
    } catch {
      cache = {};
    }
  }
  return cache;
}

const EMPTY: Store = {};
function getServerSnapshot(): Store {
  return EMPTY;
}

function write(s: Store) {
  cache = s;
  cacheRaw = JSON.stringify(s);
  localStorage.setItem(STORAGE_KEY, cacheRaw);
  listeners.forEach((l) => l());
}

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Retorna fees customizados (se houver) OU defaults nativos pelo nome. */
export function getPlatformFees(
  plataformaId: string,
  plataformaNome?: string,
): PlatformFees | null {
  const s = read();
  if (s[plataformaId]) return s[plataformaId];
  return getDefaultFeesByName(plataformaNome);
}

export function setPlatformFees(plataformaId: string, fees: PlatformFees) {
  const s = read();
  s[plataformaId] = fees;
  write(s);
}

export function clearPlatformFees(plataformaId: string) {
  const s = read();
  delete s[plataformaId];
  write(s);
}

export function hasCustomFees(plataformaId: string): boolean {
  return !!read()[plataformaId];
}

export function estimarCustoDevolucao(
  plataformaId: string,
  plataformaNome?: string,
): number | null {
  const f = getPlatformFees(plataformaId, plataformaNome);
  if (!f) return null;
  const v = Number(f.taxaFixa || 0) + Number(f.freteMedio || 0);
  return v > 0 ? v : null;
}

/** Hook React reativo aos overrides */
export function usePlatformFees(): Store {
  return useSyncExternalStore(subscribe, read, () => ({}));
}
