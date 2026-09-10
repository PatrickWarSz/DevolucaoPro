/**
 * AiInsights.tsx
 *
 * Parecer analítico de devoluções e reembolsos no Dashboard. Fala com a edge
 * function `ai-insights`, que atua como analista sênior de Returns & Refunds:
 * diagnóstico, indicadores lidos, leitura financeira, causas, produtos
 * críticos, comportamento do comprador e riscos. Sem sugestões de ação.
 */

import { useState } from "react";
import {
  Sparkles,
  AlertTriangle,
  MessageSquare,
  Loader2,
  RefreshCw,
  Wallet,
  Search,
  Package,
  Users,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { FunctionsHttpError } from "@supabase/supabase-js";

interface IndicadorLido {
  label?: string;
  valor?: string;
  leitura?: string;
}

interface Causa {
  titulo?: string;
  evidencia?: string;
  impacto?: string;
}

interface ProdutoCritico {
  modelo?: string;
  achado?: string;
  peso?: string;
}

interface Insight {
  diagnostico?: string;
  indicadores?: IndicadorLido[];
  financeiro?: {
    leitura?: string;
    perdaPorDevolucao?: string | null;
    exposicao?: string | null;
  };
  causas?: Causa[];
  produtos?: ProdutoCritico[];
  comportamento?: string;
  riscos?: string[];
  confianca?: string;
  resposta?: string | null;
  /** compatibilidade com respostas antigas */
  resumo?: string;
}

export interface AiInsightPayload {
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
  evolucaoMensal: Array<{ mes: string; resolvidas: number; perdas: number; disputasQtd: number }>;
  porEmpresa: Array<{ name: string; value: number }>;
  porMotivo: Array<{ name: string; value: number }>;
  produtos: Array<{
    modelo: string;
    qtdTotal: number;
    devolucoesCount: number;
    motivos: Array<{ label: string; qtd: number }>;
    tamanhos: Array<{ label: string; qtd: number }>;
    cores: Array<{ label: string; qtd: number }>;
    defeitos: Array<{ label: string; qtd: number }>;
    notas?: string[];
  }>;
  notasRecentes?: Array<{
    modelo: string;
    motivo: string;
    status: string;
    nota: string;
  }>;
}

interface Props {
  payload: AiInsightPayload;
}

export function AiInsights({ payload }: Props) {
  const { toast } = useToast();
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(false);
  const [pergunta, setPergunta] = useState("");
  const [ultimaPergunta, setUltimaPergunta] = useState<string | null>(null);

  const rodar = async (perguntaTexto?: string) => {
    if (payload.totais.totalDevolucoes === 0) {
      toast({
        title: "Sem dados",
        description: "Registre algumas devoluções para a IA analisar.",
      });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-insights", {
        body: { ...payload, pergunta: perguntaTexto },
      });
      if (error || (data as { error?: string })?.error) {
        // supabase-js descarta o corpo da resposta quando o status não é
        // 2xx — sem isso, a mensagem vira só "non-2xx status code".
        let motivo = (data as { error?: string })?.error;
        if (!motivo && error instanceof FunctionsHttpError) {
          try {
            motivo = (await error.context.json())?.error;
          } catch {
            // corpo não veio em JSON — segue pro fallback abaixo
          }
        }
        throw new Error(motivo ?? error?.message ?? "Falha na IA");
      }
      setInsight(data as Insight);
      setUltimaPergunta(perguntaTexto ?? null);
    } catch (e) {
      toast({
        title: "Não consegui gerar a análise",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const onPerguntar = (e: React.FormEvent) => {
    e.preventDefault();
    const t = pergunta.trim();
    if (!t) return;
    rodar(t);
    setPergunta("");
  };

  const diagnostico = insight?.diagnostico ?? insight?.resumo;
  const indicadores = (insight?.indicadores ?? []).filter((i) => i?.valor || i?.leitura);
  const causas = (insight?.causas ?? []).filter((c) => c?.titulo || c?.evidencia);
  const produtos = (insight?.produtos ?? []).filter((p) => p?.modelo);
  const riscos = (insight?.riscos ?? []).filter(Boolean);

  return (
    <section className="rounded-lg border border-primary/20 bg-gradient-to-br from-primary-soft/40 via-card to-card p-4 shadow-xs">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight flex items-center gap-2">
              Análise de devoluções e reembolsos
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
                IA
              </span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Parecer técnico sobre perdas, recuperação, motivos dos compradores e produtos críticos do recorte.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => rodar()} disabled={loading} className="shrink-0">
          {loading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              Analisando…
            </>
          ) : insight ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Reanalisar
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              Gerar análise
            </>
          )}
        </Button>
      </header>

      {!insight && !loading && (
        <div className="mt-4 rounded-md border border-dashed border-border bg-surface-muted/30 p-4 text-center">
          <p className="text-xs text-muted-foreground">
            Clique em <span className="font-medium text-foreground">Gerar análise</span> para receber o parecer
            completo do recorte atual: leitura financeira, causas por trás das devoluções e produtos que
            concentram perda.
          </p>
        </div>
      )}

      {loading && !insight && (
        <div className="mt-4 space-y-2">
          <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
        </div>
      )}

      {insight && (
        <div className="mt-4 space-y-4">
          {ultimaPergunta && insight.resposta && (
            <div className="rounded-md border border-info/30 bg-info-soft/40 p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-info-soft-foreground">
                <MessageSquare className="h-3 w-3" />
                Resposta à sua pergunta
              </div>
              <p className="mt-1 text-xs text-muted-foreground italic">"{ultimaPergunta}"</p>
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">{insight.resposta}</p>
            </div>
          )}

          {diagnostico && (
            <div className="rounded-md border border-border bg-card p-3.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <Search className="h-3.5 w-3.5" />
                Diagnóstico do recorte
              </div>
              <p className="mt-2 text-sm leading-relaxed text-foreground whitespace-pre-line">{diagnostico}</p>
            </div>
          )}

          {indicadores.length > 0 && (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {indicadores.map((ind, i) => (
                <div key={i} className="rounded-md border border-border bg-card p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {ind.label}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular leading-none">{ind.valor}</p>
                  {ind.leitura && (
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{ind.leitura}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {insight.financeiro?.leitura && (
            <div className="rounded-md border border-border bg-card p-3.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-warning">
                <Wallet className="h-3.5 w-3.5" />
                Leitura financeira
              </div>
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">{insight.financeiro.leitura}</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {insight.financeiro.perdaPorDevolucao && (
                  <span className="rounded-md bg-surface-muted/60 px-2 py-1 text-xs tabular">
                    Perda média por devolução:{" "}
                    <span className="font-medium text-foreground">{insight.financeiro.perdaPorDevolucao}</span>
                  </span>
                )}
                {insight.financeiro.exposicao && (
                  <span className="rounded-md bg-surface-muted/60 px-2 py-1 text-xs text-muted-foreground">
                    {insight.financeiro.exposicao}
                  </span>
                )}
              </div>
            </div>
          )}

          {causas.length > 0 && (
            <div className="rounded-md border border-border bg-card p-3.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-primary">
                <Search className="h-3.5 w-3.5" />
                Causas por trás das devoluções
              </div>
              <div className="mt-2.5 space-y-3">
                {causas.map((c, i) => (
                  <div key={i} className="border-l-2 border-primary/40 pl-3">
                    <p className="text-sm font-medium leading-snug">{c.titulo}</p>
                    {c.evidencia && (
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        <span className="font-medium text-foreground/80">Evidência: </span>
                        {c.evidencia}
                      </p>
                    )}
                    {c.impacto && (
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        <span className="font-medium text-foreground/80">Impacto: </span>
                        {c.impacto}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {produtos.length > 0 && (
            <div className="rounded-md border border-border bg-card p-3.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <Package className="h-3.5 w-3.5" />
                Produtos que concentram o problema
              </div>
              <div className="mt-2.5 divide-y divide-border/60">
                {produtos.map((p, i) => (
                  <div key={i} className="py-2 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-medium leading-snug">{p.modelo}</p>
                      {p.peso && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium tabular text-primary">
                          {p.peso}
                        </span>
                      )}
                    </div>
                    {p.achado && (
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{p.achado}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {insight.comportamento && (
              <div className="rounded-md border border-border bg-card p-3.5">
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-info">
                  <Users className="h-3.5 w-3.5" />
                  Comportamento do comprador
                </div>
                <p className="mt-2 text-xs leading-relaxed whitespace-pre-line">{insight.comportamento}</p>
              </div>
            )}

            {riscos.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-card p-3.5">
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-destructive">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Onde o resultado pode piorar
                </div>
                <ul className="mt-2 space-y-1.5">
                  {riscos.map((r, i) => (
                    <li key={i} className="flex gap-2 text-xs leading-relaxed">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-destructive/70" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {insight.confianca && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-medium">Base da análise: </span>
              {insight.confianca}
            </p>
          )}
        </div>
      )}

      <form onSubmit={onPerguntar} className="mt-4 flex items-center gap-2 border-t border-border/50 pt-3">
        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Input
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          placeholder="Pergunte algo à análise. Ex: por que a perda subiu no mês passado?"
          className="h-8 text-sm"
          disabled={loading}
        />
        <Button type="submit" size="sm" variant="outline" disabled={loading || !pergunta.trim()}>
          Perguntar
        </Button>
      </form>
    </section>
  );
}
