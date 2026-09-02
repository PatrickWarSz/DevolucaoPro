/**
 * normalize.ts — camada determinística de "encaixe no catálogo".
 *
 * Regra de ouro: nada de criar texto novo. Se o cliente cadastrou "PRETO" e a
 * planilha traz "Preta", o valor gravado deve ser EXATAMENTE "PRETO".
 *
 * Não depende de IA. É a primeira camada do importador; a IA só entra depois,
 * nas linhas que sobrarem sem match.
 */

/** Remove acento, caixa, pontuação e espaços duplicados. */
export const norm = (s: string): string =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Reduz plural e gênero em pt-BR: "pretas" → "pret", "preto" → "pret". */
function stem(token: string): string {
  let t = token;
  // plural
  if (t.length > 3 && t.endsWith("es")) t = t.slice(0, -2);
  else if (t.length > 3 && t.endsWith("s")) t = t.slice(0, -1);
  // gênero / vogal final
  if (t.length > 3 && /[oa]$/.test(t)) t = t.slice(0, -1);
  return t;
}

/** Chave canônica de comparação: stem por token. */
export const canonKey = (s: string): string =>
  norm(s).split(" ").filter(Boolean).map(stem).join(" ");

/** Sinônimos de tamanho comuns em marketplace. */
const TAMANHO_ALIASES: Record<string, string> = {
  pp: "pp",
  "extra pequeno": "pp",
  xs: "pp",
  p: "p",
  pequeno: "p",
  s: "p",
  m: "m",
  medio: "m",
  gg: "gg",
  "g g": "gg",
  xl: "gg",
  "extra grande": "gg",
  g: "g",
  grande: "g",
  l: "g",
  ggg: "ggg",
  xxl: "ggg",
  xg: "gg",
  u: "unico",
  un: "unico",
  unico: "unico",
  "tamanho unico": "unico",
};

const tamanhoKey = (s: string): string => {
  const n = norm(s);
  return TAMANHO_ALIASES[n] ?? canonKey(n);
};

export interface CatalogMatch<T> {
  match: T | null;
  /** 1 = exato/canônico, 0.7 = contido, 0 = nada. */
  score: number;
}

/**
 * Casa um texto livre com uma lista do catálogo, na ordem:
 *  1. igual depois de normalizar
 *  2. igual depois de canonizar (plural/gênero)
 *  3. um contém o outro (canônico)
 */
export function matchCatalog<T extends { nome: string }>(
  texto: string,
  opcoes: T[],
  kind: "cor" | "tamanho" | "generico" = "generico",
): CatalogMatch<T> {
  if (!texto || opcoes.length === 0) return { match: null, score: 0 };
  const key = (s: string) => (kind === "tamanho" ? tamanhoKey(s) : canonKey(s));
  const alvoNorm = norm(texto);
  const alvoKey = key(texto);
  if (!alvoKey) return { match: null, score: 0 };

  for (const o of opcoes) if (norm(o.nome) === alvoNorm) return { match: o, score: 1 };
  for (const o of opcoes) if (key(o.nome) === alvoKey) return { match: o, score: 1 };
  // contido (ex.: "off white mescla" vs "off mescla")
  let best: T | null = null;
  let bestLen = 0;
  for (const o of opcoes) {
    const k = key(o.nome);
    if (!k) continue;
    if ((alvoKey.includes(k) || k.includes(alvoKey)) && k.length > bestLen) {
      best = o;
      bestLen = k.length;
    }
  }
  return best ? { match: best, score: 0.7 } : { match: null, score: 0 };
}

/** Devolve o nome exato do catálogo, ou o texto original quando não casa. */
export function canonizarNome(
  texto: string,
  opcoes: { nome: string }[],
  kind: "cor" | "tamanho" | "generico" = "generico",
): { nome: string; casou: boolean } {
  const { match } = matchCatalog(texto, opcoes, kind);
  return match ? { nome: match.nome, casou: true } : { nome: texto, casou: false };
}

/** "Preto/Off Mescla" → ["Preto", "Off Mescla"]  (kits com 2 cores).
 *  Separadores: / + & " e " " com " */
export function splitCoresKit(cor: string): string[] {
  if (!cor) return [];
  const parts = cor
    .split(/\s*(?:\/|\+|&|,|\be\b|\bcom\b)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [cor.trim()];
}

/** Detecta quantidade de peças declarada no título ("Kit 2 Legging" → 2). */
export function detectarKit(produto: string): number {
  const n = norm(produto);
  const m = n.match(/\bkit\s*(?:com\s*)?(\d{1,2})\b/) ?? n.match(/\b(\d{1,2})\s*(?:pe(?:c|ç)as?|unidades?|pares?)\b/);
  const q = m ? Number(m[1]) : 1;
  return q >= 2 && q <= 12 ? q : 1;
}

/** Tokens úteis de um texto (ignora ruído comercial). */
const STOP = new Set([
  "kit",
  "com",
  "para",
  "the",
  "novo",
  "nova",
  "promocao",
  "frete",
  "gratis",
  "envio",
  "feminina",
  "feminino",
  "masculina",
  "masculino",
  "unissex",
  "tamanho",
  "cor",
  "modela",
  "corpo",
  "premium",
  "qualidade",
  "original",
]);

export function tokens(texto: string): string[] {
  return norm(texto)
    .split(" ")
    .filter((t) => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t))
    .map(stem);
}

/**
 * Match de modelo com peso IDF: palavra que aparece em poucos modelos do
 * catálogo (ex.: "cirre") vale muito mais que uma genérica ("legging").
 * Exige que ao menos um token distintivo do modelo apareça no produto.
 */
export function matchModeloPesado<T extends { id: string; nome: string }>(
  produto: string,
  modelos: T[],
): { match: T | null; score: number } {
  if (!produto || modelos.length === 0) return { match: null, score: 0 };
  const alvo = new Set(tokens(produto));
  if (alvo.size === 0) return { match: null, score: 0 };

  // frequência de cada token no catálogo → IDF
  const df = new Map<string, number>();
  const tokensPorModelo = modelos.map((m) => {
    const ts = Array.from(new Set(tokens(m.nome)));
    ts.forEach((t) => df.set(t, (df.get(t) ?? 0) + 1));
    return { m, ts };
  });
  const total = modelos.length;
  const idf = (t: string) => Math.log((total + 1) / ((df.get(t) ?? 0) + 0.5));

  let best: T | null = null;
  let bestScore = 0;
  for (const { m, ts } of tokensPorModelo) {
    if (ts.length === 0) continue;
    let hit = 0;
    let all = 0;
    let temDistintivo = false;
    for (const t of ts) {
      const w = idf(t);
      all += w;
      if (alvo.has(t)) {
        hit += w;
        // token que existe em no máximo 1/3 dos modelos = distintivo
        if ((df.get(t) ?? 0) <= Math.max(1, Math.ceil(total / 3))) temDistintivo = true;
      }
    }
    if (all === 0) continue;
    const score = (hit / all) * (temDistintivo ? 1 : 0.6);
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  // 0.62 é o corte para aceitar sem revisão humana.
  return { match: bestScore >= 0.62 ? best : null, score: bestScore };
}
