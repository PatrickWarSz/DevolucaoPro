
# Novas funcionalidades — DevoluçõesPro

Três frentes que atacam suas duas dores (recuperar dinheiro em disputa + acabar com trabalho manual). Nada é removido, só somado ao que já existe.

**Checkpoint:** o Lovable salva versão a cada mensagem. Se não gostar depois, é só clicar em "Restaurar" numa mensagem anterior ou usar "Ver histórico". Sem risco de perder o estado atual.

---

## 1. Importador de planilha Shopee → A Caminho ⭐

Analisei sua planilha (`Order.return_refund...xls`, 49 colunas). Mapeamento:

| Campo da planilha | Vai virar |
|---|---|
| `ID da Devolução` | `devolucaoId` |
| `ID do pedido` | `pedidoId` |
| `Nome do Produto` | Modelo (match difuso com catálogo) |
| `Nome da variação` (ex: "Cinza Mescla,G") | Split em `cor` + `tamanho` |
| `Motivo da Devolução` + `Observações da Devolução` | Motivo (map) + `notas` |
| `Preço da unidade` | `valor` (converte "R$53,90" → 53.90) |
| `Quantidade de Devoluções` | `quantidade` |
| `Data de criação do pedido` | `createdAt` |
| Empresa | Sempre a empresa Shopee que você selecionar antes |

**Fluxo (3 telas):**

1. Botão **"Importar planilha Shopee"** na `/a-caminho`. Seleciona qual empresa+conta Shopee é dona da planilha.
2. Upload `.xls`/`.xlsx` — parseado no navegador com SheetJS. Nada sai da máquina.
3. **Tela de revisão** com cada linha classificada:
   - 🟢 **Pronto** — tudo bateu, modelo/cor/tamanho existem no catálogo.
   - 🟡 **Precisa revisar** — modelo não encontrado, cor/tamanho novos, ou motivo desconhecido. Você resolve inline (dropdown pra escolher modelo ou "criar novo", igual VariantPicker).
   - 🔴 **Duplicado** — `pedidoId` já existe em A Caminho ou Devoluções. Pulado automaticamente.
   - ⚫ **Ignorado** — status na Shopee é "Reembolso completo" ou finalizado (não faz sentido virar "a caminho").
4. Confirmar → cria os `PedidoACaminho` de uma vez. Log final: X importados, Y ignorados, Z duplicados.

**Regra sua respeitada:** nenhuma linha entra automaticamente se tiver divergência. Amarelo bloqueia até você resolver.

Arquivos: `src/lib/importers/shopee.ts` (parser + normalizador), `src/components/ImportShopeeDialog.tsx` (wizard 3 passos), edit `src/pages/ACaminho.tsx` (botão), `bun add xlsx`.

---

## 2. Central de Disputas (upgrade da `/disputas`)

Vira o cockpit onde você recupera dinheiro.

- **Countdown de prazo por plataforma** (Shopee 2d, ML 3d, Shein/TikTok configuráveis em Configurações). Cor: verde → amarelo (24h) → vermelho (vencendo).
- **Ordenação padrão**: prazo mais curto primeiro.
- **Checklist de anexos por motivo** (marcadores locais, só pra você não esquecer): defeito pede foto+vídeo+conversa; item errado pede foto do produto+etiqueta; etc.
- **Gerador de texto de mediação com IA** (Gemini nativo, mesmo padrão da `ai-insights`): botão "Gerar argumento" → devolve texto pronto pra colar na mediação da Shopee/ML. Três tons: formal, firme, conciliador. Botão "Copiar".

Arquivos: edit `src/pages/Disputas.tsx`, novo `src/components/DisputaCard.tsx`, nova edge function `dispute-argument`.

---

## 3. Ações em lote no Relatório Integrado

Na tabela do Dashboard:

- Checkbox por linha + "selecionar todos os filtrados".
- Barra flutuante quando tem seleção: **Mudar status**, **Excluir**, **Exportar CSV das selecionadas**.
- Botão fixo **Exportar CSV** do recorte inteiro (para contador/controle).

Arquivos: edit `src/pages/Dashboard.tsx`, novo `src/lib/csvExport.ts`.

---

## Ordem de execução

1. **Importador Shopee** primeiro (você acabou de mandar a planilha, tá fresco, e é o que mais economiza tempo).
2. **Central de Disputas** (impacto direto em recuperação).
3. **Ações em lote** (rápido, fecha a lista).

Se não gostar de algo depois, restaura a versão pela chat. Aprovando, começo pelo importador.
