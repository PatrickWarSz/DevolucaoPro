# IA por baixo dos panos no importador da planilha

Objetivo: quando você importa a planilha da Shopee, o sistema deve **encaixar nos cadastros que já existem** (cor "PRETO" e não criar "Preta"), acertar o modelo mesmo com palavras que ele não conhece ("legging cirre") e escolher o motivo lendo o comentário do cliente. Nada novo aparece na tela: só as sugestões ficam melhores.

## Como vai funcionar (3 camadas, nessa ordem)

**1. Normalização contra o catálogo (determinística, instantânea)**

Antes de qualquer IA, a cor/tamanho vindos da planilha são "casados" com o que já está cadastrado:

- Ignora acento, caixa e plural/gênero: `Preta`, `preto`, `PRETAS` → **PRETO** (o nome exatamente como está no seu catálogo).
- Respeita o vínculo do modelo: se o modelo escolhido só tem `PRETO/OFF MESCLA`, a busca acontece primeiro dentro dessas cores.
- Cor composta de kit (`Preto/Off Mescla`) é quebrada e cada pedaço casa com uma cor do catálogo — vira base para sugerir os 2 itens do kit.
- Tamanho igual: `gg`, `G.G`, `Extra Grande` → o tamanho cadastrado equivalente.
- Só quando nada casa é que o texto cru fica lá (como hoje), marcado em amarelo.

**2. Memória de importações e registros anteriores (recorrência)**

O sistema passa a olhar o histórico antes de sugerir:

- Texto de produto da planilha que você já vinculou a um modelo antes → mesmo modelo, sem perguntar de novo.
- Combinação motivo-Shopee + comentário parecido → motivo que você escolheu nas vezes anteriores.
- Frequência conta: se `LEGGING CIRRE` já apareceu 8 vezes ligada a um modelo, isso vence qualquer palpite novo.

Essa memória é aprendida sozinha das devoluções e pedidos já salvos, mais um registro leve de "o que você corrigiu na revisão".

**3. IA (Gemini) só nas linhas duvidosas**

Depois das duas camadas acima, as linhas que ficaram sem modelo/motivo (ou com match fraco) vão em **uma única chamada em lote** para uma função de servidor nova. A IA recebe:

- as linhas duvidosas (produto, variação, motivo Shopee, comentário do cliente);
- seu catálogo real (modelos, cores, tamanhos, motivos) — ela **só pode escolher entre esses**;
- exemplos de vínculos que você já fez antes (a memória da camada 2).

Ela devolve, por linha: modeloId, cor, tamanho, motivoId e um nível de confiança. Regras:

- Confiança alta → a linha já vem preenchida e verde.
- Confiança média/baixa → vem preenchida, mas **amarela**, exigindo seu OK (sua regra de nunca importar divergência automática continua valendo).
- IA fora do ar, sem chave, lenta ou resposta inválida → importador segue exatamente como hoje, sem erro na sua frente.
- Qualquer id inventado pela IA que não exista no catálogo é descartado.

Enquanto isso o botão de importar mostra "Analisando…" por alguns segundos; nenhum painel de IA novo.

## Detalhes técnicos

- `src/lib/importers/normalize.ts` (novo): normalização pt-BR (acento, plural, gênero), `matchCatalog(texto, opções)` para cor/tamanho/modelo/motivo, split de cor composta de kit.
- `src/lib/importers/shopee.ts`: `ClassifyContext` ganha `cores`, `tamanhos`, `modeloVariantes` e o índice de histórico; `matchModelo` passa a pesar tokens raros (palavras como "cirre" valem mais que "legging") e exige token distintivo em comum; `matchMotivo` passa a ler também o comentário do cliente; `classifyRows` retorna `confianca` por linha.
- `src/lib/importers/history.ts` (novo): monta o índice de recorrência a partir de `devolucoes` + `pedidosACaminho`, mais um mapa de correções persistido no store local.
- `supabase/functions/import-match/index.ts` (nova edge function): mesmo padrão da `ai-insights` (Gemini nativo, `GEMINI_API_KEY_DEVOLUCAO`, JSON estrito), recebe lote + catálogo, responde sugestões por linha. Timeout curto e falha silenciosa.
- `src/components/ImportShopeeDialog.tsx`: passa o contexto ampliado, chama a função em lote entre o passo de upload e a tela de revisão, aplica sugestões só onde o campo está vazio, e nunca sobrescreve o que você editou à mão.

Nada é removido: telas, semáforo (verde/amarelo/duplicado/ignorado), kits e edição inline continuam iguais.
