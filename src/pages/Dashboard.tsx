import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/KpiCard";
import { useStore, lookup } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  downloadCSV,
  fmtBRL,
  fmtBRLCompact,
  fmtDate,
  motivoGeraPerda,
  statusLabel,
  valorEfetivo,
  valorTotal,
  quantidadeTotal,
} from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { AiInsights, type AiInsightPayload } from "@/components/AiInsights";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, TrendingDown, Activity, Percent, Package, Trash2, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import type { Devolucao } from "@/lib/types";
import { estimarCustoDevolucao } from "@/lib/platformConfig";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PIE_COLORS = [
  "hsl(217 91% 55%)",   // azul
  "hsl(28 92% 55%)",    // laranja
  "hsl(160 70% 42%)",   // verde
  "hsl(280 70% 58%)",   // roxo
  "hsl(0 75% 58%)",     // vermelho
  "hsl(48 95% 55%)",    // amarelo
  "hsl(190 80% 45%)",   // ciano
  "hsl(330 75% 58%)",   // rosa
  "hsl(120 40% 45%)",   // verde escuro
  "hsl(15 75% 50%)",    // terracota
];

const ALL = "__all__";

export default function Dashboard() {
  const devolucoes = useStore((s) => s.devolucoes);
  const deleteDevolucao = useStore((s) => s.deleteDevolucao);
  const empresas = useStore((s) => s.empresas);
  const plataformas = useStore((s) => s.plataformas);
  const modelos = useStore((s) => s.modelos);
  const pecas = useStore((s) => s.pecas);
  const motivos = useStore((s) => s.motivos);
  const tiposDefeito = useStore((s) => s.tiposDefeito);
  const { toast } = useToast();

  const [fEmpresa, setFEmpresa] = useState(ALL);
  const [fPlataforma, setFPlataforma] = useState(ALL);
  const [fStatus, setFStatus] = useState(ALL);
  const [fMotivo, setFMotivo] = useState(ALL);
  const [fCompetencia, setFCompetencia] = useState(ALL);
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [topN, setTopN] = useState(10);
  const [excluir, setExcluir] = useState<Devolucao | null>(null);
  const PAGE = 12;

  const competencias = useMemo(() => {
    const set = new Set<string>();
    devolucoes.forEach((d) => set.add(d.competencia));
    return Array.from(set).sort().reverse();
  }, [devolucoes]);

  const filtradas = useMemo(() => {
    return devolucoes.filter((d) => {
      if (fEmpresa !== ALL && d.empresaId !== fEmpresa) return false;
      if (fPlataforma !== ALL && d.plataformaId !== fPlataforma) return false;
      if (fStatus !== ALL && d.status !== fStatus) return false;
      if (fMotivo !== ALL && d.motivoId !== fMotivo) return false;
      if (fCompetencia !== ALL && d.competencia !== fCompetencia) return false;
      if (busca) {
        const q = busca.toLowerCase();
        const modelosTxt = d.itens.map((it) => lookup(modelos, it.modeloId)).join(" ");
        const txt = [d.pedidoId, d.devolucaoId, modelosTxt, lookup(empresas, d.empresaId)]
          .join(" ")
          .toLowerCase();
        if (!txt.includes(q)) return false;
      }
      return true;
    });
  }, [devolucoes, fEmpresa, fPlataforma, fStatus, fMotivo, fCompetencia, busca, modelos, empresas]);

  const stats = useMemo(() => {
    // Conta por DEVOLUÇÃO (header), soma por ITEM
    const totalDevolucoes = filtradas.length;
    const totalItens = filtradas.reduce((s, d) => s + quantidadeTotal(d), 0);
    // Apenas devoluções cujo motivo gera perda operacional entram nos
    // indicadores financeiros (recuperado / perda / em risco).
    const comPerda = filtradas.filter((d) => motivoGeraPerda(motivos, d.motivoId));
    // NOVO MODELO: trabalhamos com CUSTO REAL da devolução (frete + taxas),
    // não com valor bruto do pedido. valorEfetivo já aplica essa regra.
    const valorPerda = comPerda
      .filter((d) => d.status === "loss")
      .reduce((s, d) => s + valorEfetivo(d, motivos), 0);
    const valorRecuperado = comPerda
      .filter((d) => d.status === "resolved")
      .reduce((s, d) => s + valorEfetivo(d, motivos), 0);
    const disputasAbertas = filtradas.filter((d) => d.status === "dispute").length;
    // "Em risco" nas disputas = estimativa de custo se perder (taxa fixa + frete médio)
    const valorEmDisputa = comPerda
      .filter((d) => d.status === "dispute")
      .reduce((s, d) => s + (estimarCustoDevolucao(d.plataformaId) ?? 0), 0);
    const totalAvaliado = valorPerda + valorRecuperado;
    const taxaRecuperacao = totalAvaliado > 0 ? (valorRecuperado / totalAvaliado) * 100 : 0;
    const semPerda = filtradas.length - comPerda.length;
    return {
      totalDevolucoes,
      totalItens,
      valorPerda,
      valorRecuperado,
      disputasAbertas,
      valorEmDisputa,
      taxaRecuperacao,
      semPerda,
    };
  }, [filtradas, motivos]);

  const evolucaoMensal = useMemo(() => {
    const map = new Map<string, { mes: string; resolvidas: number; perdas: number; disputasQtd: number }>();
    filtradas.forEach((d) => {
      const key = d.competencia;
      const cur = map.get(key) ?? { mes: key, resolvidas: 0, perdas: 0, disputasQtd: 0 };
      const v = valorEfetivo(d, motivos);
      if (d.status === "resolved") cur.resolvidas += v;
      else if (d.status === "dispute") cur.disputasQtd += 1;
      else if (d.status === "loss") cur.perdas += v;
      map.set(key, cur);
    });
    return Array.from(map.values())
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-6)
      .map((m) => ({
        ...m,
        label: m.mes.split("-").reverse().join("/"),
      }));
  }, [filtradas, motivos]);

  const porEmpresa = useMemo(() => {
    const map = new Map<string, number>();
    filtradas.forEach((d) => {
      const k = lookup(empresas, d.empresaId);
      map.set(k, (map.get(k) ?? 0) + quantidadeTotal(d));
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filtradas, empresas]);

  const porMotivo = useMemo(() => {
    const map = new Map<string, number>();
    filtradas.forEach((d) => {
      const k = lookup(motivos, d.motivoId);
      map.set(k, (map.get(k) ?? 0) + quantidadeTotal(d));
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtradas, motivos]);

  // ============== Análise de Produto ==============
  // Um único ranking: produtos que mais voltam, com drill-down do PORQUÊ
  // (motivos, tamanhos, cores, defeitos). Funciona para qualquer nicho —
  // não pressupõe roupa, eletrônico ou nada específico.

  const produtosAnalise = useMemo<ProdutoAnalise[]>(() => {
    type Acc = {
      modelo: string;
      qtdTotal: number;
      devolucoes: Set<string>;
      motivos: Map<string, number>;
      tamanhos: Map<string, number>;
      cores: Map<string, number>;
      defeitos: Map<string, number>;
      componentes: Map<string, number>;
      notas: string[];
    };
    const map = new Map<string, Acc>();
    const bump = (m: Map<string, number>, k: string, n: number) => {
      if (!k || k === "—") return;
      m.set(k, (m.get(k) ?? 0) + n);
    };
    filtradas.forEach((d) => {
      const motivoNome = lookup(motivos, d.motivoId);
      const defeitoNome = d.tipoDefeitoId ? lookup(tiposDefeito, d.tipoDefeitoId) : "";
      const notaTrim = (d.notas ?? "").trim();
      d.itens.forEach((it) => {
        const modelo = lookup(modelos, it.modeloId);
        const cur =
          map.get(modelo) ??
          ({
            modelo,
            qtdTotal: 0,
            devolucoes: new Set<string>(),
            motivos: new Map(),
            tamanhos: new Map(),
            cores: new Map(),
            defeitos: new Map(),
            componentes: new Map(),
            notas: [],
          } as Acc);
        cur.qtdTotal += it.quantidade;
        cur.devolucoes.add(d.id);
        bump(cur.motivos, motivoNome, it.quantidade);
        bump(cur.tamanhos, it.tamanho, it.quantidade);
        bump(cur.cores, it.cor, it.quantidade);
        bump(cur.componentes, lookup(pecas, it.pecaId), it.quantidade);
        if (defeitoNome) bump(cur.defeitos, defeitoNome, it.quantidade);
        if (notaTrim && !cur.notas.includes(notaTrim)) cur.notas.push(notaTrim);
        map.set(modelo, cur);
      });
    });
    const toBreakdown = (m: Map<string, number>): Breakdown[] =>
      Array.from(m.entries())
        .map(([label, qtd]) => ({ label, qtd }))
        .sort((a, b) => b.qtd - a.qtd);
    return Array.from(map.values())
      .map((acc) => ({
        modelo: acc.modelo,
        qtdTotal: acc.qtdTotal,
        devolucoesCount: acc.devolucoes.size,
        motivos: toBreakdown(acc.motivos),
        tamanhos: toBreakdown(acc.tamanhos),
        cores: toBreakdown(acc.cores),
        defeitos: toBreakdown(acc.defeitos),
        componentes: toBreakdown(acc.componentes),
        notas: acc.notas,
      }))
      .sort((a, b) => b.qtdTotal - a.qtdTotal)
      .slice(0, topN);
  }, [filtradas, modelos, motivos, tiposDefeito, pecas, topN]);


  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PAGE));
  const ordenadas = useMemo(
    () => [...filtradas].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [filtradas],
  );
  const pageData = ordenadas.slice((pagina - 1) * PAGE, pagina * PAGE);

  // Payload enxuto para a IA — só agregados, nada de PII de pedido.
  const aiPayload = useMemo<AiInsightPayload>(() => ({
    recorte: {
      competencia: fCompetencia === ALL ? undefined : fCompetencia,
      empresa: fEmpresa === ALL ? undefined : lookup(empresas, fEmpresa),
      plataforma: fPlataforma === ALL ? undefined : lookup(plataformas, fPlataforma),
      status: fStatus === ALL ? undefined : statusLabel[fStatus as keyof typeof statusLabel] ?? fStatus,
      motivo: fMotivo === ALL ? undefined : lookup(motivos, fMotivo),
    },
    totais: {
      totalDevolucoes: stats.totalDevolucoes,
      totalItens: stats.totalItens,
      valorPerda: Math.round(stats.valorPerda * 100) / 100,
      valorRecuperado: Math.round(stats.valorRecuperado * 100) / 100,
      disputasAbertas: stats.disputasAbertas,
      valorEmDisputa: Math.round(stats.valorEmDisputa * 100) / 100,
      taxaRecuperacao: Math.round(stats.taxaRecuperacao * 10) / 10,
    },
    evolucaoMensal: evolucaoMensal.map((m) => ({
      mes: m.mes,
      resolvidas: Math.round(m.resolvidas),
      disputasQtd: m.disputasQtd,
      perdas: Math.round(m.perdas),
    })),
    porEmpresa,
    porMotivo,
    produtos: produtosAnalise.slice(0, 10).map((p) => ({
      modelo: p.modelo,
      qtdTotal: p.qtdTotal,
      devolucoesCount: p.devolucoesCount,
      motivos: p.motivos.slice(0, 5),
      tamanhos: p.tamanhos.slice(0, 5),
      cores: p.cores.slice(0, 5),
      defeitos: p.defeitos.slice(0, 5),
      componentes: p.componentes.slice(0, 5),
      notas: p.notas.slice(0, 8),
    })),
    // Notas recentes do recorte — contexto qualitativo que a IA cruza com os agregados.
    // Limitamos a 25 itens (mais recentes) e 240 chars cada, pra evitar payload gigante.
    notasRecentes: filtradas
      .filter((d) => (d.notas ?? "").trim().length > 0)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 25)
      .map((d) => ({
        modelo: d.itens[0] ? lookup(modelos, d.itens[0].modeloId) : "—",
        motivo: lookup(motivos, d.motivoId),
        status: statusLabel[d.status],
        nota: (d.notas ?? "").trim().slice(0, 240),
      })),
  }), [stats, evolucaoMensal, porEmpresa, porMotivo, produtosAnalise, filtradas, fCompetencia, fEmpresa, fPlataforma, fStatus, fMotivo, empresas, plataformas, motivos, modelos]);


  const exportar = () => {
    // Exporta uma linha por ITEM, com dados do header repetidos para análise no Excel
    const rows = filtradas.flatMap((d) =>
      d.itens.map((it, idx) => ({
        Devolucao: d.devolucaoId,
        Pedido: d.pedidoId,
        Item: idx + 1,
        Data: fmtDate(d.createdAt),
        Competencia: d.competencia,
        Empresa: lookup(empresas, d.empresaId),
        Plataforma: lookup(plataformas, d.plataformaId),
        Modelo: lookup(modelos, it.modeloId),
        Componente: lookup(pecas, it.pecaId),
        Cor: it.cor,
        Tamanho: it.tamanho,
        Motivo: lookup(motivos, d.motivoId),
        TipoDefeito: d.tipoDefeitoId ? lookup(tiposDefeito, d.tipoDefeitoId) : "",
        Quantidade: it.quantidade,
        ValorTotalItem: it.valor,
        ValorRecuperado: d.valorRecuperado ?? "",
        Status: statusLabel[d.status],
      })),
    );
    downloadCSV(`devolucoes-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  const limparFiltros = () => {
    setFEmpresa(ALL);
    setFPlataforma(ALL);
    setFStatus(ALL);
    setFMotivo(ALL);
    setFCompetencia(ALL);
    setBusca("");
    setPagina(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Centro de inteligência. Cruze dados e exporte relatórios completos."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={limparFiltros}>
              Limpar filtros
            </Button>
            <Button variant="outline" size="sm" onClick={exportar} disabled={!filtradas.length}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Exportar CSV
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3 shadow-xs">
        <FilterSelect label="Empresa" value={fEmpresa} onChange={setFEmpresa}>
          <SelectItem value={ALL}>Todas as empresas</SelectItem>
          {empresas.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.nome}
            </SelectItem>
          ))}
        </FilterSelect>
        <FilterSelect label="Plataforma" value={fPlataforma} onChange={setFPlataforma}>
          <SelectItem value={ALL}>Todas plataformas</SelectItem>
          {plataformas.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.nome}
            </SelectItem>
          ))}
        </FilterSelect>
        <FilterSelect label="Competência" value={fCompetencia} onChange={setFCompetencia}>
          <SelectItem value={ALL}>Todas competências</SelectItem>
          {competencias.map((c) => (
            <SelectItem key={c} value={c}>
              {c.split("-").reverse().join("/")}
            </SelectItem>
          ))}
        </FilterSelect>
        <FilterSelect label="Status" value={fStatus} onChange={setFStatus}>
          <SelectItem value={ALL}>Todos status</SelectItem>
          <SelectItem value="resolved">Resolvidas</SelectItem>
          <SelectItem value="dispute">Em disputa</SelectItem>
          <SelectItem value="loss">Perdas</SelectItem>
          <SelectItem value="pending">Aguardando valor</SelectItem>
        </FilterSelect>
        <FilterSelect label="Motivo" value={fMotivo} onChange={setFMotivo}>
          <SelectItem value={ALL}>Todos motivos</SelectItem>
          {motivos.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.nome}
            </SelectItem>
          ))}
        </FilterSelect>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Devoluções"
          value={stats.totalDevolucoes}
          icon={<Activity className="h-4 w-4" />}
          sub={`${stats.totalItens} itens no total`}
        />
        <KpiCard
          label="Custo das perdas"
          value={fmtBRL(stats.valorPerda)}
          tone="destructive"
          icon={<TrendingDown className="h-4 w-4" />}
          sub="frete + taxas perdidas"
        />
        <KpiCard
          label="Disputas em aberto"
          value={stats.disputasAbertas}
          tone="warning"
          sub={fmtBRL(stats.valorEmDisputa) + " estimado em risco"}
        />
        <KpiCard
          label="Taxa de recuperação"
          value={`${stats.taxaRecuperacao.toFixed(1)}%`}
          tone="success"
          icon={<Percent className="h-4 w-4" />}
          sub={`${fmtBRL(stats.valorRecuperado)} recuperado em disputas`}
        />
      </div>

      <AiInsights payload={aiPayload} />

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Evolução mensal" subtitle="Resolvidas e Perdas em R$ · Disputas em quantidade (últimos 6 meses)" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={evolucaoMensal} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => fmtBRLCompact(v as number)}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                formatter={(v, name) => (name === "Disputas (qtd)" ? `${v}` : fmtBRL(v as number))}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="resolvidas" name="Resolvidas (R$)" fill="hsl(217 91% 55%)" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="left" dataKey="perdas" name="Perdas (R$)" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="right" dataKey="disputasQtd" name="Disputas (qtd)" fill="hsl(28 92% 55%)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Por empresa" subtitle="Volume de itens devolvidos">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={porEmpresa}
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {porEmpresa.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Principais motivos" subtitle="Top motivos de devolução (por itens)" className="lg:col-span-3">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={porMotivo} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis
                dataKey="name"
                type="category"
                width={170}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="value" fill="hsl(var(--info))" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ============== Análise de Produto ============== */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight">Produtos que mais voltam</h2>
            <p className="text-xs text-muted-foreground">
              Ranking dos modelos com mais devoluções no recorte atual. Clique em cada linha para
              ver <span className="font-medium">por que</span> está voltando — motivos, tamanhos, cores e defeitos.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip label="Competência" value={fCompetencia === ALL ? "Todas" : fCompetencia.split("-").reverse().join("/")} />
            {fEmpresa !== ALL && <FilterChip label="Empresa" value={lookup(empresas, fEmpresa)} />}
            {fPlataforma !== ALL && <FilterChip label="Plataforma" value={lookup(plataformas, fPlataforma)} />}
            {fStatus !== ALL && <FilterChip label="Status" value={statusLabel[fStatus as keyof typeof statusLabel] ?? fStatus} />}
            {fMotivo !== ALL && <FilterChip label="Motivo" value={lookup(motivos, fMotivo)} />}
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground ml-1">Top</span>
            <Select value={String(topN)} onValueChange={(v) => setTopN(Number(v))}>
              <SelectTrigger className="h-7 w-[64px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-3 shadow-xs">
          {produtosAnalise.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Sem devoluções no recorte atual.
            </p>
          ) : (
            <ol className="space-y-1">
              {produtosAnalise.map((p, i) => (
                <ProdutoAnaliseRow
                  key={p.modelo}
                  rank={i + 1}
                  produto={p}
                  maxQtd={produtosAnalise[0]?.qtdTotal ?? 1}
                />
              ))}
            </ol>
          )}
        </div>
      </section>

      <div className="rounded-lg border border-border bg-card shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-medium">Relatório integrado</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {filtradas.length} devoluções · página {pagina} de {totalPaginas}
            </p>
          </div>
          <Input
            placeholder="Buscar por ID, modelo, pedido…"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPagina(1);
            }}
            className="h-8 w-full max-w-xs text-sm"
          />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[70px]">Data</TableHead>
                <TableHead>Empresa · Plataforma</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>Itens</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[40px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageData.map((d) => {
                const principal = d.itens[0];
                const restante = d.itens.length - 1;
                return (
                  <TableRow key={d.id} className="group">
                    <TableCell className="text-xs text-muted-foreground tabular">{fmtDate(d.createdAt)}</TableCell>
                    <TableCell className="text-sm">
                      <div className="font-medium">{lookup(empresas, d.empresaId)}</div>
                      <div className="text-xs text-muted-foreground">{lookup(plataformas, d.plataformaId)}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{d.pedidoId || "—"}</TableCell>
                    <TableCell className="text-sm">
                      {principal ? lookup(modelos, principal.modeloId) : "—"}
                      {principal && (
                        <span className="text-muted-foreground"> · {lookup(pecas, principal.pecaId)}</span>
                      )}
                      {restante > 0 && (
                        <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          +{restante}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{lookup(motivos, d.motivoId)}</TableCell>
                    <TableCell className="text-right tabular text-sm">{quantidadeTotal(d)}</TableCell>
                    <TableCell className="text-right tabular text-sm font-medium">
                      {d.status === "dispute" ? "R$ 1,00" : d.status === "pending" ? "—" : fmtBRL(valorEfetivo(d, motivos))}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={d.status} />
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => setExcluir(d)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1 rounded-md hover:bg-destructive-soft/40"
                        aria-label="Excluir registro"
                        title="Excluir registro"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {pageData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                    Nenhum registro encontrado com esses filtros.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {totalPaginas > 1 && (
          <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2">
            <Button variant="ghost" size="sm" disabled={pagina === 1} onClick={() => setPagina((p) => p - 1)}>
              Anterior
            </Button>
            <span className="text-xs text-muted-foreground tabular">
              {pagina} / {totalPaginas}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={pagina === totalPaginas}
              onClick={() => setPagina((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        )}
      </div>

      <AlertDialog open={!!excluir} onOpenChange={(o) => !o && setExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registro de devolução?</AlertDialogTitle>
            <AlertDialogDescription>
              {excluir && (
                <>
                  Você vai remover permanentemente o pedido{" "}
                  <span className="font-mono font-medium">
                    {excluir.devolucaoId || excluir.pedidoId || "(sem ID)"}
                  </span>
                  {" "}({fmtBRL(valorTotal(excluir))} · {statusLabel[excluir.status]}).
                  {" "}Esta ação não pode ser desfeita.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!excluir) return;
                deleteDevolucao(excluir.id);
                toast({
                  title: "Registro excluído",
                  description: `${excluir.devolucaoId || excluir.pedidoId || "Pedido"} removido.`,
                });
                setExcluir(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-[160px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}

function FilterChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-muted px-2 py-0.5 text-[10px] font-medium">
      <span className="uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </span>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={"rounded-lg border border-border bg-card p-4 shadow-xs " + (className ?? "")}>
      <div className="mb-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

interface RankingRow {
  key: string;
  primary: string;
  secondary?: string;
  badge?: string;
  value: number;
}

function RankingCard({
  title,
  subtitle,
  icon,
  rows,
  empty,
  accent = "primary",
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  rows: RankingRow[];
  empty: string;
  accent?: "primary" | "warning" | "info" | "destructive";
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0);
  const barCls = {
    primary: "bg-primary/70",
    warning: "bg-warning/70",
    info: "bg-info/70",
    destructive: "bg-destructive/70",
  }[accent];
  const iconWrapCls = {
    primary: "bg-primary-soft text-primary",
    warning: "bg-warning-soft text-warning-soft-foreground",
    info: "bg-info-soft text-info-soft-foreground",
    destructive: "bg-destructive-soft text-destructive-soft-foreground",
  }[accent];
  const badgeCls = {
    primary: "bg-primary-soft text-primary border-primary/20",
    warning: "bg-warning-soft text-warning-soft-foreground border-warning/30",
    info: "bg-info-soft text-info-soft-foreground border-info/30",
    destructive: "bg-destructive-soft text-destructive-soft-foreground border-destructive/30",
  }[accent];
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
      <div className="mb-3 flex items-start gap-2.5">
        {icon && (
          <div className={"flex h-7 w-7 shrink-0 items-center justify-center rounded-md " + iconWrapCls}>
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium leading-tight">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r, i) => {
            const pct = max > 0 ? (r.value / max) * 100 : 0;
            return (
              <li key={r.key} className="group relative">
                <div className="relative flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-muted/50 transition-colors">
                  <div
                    className={"absolute inset-y-0 left-0 rounded-md opacity-25 " + barCls}
                    style={{ width: `${pct}%` }}
                    aria-hidden
                  />
                  <span className="relative w-5 shrink-0 text-[10px] font-mono text-muted-foreground tabular">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="relative min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{r.primary}</span>
                      {r.badge && (
                        <span
                          className={"shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium tabular " + badgeCls}
                        >
                          {r.badge}
                        </span>
                      )}
                    </div>
                    {r.secondary && (
                      <p className="truncate text-[11px] text-muted-foreground">{r.secondary}</p>
                    )}
                  </div>
                  <span className="relative text-sm font-semibold tabular shrink-0">
                    {r.value}
                    <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">un</span>
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// ====== Análise de produto: linha expansível ======
type Breakdown = { label: string; qtd: number };
type ProdutoAnalise = {
  modelo: string;
  qtdTotal: number;
  devolucoesCount: number;
  motivos: Breakdown[];
  tamanhos: Breakdown[];
  cores: Breakdown[];
  defeitos: Breakdown[];
  componentes: Breakdown[];
  notas: string[];
};


function ProdutoAnaliseRow({
  rank,
  produto,
  maxQtd,
}: {
  rank: number;
  produto: ProdutoAnalise;
  maxQtd: number;
}) {
  const [open, setOpen] = useState(false);
  const pct = maxQtd > 0 ? (produto.qtdTotal / maxQtd) * 100 : 0;

  // Insight automático: o que mais explica as devoluções deste produto?
  const insight = (() => {
    const top = produto.motivos[0];
    if (!top) return null;
    const share = top.qtd / produto.qtdTotal;
    const parts: string[] = [`${top.label} (${Math.round(share * 100)}%)`];
    // Concentração de tamanho ou cor revela problema específico
    const tamTop = produto.tamanhos[0];
    if (tamTop && tamTop.qtd / produto.qtdTotal >= 0.5 && produto.tamanhos.length > 1) {
      parts.push(`concentrado no tamanho ${tamTop.label}`);
    }
    const corTop = produto.cores[0];
    if (corTop && corTop.qtd / produto.qtdTotal >= 0.5 && produto.cores.length > 1) {
      parts.push(`concentrado na cor ${corTop.label}`);
    }
    const defTop = produto.defeitos[0];
    if (defTop) parts.push(`defeito recorrente: ${defTop.label}`);
    return parts.join(" · ");
  })();

  return (
    <li>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="group relative flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-surface-muted/50 transition-colors">
          <div
            className="absolute inset-y-0 left-0 rounded-md bg-primary/15"
            style={{ width: `${pct}%` }}
            aria-hidden
          />
          <span className="relative w-6 shrink-0 text-[10px] font-mono text-muted-foreground tabular">
            {String(rank).padStart(2, "0")}
          </span>
          <Package className="relative h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="relative min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{produto.modelo}</div>
            {insight && (
              <p className="truncate text-[11px] text-muted-foreground">{insight}</p>
            )}
          </div>
          <div className="relative flex items-baseline gap-1 shrink-0">
            <span className="text-sm font-semibold tabular">{produto.qtdTotal}</span>
            <span className="text-[10px] text-muted-foreground">un</span>
            <span className="ml-2 text-[10px] text-muted-foreground tabular">
              {produto.devolucoesCount} dev.
            </span>
          </div>
          <ChevronDown
            className={
              "relative h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform " +
              (open ? "rotate-180" : "")
            }
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="grid gap-3 px-2 py-3 sm:grid-cols-2 lg:grid-cols-5 border-t border-dashed border-border mt-1">
            <BreakdownList title="Motivos" rows={produto.motivos} />
            <BreakdownList
              title="Peça do conjunto"
              rows={produto.componentes}
              empty="Sem componente informado"
            />
            <BreakdownList title="Tamanhos" rows={produto.tamanhos} empty="Sem tamanho informado" />
            <BreakdownList title="Cores" rows={produto.cores} empty="Sem cor informada" />
            <BreakdownList
              title="Defeitos constatados"
              rows={produto.defeitos}
              empty="Nenhum defeito informado"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function BreakdownList({
  title,
  rows,
  empty = "—",
}: {
  title: string;
  rows: Breakdown[];
  empty?: string;
}) {
  const total = rows.reduce((s, r) => s + r.qtd, 0);
  return (
    <div>
      <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      {rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">{empty}</p>
      ) : (
        <ul className="space-y-0.5">
          {rows.slice(0, 5).map((r) => {
            const pct = total > 0 ? Math.round((r.qtd / total) * 100) : 0;
            return (
              <li key={r.label} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">{r.label}</span>
                <span className="shrink-0 tabular text-muted-foreground">
                  {r.qtd} <span className="text-[10px]">({pct}%)</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
