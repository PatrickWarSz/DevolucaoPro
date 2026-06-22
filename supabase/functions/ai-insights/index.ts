// Edge Function: ai-insights
// Recebe um resumo agregado do dashboard de Devoluções e devolve análise
// estruturada feita por IA (Gemini via Lovable AI Gateway), no papel de
// um gerente de operações + engenheiro de produção especialista em
// e-commerce e devoluções.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};


interface Breakdown {
  label: string;
  qtd: number;
}

interface ProdutoResumo {
  modelo: string;
  qtdTotal: number;
  devolucoesCount: number;
  motivos: Breakdown[];
  tamanhos: Breakdown[];
  cores: Breakdown[];
  defeitos: Breakdown[];
  notas?: string[];
}

interface NotaRecente {
  modelo: string;
  motivo: string;
  status: string;
  nota: string;
}

interface InsightInput {
  recorte: {
    competencia?: string;
    empresa?: string;
    plataforma?: string;
    status?: string;
    motivo?: string;
  };
  totais: {
    totalDevolucoes: number;
    totalItens: number;
    valorPerda: number;
    valorRecuperado: number;
    disputasAbertas: number;
    valorEmDisputa: number;
    taxaRecuperacao: number;
  };
  evolucaoMensal: Array<{ mes: string; resolvidas: number; disputas: number; perdas: number }>;
  porEmpresa: Array<{ name: string; value: number }>;
  porMotivo: Array<{ name: string; value: number }>;
  produtos: ProdutoResumo[];
  notasRecentes?: NotaRecente[];
  pergunta?: string;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY"); // <-- Aqui mudou
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY ausente" }), { // <-- Aqui também
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
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const system = `Você é um gerente de operações sênior e engenheiro de produção
especialista em e-commerce, logística reversa e devoluções no Brasil. Sua missão é
analisar os dados que o lojista te entrega e devolver INSIGHTS ACIONÁVEIS — coisas
que ele NÃO está vendo no dashboard sozinho.

Regras:
- Fale direto, em português do Brasil, tom executivo. Sem floreios.
- Use números do payload (R$, %, quantidades) para dar peso aos pontos.
- Aponte concentrações suspeitas (um modelo, tamanho, cor ou defeito que domina).
- Aponte risco financeiro real (disputas em aberto, perdas confirmadas, tendência).
- Quando o usuário fizer uma PERGUNTA, responda no campo "resposta" com foco,
  cruzando com os dados. Se não houver pergunta, deixe "resposta" como null.
- Cada item de alerta/oportunidade/ação deve ser UMA frase curta e específica.
- NÃO invente dados que não estão no payload.
- Quando houver NOTAS qualitativas (observações livres do operador, ex.: "veio com mancha",
  "tamanho menor que o padrão", "cliente disse que rasgou na primeira lavagem"), use-as
  para enriquecer o diagnóstico — elas costumam revelar a CAUSA RAIZ que os agregados
  numéricos não mostram. Cite padrões recorrentes nas notas (palavras/temas que se repetem).`;

    const user = `Analise estes dados de devoluções e me entregue insights como se você
fosse o gerente da operação. Foque no que eu provavelmente NÃO vejo só olhando o
dashboard.

RECORTE ATUAL: ${JSON.stringify(body.recorte)}

INDICADORES:
${JSON.stringify(body.totais, null, 2)}

EVOLUÇÃO MENSAL (R$ por status):
${JSON.stringify(body.evolucaoMensal, null, 2)}

VOLUME POR EMPRESA:
${JSON.stringify(body.porEmpresa, null, 2)}

PRINCIPAIS MOTIVOS (por itens):
${JSON.stringify(body.porMotivo, null, 2)}

TOP PRODUTOS QUE MAIS VOLTAM (com motivos, tamanhos, cores, defeitos e notas do operador):
${JSON.stringify(body.produtos, null, 2)}

${body.notasRecentes && body.notasRecentes.length > 0
  ? `NOTAS RECENTES (observações livres do operador — descrição qualitativa do que houve em cada devolução):
${JSON.stringify(body.notasRecentes, null, 2)}

Use essas notas para identificar PADRÕES e CAUSAS-RAIZ (ex.: vários "veio com mancha" no mesmo modelo → problema de embalagem/transporte; muitos "ficou pequeno" → grade de tamanho fora do padrão de mercado).`
  : "SEM NOTAS QUALITATIVAS no recorte — baseie-se apenas nos agregados."}

${body.pergunta ? `PERGUNTA DO USUÁRIO: ${body.pergunta}` : "SEM PERGUNTA — entregue diagnóstico geral."}


Responda APENAS no formato JSON abaixo, sem texto extra:
{
  "resumo": "1-2 frases com o diagnóstico geral da operação no recorte.",
  "alertas": ["até 4 frases curtas sobre riscos / pontos críticos / coisas que vão piorar"],
  "oportunidades": ["até 4 frases curtas sobre o que dá pra recuperar / economizar / negociar"],
  "acoes": ["até 5 ações concretas e priorizadas para tomar nos próximos 7-30 dias"],
  "resposta": ${body.pergunta ? '"resposta direta à pergunta, cruzando com os dados"' : "null"}
}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos no workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "Falha na IA", detail: errText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    const content: string = data?.choices?.[0]?.message?.content ?? "{}";

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch {
      // fallback: devolve como resumo cru
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
