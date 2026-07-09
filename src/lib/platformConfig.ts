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
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// =================== AMOSTRAS DE FRETE (auto-aprendizado) ===================
// Quando o operador registra uma PERDA, capturamos o valor real descontado
// da carteira como amostra de frete. Após N amostras, calculamos a média e
// gravamos como freteMedio — daí pra frente o sistema usa o valor aprendido.

export const FREIGHT_SAMPLE_THRESHOLD = 5;
const SAMPLES_KEY = "vexo-platform-freight-samples-v1";

type Samples = Record<string, number[]>;

function readSamples(): Samples {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SAMPLES_KEY);
    return raw ? (JSON.parse(raw) as Samples) : {};
  } catch {
    return {};
  }
}

let samplesCache: Samples = readSamples();
let samplesCacheRaw: string | null =
  typeof window !== "undefined" ? localStorage.getItem(SAMPLES_KEY) : null;

function getSamplesSnapshot(): Samples {
  if (typeof window === "undefined") return samplesCache;
  const raw = localStorage.getItem(SAMPLES_KEY);
  if (raw !== samplesCacheRaw) {
    samplesCacheRaw = raw;
    try {
      samplesCache = raw ? (JSON.parse(raw) as Samples) : {};
    } catch {
      samplesCache = {};
    }
  }
  return samplesCache;
}

const EMPTY_SAMPLES: Samples = {};
function getSamplesServerSnapshot(): Samples {
  return EMPTY_SAMPLES;
}

const samplesListeners = new Set<() => void>();
function subscribeSamples(cb: () => void) {
  samplesListeners.add(cb);
  return () => samplesListeners.delete(cb);
}

function writeSamples(s: Samples) {
  samplesCache = s;
  samplesCacheRaw = JSON.stringify(s);
  localStorage.setItem(SAMPLES_KEY, samplesCacheRaw);
  samplesListeners.forEach((l) => l());
}

export function getFreightSamples(plataformaId: string): number[] {
  return readSamples()[plataformaId] ?? [];
}

export function getFreightSampleCount(plataformaId: string): number {
  return getFreightSamples(plataformaId).length;
}

export function addFreightSample(plataformaId: string, valor: number): {
  total: number;
  thresholdAtingido: boolean;
  media?: number;
} {
  if (!plataformaId || !(valor > 0)) return { total: 0, thresholdAtingido: false };
  const s = readSamples();
  const arr = s[plataformaId] ? [...s[plataformaId]] : [];
  arr.push(valor);
  s[plataformaId] = arr;
  writeSamples(s);

  if (arr.length >= FREIGHT_SAMPLE_THRESHOLD) {
    const media = arr.reduce((a, b) => a + b, 0) / arr.length;
    const existing = read()[plataformaId] ?? { taxaFixa: 0, freteMedio: 0 };
    setPlatformFees(plataformaId, { ...existing, freteMedio: Number(media.toFixed(2)) });
    return { total: arr.length, thresholdAtingido: true, media };
  }
  return { total: arr.length, thresholdAtingido: false };
}

export function resetFreightSamples(plataformaId: string) {
  const s = readSamples();
  delete s[plataformaId];
  writeSamples(s);
}

/** true enquanto estivermos coletando amostras pra esta plataforma. */
export function precisaAmostraFrete(plataformaId: string): boolean {
  if (!plataformaId) return false;
  if (hasCustomFees(plataformaId)) return false;
  return getFreightSampleCount(plataformaId) < FREIGHT_SAMPLE_THRESHOLD;
}

/** Hook React reativo às amostras */
export function useFreightSamples(): Samples {
  return useSyncExternalStore(subscribeSamples, getSamplesSnapshot, getSamplesServerSnapshot);
}

