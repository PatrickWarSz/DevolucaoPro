// Edge Function: import-match
// IA "por baixo dos panos" do importador da planilha Shopee.
// Recebe um LOTE de linhas duvidosas + o catálogo real do cliente e devolve,
// por linha, o vínculo mais provável (modeloId, cor, tamanho, motivoId) com
// nível de confiança. Nunca inventa nomes: só pode escolher do catálogo.
//
// Falha silenciosa por design: qualquer erro devolve sugestões vazias para o
// importador seguir exatamente como antes.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Linha {
  key: string;
  produto: string;
  variacao: string;
  motivoShopee: string;
  comentario: string;
}

interface Catalogo {
  modelos: { id: string; nome: string }[];
  motivos: { id: string; nome: string }[];
  cores: string[];
  tamanhos: string[];
}

interface Body {
  linhas: Linha[];
  catalogo: Catalogo;
  /** Vínculos que o usuário já fez antes: texto da planilha → nome do modelo. */
  exemplos?: { produto: string; modelo: string }[];
}

interface Sugestao {
  key: string;
  modeloId?: string;
  cor?: string;
  tamanho?: string;
  motivoId?: string;
  confianca?: "alta" | "media" | "baixa";
}

const vazio = (linhas: Linha[]) =>
  new Response(JSON.stringify({ sugestoes: linhas.map((l) => ({ key: l.key })) }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const linhas = Array.isArray(body?.linhas) ? body.linhas.slice(0, 120) : [];
  const cat = body?.catalogo;
  if (linhas.length === 0 || !cat || !Array.isArray(cat.modelos)) return vazio(linhas ?? []);

  // Mesma chave que a IA do dashboard já usa (ai-insights).
  const apiKey = Deno.env.get("GEMINI_API_KEY_DEVOLUCAO") || Deno.env.get("GEMINI_API_KEY");
  console.log("import-match: linhas", linhas.length, "chave", apiKey ? "ok" : "ausente");
  if (!apiKey) return vazio(linhas);

  const prompt = `Você é o motor de vínculo de um sistema de devoluções de e-commerce brasileiro.
Para cada linha de uma planilha da Shopee, escolha o vínculo correto USANDO SOMENTE os ids/nomes do catálogo abaixo.

REGRAS DURAS:
- modeloId e motivoId devem ser ids EXATOS do catálogo. Se não tiver certeza razoável, deixe o campo fora.
- cor e tamanho devem ser strings EXATAS da lista do catálogo (mesma grafia e caixa). Nunca invente variação nova.
- "Preta"/"pretas" corresponde a "PRETO" se for isso que existe no catálogo. Plural/gênero/acentos são irrelevantes.
- O TIPO DE PEÇA é regra absoluta e vem antes de tudo: short/bermuda/ciclista, legging, calça, top/cropped, body, blusa/regata, vestido, saia, conjunto são categorias DIFERENTES. Um "Short Levanta Bumbum Cirrê Academia" JAMAIS pode virar "LEGGING LEVANTA BUMBUM CIRRÊ" — se não existir modelo do mesmo tipo de peça no catálogo, deixe modeloId fora em vez de escolher outro tipo.
- Depois do tipo de peça, palavras raras e técnicas do título ("cirre", "canelada", "flare", "plus size", "elastico exposto") pesam MUITO mais que genéricas ("levanta bumbum", "academia", "kit", "feminina").
- O motivo deve ser deduzido do comentário do cliente, mesmo quando ele não usa o termo técnico. Exemplos: "fui experimentar e infelizmente não coube", "ficou apertado", "veio menor" = problema de tamanho / não serviu; "rasgou na costura", "veio manchado" = defeito; "veio outra cor", "não era o que pedi" = produto errado; "desisti", "não gostei" = arrependimento; "nunca recebi" = extravio. Elogios ("muito bonita a cor, o tecido") NÃO são o motivo.
- confianca: "alta" só quando o produto é inequívoco; "media" quando plausível; "baixa" quando é chute.


CATÁLOGO
modelos: ${JSON.stringify(cat.modelos)}
motivos: ${JSON.stringify(cat.motivos)}
cores: ${JSON.stringify(cat.cores ?? [])}
tamanhos: ${JSON.stringify(cat.tamanhos ?? [])}

VÍNCULOS QUE O USUÁRIO JÁ FEZ ANTES (siga esse padrão):
${JSON.stringify(body.exemplos ?? [])}

LINHAS
${JSON.stringify(linhas)}

Responda APENAS JSON: {"sugestoes":[{"key":"...","modeloId":"...","cor":"...","tamanho":"...","motivoId":"...","confianca":"alta|media|baixa"}]}`;

  const model = Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.error("import-match gemini erro", res.status, (await res.text()).slice(0, 300));
      return vazio(linhas);
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const parsed = JSON.parse(text) as { sugestoes?: Sugestao[] };

    // Saneamento: descarta qualquer id/nome que não exista no catálogo.
    const modeloIds = new Set(cat.modelos.map((m) => m.id));
    const motivoIds = new Set((cat.motivos ?? []).map((m) => m.id));
    const cores = new Set(cat.cores ?? []);
    const tams = new Set(cat.tamanhos ?? []);
    const validKeys = new Set(linhas.map((l) => l.key));

    const sugestoes: Sugestao[] = (parsed.sugestoes ?? [])
      .filter((s) => s && validKeys.has(s.key))
      .map((s) => ({
        key: s.key,
        modeloId: s.modeloId && modeloIds.has(s.modeloId) ? s.modeloId : undefined,
        motivoId: s.motivoId && motivoIds.has(s.motivoId) ? s.motivoId : undefined,
        cor: s.cor && cores.has(s.cor) ? s.cor : undefined,
        tamanho: s.tamanho && tams.has(s.tamanho) ? s.tamanho : undefined,
        confianca:
          s.confianca === "alta" || s.confianca === "media" || s.confianca === "baixa"
            ? s.confianca
            : "baixa",
      }));

    return new Response(JSON.stringify({ sugestoes }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("import-match falhou", (e as Error).message);
    return vazio(linhas);
  }
});
