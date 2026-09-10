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
    // AQUI: Puxando o segredo exclusivo das Devoluções!
    const apiKey = Deno.env.get("GEMINI_API_KEY_DEVOLUCAO");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY_DEVOLUCAO ausente" }), {
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
          diagnostico: "Ainda não há devoluções no recorte atual para analisar.",
          indicadores: [],
          causas: [],
          produtos: [],
          riscos: [],
          resposta: null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const system = `Você é um analista sênior de Returns & Refunds (devoluções e reembolsos) de uma operação de e-commerce brasileira de médio/grande porte, com formação em engenharia de produção e controladoria. Você escreve o parecer analítico mensal que vai para a diretoria.

Como você trabalha:
- Português do Brasil, tom técnico-executivo, frases densas e afirmativas. Zero linguagem motivacional, zero clichê ("é importante monitorar", "vale a pena analisar").
- NÃO dê recomendações, planos de ação, sugestões ou "próximos passos". Seu papel aqui é EXPLICAR a realidade, não instruir. Se identificar algo, descreva o mecanismo e o efeito financeiro, não o que fazer.
- Toda afirmação precisa estar ancorada em número do payload: quantidade, participação em % do total, R$, ticket médio, taxa de recuperação. Calcule participações e médias você mesmo (ex.: 14 de 62 = 22,6% do volume).
- Interprete, não repita. "Motivo X tem 12 casos" é dado; a leitura é o que 12 casos significam em concentração, custo médio por caso e comparação com os demais motivos.
- Distinga com rigor os três blocos financeiros: perda consolidada, valor recuperado (e a taxa de recuperação implícita) e valor ainda em risco nas disputas em aberto. Aponte quando o valor em risco é grande frente à perda já consolidada.
- Leia os motivos de devolução como comportamento de comprador: arrependimento/desistência, expectativa quebrada (foto, descrição, caimento), erro de grade/tamanho, falha de qualidade/defeito, erro logístico. Separe o que é responsabilidade da operação do que é comportamento do canal/comprador — isso muda quem absorve o custo.
- Use as NOTAS e comentários dos clientes como evidência qualitativa: cite trechos ou o padrão de linguagem quando eles explicam um número.
- Cruze dimensões: um mesmo modelo aparecendo em vários motivos, um motivo concentrado em uma cor/tamanho/peça de kit, uma empresa/plataforma com perfil de perda diferente das outras, tendência mês a mês na evolução.
- Se a amostra for pequena, diga explicitamente que a leitura é indicativa e não conclusiva, em vez de inventar padrão.
- NUNCA invente dados, produto, motivo ou valor que não esteja no payload.
- Responda estritamente no JSON pedido, sem markdown e sem texto fora do JSON.`;

    const user = `Emita o parecer analítico de devoluções e reembolsos sobre o recorte abaixo.
RECORTE: ${JSON.stringify(body.recorte)}
INDICADORES: ${JSON.stringify(body.totais)}
EVOLUÇÃO MENSAL: ${JSON.stringify(body.evolucaoMensal)}
POR EMPRESA/LOJA: ${JSON.stringify(body.porEmpresa)}
POR MOTIVO: ${JSON.stringify(body.porMotivo)}
PRODUTOS (com motivos, tamanhos, cores, defeitos, peças de kit): ${JSON.stringify(body.produtos)}
NOTAS E COMENTÁRIOS: ${JSON.stringify(body.notasRecentes || [])}
PERGUNTA DO USUÁRIO: ${body.pergunta || "Nenhuma"}

Formato JSON obrigatório (sem nenhum outro texto):
{
  "diagnostico": "3 a 5 frases densas: o que este recorte é, o peso financeiro, a natureza dominante das devoluções e o que mais chama atenção. Com números.",
  "indicadores": [
    { "label": "nome curto do indicador", "valor": "valor formatado (R$, % ou quantidade)", "leitura": "uma frase interpretando esse número no contexto" }
  ],
  "financeiro": {
    "leitura": "2 a 4 frases sobre perda consolidada, valor recuperado, taxa de recuperação e valor ainda em risco nas disputas em aberto, com o custo médio por devolução.",
    "perdaPorDevolucao": "R$ médio de perda por devolução (calculado), ou null",
    "exposicao": "1 frase sobre o tamanho do valor em risco frente à perda já consolidada, ou null"
  },
  "causas": [
    { "titulo": "mecanismo em até 6 palavras", "evidencia": "os números e/ou trechos de nota que sustentam", "impacto": "efeito financeiro/operacional estimado a partir dos dados" }
  ],
  "produtos": [
    { "modelo": "nome exato do modelo", "achado": "o padrão específico observado (motivo, variação, peça, recorrência) com números", "peso": "participação no volume ou na perda" }
  ],
  "comportamento": "2 a 4 frases lendo os motivos e comentários como comportamento de comprador e expectativa quebrada, separando o que é operação do que é canal/comprador.",
  "riscos": ["até 4 frases: onde o resultado pode piorar segundo os próprios dados, cada uma com número"],
  "confianca": "uma frase sobre o tamanho e a qualidade da amostra e o quanto a leitura é conclusiva",
  "resposta": ${body.pergunta ? '"resposta analítica e direta à pergunta, cruzando os dados disponíveis"' : "null"}
}
Use até 5 itens em "indicadores", até 4 em "causas" e até 5 em "produtos". Omita um array vazio como [] em vez de inventar conteúdo.`;

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
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.35,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      let msg = `Falha na IA (${aiRes.status}) com modelo "${model}": ${errText.slice(0, 400)}`;
      if (aiRes.status === 429) msg = "Muitas requisições à IA agora — tente novamente em alguns segundos.";
      if (aiRes.status === 401 || aiRes.status === 403) msg = `Chave GEMINI_API_KEY_DEVOLUCAO inválida, restrita ou sem permissão. Detalhe da Google: ${errText.slice(0, 300)}`;
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