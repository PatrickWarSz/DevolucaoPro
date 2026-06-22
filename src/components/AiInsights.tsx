/**
 * AiInsights.tsx
 *
 * Card de insights de IA do Dashboard. Recebe um resumo agregado e fala
 * com a edge function `dev-dashboard-ai` (VEXO → Gemini 2.0 Flash), no
 * papel de "gerente de operações + engenheiro de produção".
 *
 * Mostra: diagnóstico, alertas, oportunidades, próximas ações.
 * Permite também o usuário PERGUNTAR algo específico ("por que tantas
 * devoluções de tamanho M?", "o que esconde nas disputas abertas?", etc.).
 */

import { useState } from "react";
import { Sparkles, AlertTriangle, TrendingUp, ListChecks, MessageSquare, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

interface Insight {
  resumo?: string;
  alertas?: string[];
  oportunidades?: string[];
  acoes?: string[];
  resposta?: string | null;
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
  evolucaoMensal: Array<{ mes: string; resolvidas: number; disputas: number; perdas: number }>;
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
        body: { payload, pergunta: perguntaTexto },
      });
      if (error || (data as { error?: string })?.error) {
        throw new Error(
          (data as { error?: string })?.error ?? error?.message ?? "Falha na IA",
        );
      }
      setInsight(data as Insight);
      setUltimaPergunta(perguntaTexto ?? null);
    } catch (e) {
      toast({
        title: "Não consegui gerar insights",
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

  return (
    <section className="rounded-lg border border-primary/20 bg-gradient-to-br from-primary-soft/40 via-card to-card p-4 shadow-xs">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight flex items-center gap-2">
              Insights de IA
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
                Beta
              </span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Um gerente de operações analisa seus dados, aponta riscos ocultos e sugere ações.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => rodar()}
          disabled={loading}
          className="shrink-0"
        >
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
            Clique em <span className="font-medium text-foreground">Gerar análise</span> para a IA cruzar
            todos os dados do recorte atual e te entregar diagnóstico, alertas e próximas ações.
          </p>
        </div>
      )}

      {loading && !insight && (
        <div className="mt-4 space-y-2">
          <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
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
              <p className="mt-2 text-sm leading-relaxed">{insight.resposta}</p>
            </div>
          )}

          {insight.resumo && (
            <p className="text-sm leading-relaxed text-foreground">{insight.resumo}</p>
          )}

          <div className="grid gap-3 md:grid-cols-3">
            <InsightList
              icon={<AlertTriangle className="h-3.5 w-3.5" />}
              title="Alertas"
              items={insight.alertas}
              tone="destructive"
            />
            <InsightList
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              title="Oportunidades"
              items={insight.oportunidades}
              tone="success"
            />
            <InsightList
              icon={<ListChecks className="h-3.5 w-3.5" />}
              title="Próximas ações"
              items={insight.acoes}
              tone="primary"
            />
          </div>
        </div>
      )}

      <form onSubmit={onPerguntar} className="mt-4 flex items-center gap-2 border-t border-border/50 pt-3">
        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Input
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          placeholder="Pergunte algo à IA. Ex: por que tantas devoluções de tamanho M?"
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

function InsightList({
  icon,
  title,
  items,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  items?: string[];
  tone: "destructive" | "success" | "primary";
}) {
  const headCls = {
    destructive: "text-destructive",
    success: "text-success",
    primary: "text-primary",
  }[tone];
  const dotCls = {
    destructive: "bg-destructive",
    success: "bg-success",
    primary: "bg-primary",
  }[tone];
  const list = items ?? [];
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className={"flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider " + headCls}>
        {icon}
        {title}
      </div>
      {list.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">Nada a destacar.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {list.map((t, i) => (
            <li key={i} className="flex gap-2 text-xs leading-relaxed">
              <span className={"mt-1.5 h-1 w-1 shrink-0 rounded-full " + dotCls} />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}