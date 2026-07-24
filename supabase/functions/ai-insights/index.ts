// Edge Function: ai-insights
// Conexão DIRETA e NATIVA com o Google Gemini. Modelo configurável via
// secret GEMINI_MODEL (padrão: gemini-3.5-flash-lite — mesma decisão do
// FocoFinanceiro, tier gratuito confirmado em jul/2026).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Breakdown { label: string; qtd: number; }

interface ProdutoResumo {
  modelo: string;
  qtdTotal: number;
  devolucoesCount: number;
  motivos: Breakdown[];
  tamanhos: Breakdown[];
  cores: Breakdown[];
  defeitos: Breakdown[];
  componentes?: Breakdown[];
  notas?: string[];
}

interface NotaRecente { modelo: string; motivo: string; status: string; nota: string; }

interface InsightInput {
  recorte: any;
  totais: {
    totalDevolucoes: number;
    totalItens: number;
    valorPerda: number;
    valorRecuperado: number;
    disputasAbertas: number;
    valorEmDisputa: number;
    taxaRecuperacao: number;
  };
  evolucaoMensal: any;
  porEmpresa: any;
  porMotivo: any;
  produtos: ProdutoResumo[];
  notasRecentes?: NotaRecente[];
  pergunta?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY ausente" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as InsightInput;

    if (!body?.totais || typeof body.totais.totalDevolucoes !== "number") {
      return new Response(JSON.stringify({ error: "Payload inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.totais.totalDevolucoes === 0) {
      return new Response(
        JSON.stringify({
          resumo: "Ainda não há devoluções no recorte atual para analisar.",
          alertas: [],
          oportunidades: [],
          acoes: [],
          resposta: null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const system = `Você é um gerente de operações sênior e engenheiro de produção especialista em e-commerce, logística reversa e devoluções no Brasil.
Regras:
- Fale direto, em português do Brasil, tom executivo.
- Use números do payload (R$, %, quantidades) para dar peso aos pontos.
- Aponte concentrações suspeitas (modelo, tamanho, cor ou defeito).
- Aponte risco financeiro real (disputas em aberto, perdas confirmadas).
- Quando o usuário fizer uma PERGUNTA, responda no campo "resposta" cruzando com os dados. Se não houver, deixe "null".
- Cada item de alerta/oportunidade/ação deve ser UMA frase curta e específica.
- NÃO invente dados.
- Responda estritamente no formato JSON fornecido.`;

    const user = `Analise estes dados de devoluções e me entregue insights:
RECORTE: ${JSON.stringify(body.recorte)}
INDICADORES: ${JSON.stringify(body.totais)}
EVOLUÇÃO: ${JSON.stringify(body.evolucaoMensal)}
EMPRESAS: ${JSON.stringify(body.porEmpresa)}
MOTIVOS: ${JSON.stringify(body.porMotivo)}
PRODUTOS: ${JSON.stringify(body.produtos)}
NOTAS: ${JSON.stringify(body.notasRecentes || [])}
PERGUNTA: ${body.pergunta || "Nenhuma"}

Responda APENAS no formato JSON abaixo:
{
  "resumo": "1-2 frases com o diagnóstico geral.",
  "alertas": ["até 4 frases curtas sobre riscos"],
  "oportunidades": ["até 4 frases curtas de melhorias"],
  "acoes": ["até 5 ações concretas e priorizadas"],
  "resposta": ${body.pergunta ? '"resposta direta à pergunta"' : "null"}
}`;

    // Modelo configurável — mesmo padrão do FocoFinanceiro. Se a Google
    // trocar o tier grátis de novo, ajusta o secret GEMINI_MODEL no
    // Supabase e reimplanta, sem tocar neste arquivo.
    const model = Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash-lite";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const aiRes = await fetch(url, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [ { role: "user", parts: [{ text: user }] } ],
        generationConfig: { responseMimeType: "application/json" }
      }),
    });

    if (!aiRes.ok) {
      // Erro cru da Google na resposta — sem isso a gente volta a adivinhar.
      const errText = await aiRes.text();
      let msg = `Falha na IA (${aiRes.status}) com modelo "${model}": ${errText.slice(0, 400)}`;
      if (aiRes.status === 429) msg = "Muitas requisições à IA agora — tente novamente em alguns segundos.";
      if (aiRes.status === 401 || aiRes.status === 403) msg = `Chave GEMINI_API_KEY inválida, restrita ou sem permissão. Detalhe da Google: ${errText.slice(0, 300)}`;
      if (aiRes.status === 404) msg = `Modelo "${model}" não encontrado/disponível pra essa chave. Confira em aistudio.google.com/apikey e ajuste o secret GEMINI_MODEL. Detalhe: ${errText.slice(0, 200)}`;
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { resumo: content, alertas: [], oportunidades: [], acoes: [], resposta: null };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[ai-insights] erro:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});