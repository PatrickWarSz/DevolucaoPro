import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import SubscriptionPanel from "@/components/settings/SubscriptionPanel";
import { usePlatformFees, setPlatformFees, getDefaultFeesByName, hasCustomFees, clearPlatformFees, useFreightSamples, FREIGHT_SAMPLE_THRESHOLD, resetFreightSamples } from "@/lib/platformConfig";

export default function Configuracoes() {
  const { toast } = useToast();
  void toast;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Gerencie as opções que aparecem nos formulários de registro."
      />


      <Tabs defaultValue="empresas" className="space-y-4">
        <TabsList className="bg-surface-muted">
          <TabsTrigger value="empresas">Empresas</TabsTrigger>
          <TabsTrigger value="plataformas">Plataformas</TabsTrigger>
          <TabsTrigger value="vinculos">Vínculos</TabsTrigger>
          <TabsTrigger value="catalogo">Catálogo</TabsTrigger>
          <TabsTrigger value="assinatura">Assinatura</TabsTrigger>
        </TabsList>

        <TabsContent value="empresas">
          <EmpresasPanel />
        </TabsContent>
        <TabsContent value="plataformas">
          <PlataformasPanel />
        </TabsContent>
        <TabsContent value="vinculos">
          <div className="space-y-4">
            <VinculosPanel />
            <VariantesPanel />
          </div>
        </TabsContent>
        <TabsContent value="catalogo">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <CatalogoPanel
              title="Modelos"
              hint="Após cadastrar, vá em 'Vínculos' para definir as cores e tamanhos de cada modelo — acelera muito o registro de devoluções."
              items={useStore.getState().modelos}
              add={(n) => useStore.getState().addModelo(n)}
              del={(id) => useStore.getState().deleteModelo(id)}
              storeKey="modelos"
            />
            <CatalogoPanel
              title="Componentes do produto"
              hint="Partes que podem voltar com problema (ex.: legging do conjunto, top, carregador, peça única)."
              items={useStore.getState().pecas}
              add={(n) => useStore.getState().addPeca(n)}
              del={(id) => useStore.getState().deletePeca(id)}
              storeKey="pecas"
            />
            <CatalogoPanel
              title="Cores"
              items={useStore.getState().cores}
              add={(n) => useStore.getState().addCor(n)}
              del={(id) => useStore.getState().deleteCor(id)}
              storeKey="cores"
            />
            <CatalogoPanel
              title="Tamanhos"
              items={useStore.getState().tamanhos}
              add={(n) => useStore.getState().addTamanho(n)}
              del={(id) => useStore.getState().deleteTamanho(id)}
              storeKey="tamanhos"
            />
            <CatalogoPanel
              title="Tipos de defeito"
              hint="Constatado ao finalizar a devolução (rasgo, mancha, tela quebrada, item amassado…). Aparece só quando você marca 'Ganhei' ou 'Perdi'."
              items={useStore.getState().tiposDefeito}
              add={(n) => useStore.getState().addTipoDefeito(n)}
              del={(id) => useStore.getState().deleteTipoDefeito(id)}
              storeKey="tiposDefeito"
            />
            <MotivosPanel />
          </div>
        </TabsContent>
        <TabsContent value="assinatura">
          <SubscriptionPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function VariantesPanel() {
  const modelos = useStore((s) => s.modelos);
  const cores = useStore((s) => s.cores);
  const tamanhos = useStore((s) => s.tamanhos);
  const modeloVariantes = useStore((s) => s.modeloVariantes);
  const toggleModeloCor = useStore((s) => s.toggleModeloCor);
  const toggleModeloTamanho = useStore((s) => s.toggleModeloTamanho);

  const get = (modeloId: string) =>
    modeloVariantes.find((mv) => mv.modeloId === modeloId);

  return (
    <div className="rounded-lg border border-border bg-card shadow-xs">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium">Variantes por modelo (cores e tamanhos)</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Marque as cores e tamanhos que cada modelo realmente tem. No registro
          de devolução, só essas opções aparecem — acelera o cadastro.
          Modelos sem nada marcado mostram <span className="font-medium">tudo</span> (fallback).
        </p>
      </div>
      <div className="divide-y divide-border">
        {modelos.map((m) => {
          const mv = get(m.id);
          const corMarcadas = mv?.cores.length ?? 0;
          const tamMarcados = mv?.tamanhos.length ?? 0;
          const semVinculo = corMarcadas === 0 && tamMarcados === 0;
          return (
            <div key={m.id} className="px-4 py-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{m.nome}</p>
                <span
                  className={cn(
                    "text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded border",
                    semVinculo
                      ? "bg-muted text-muted-foreground border-border"
                      : "bg-primary-soft text-primary border-primary/30",
                  )}
                >
                  {semVinculo
                    ? "Mostra tudo"
                    : `${corMarcadas} cor${corMarcadas === 1 ? "" : "es"} · ${tamMarcados} tam.`}
                </span>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                  Cores
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {cores.length === 0 && (
                    <span className="text-[11px] text-muted-foreground italic">
                      Cadastre cores primeiro em Catálogo.
                    </span>
                  )}
                  {cores.map((c) => {
                    const active = !!mv?.cores.includes(c.nome);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleModeloCor(m.id, c.nome)}
                        className={cn(
                          "text-xs px-2 py-1 rounded border transition-colors",
                          active
                            ? "bg-primary border-primary text-primary-foreground"
                            : "bg-surface-muted border-border text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {c.nome}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                  Tamanhos
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {tamanhos.length === 0 && (
                    <span className="text-[11px] text-muted-foreground italic">
                      Cadastre tamanhos primeiro em Catálogo.
                    </span>
                  )}
                  {tamanhos.map((t) => {
                    const active = !!mv?.tamanhos.includes(t.nome);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleModeloTamanho(m.id, t.nome)}
                        className={cn(
                          "text-xs px-2 py-1 rounded border transition-colors min-w-[36px]",
                          active
                            ? "bg-primary border-primary text-primary-foreground"
                            : "bg-surface-muted border-border text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {t.nome}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
        {modelos.length === 0 && (
          <p className="px-4 py-6 text-xs text-center text-muted-foreground">
            Cadastre modelos no Catálogo para vincular cores e tamanhos.
          </p>
        )}
      </div>
    </div>
  );
}

function MotivosPanel() {
  const motivos = useStore((s) => s.motivos);
  const addMotivo = useStore((s) => s.addMotivo);
  const updateMotivo = useStore((s) => s.updateMotivo);
  const deleteMotivo = useStore((s) => s.deleteMotivo);
  const [nome, setNome] = useState("");
  const [geraPerda, setGeraPerda] = useState(true);

  return (
    <div className="rounded-lg border border-border bg-card shadow-xs md:col-span-2 xl:col-span-3">
      <div className="border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-medium">Motivos de devolução</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Marque <span className="font-medium text-foreground">"Gera perda"</span> para motivos que são erro do vendedor
          (defeito, envio errado). Motivos sem perda não entram em valor recuperado nem em valor de perda no dashboard.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2 border-b border-border bg-surface-muted/40 p-3">
        <div className="flex-1 min-w-[180px]">
          <label className="text-[11px] font-medium text-muted-foreground">Nome</label>
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && nome.trim()) {
                addMotivo(nome.trim(), geraPerda);
                setNome("");
              }
            }}
            placeholder="Ex: Embalagem danificada"
            className="h-8"
          />
        </div>
        <label className="flex items-center gap-2 h-8 px-2 rounded border border-border bg-card text-xs cursor-pointer select-none">
          <input
            type="checkbox"
            checked={geraPerda}
            onChange={(e) => setGeraPerda(e.target.checked)}
            className="h-3.5 w-3.5 accent-primary"
          />
          Gera perda operacional
        </label>
        <Button
          size="sm"
          disabled={!nome.trim()}
          onClick={() => {
            addMotivo(nome.trim(), geraPerda);
            setNome("");
          }}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Adicionar
        </Button>
      </div>
      <ul className="divide-y divide-border">
        {motivos.map((m) => {
          const ativo = m.geraPerda !== false;
          return (
            <li key={m.id} className="flex items-center justify-between px-4 py-2 group gap-3">
              <span className="text-sm flex-1 min-w-0 truncate">{m.nome}</span>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none shrink-0">
                <input
                  type="checkbox"
                  checked={ativo}
                  onChange={(e) => updateMotivo(m.id, { geraPerda: e.target.checked })}
                  className="h-3.5 w-3.5 accent-primary"
                />
                <span className={cn(
                  "rounded px-1.5 py-0.5 border text-[10px] font-medium uppercase tracking-wider",
                  ativo
                    ? "bg-destructive-soft text-destructive-soft-foreground border-destructive/30"
                    : "bg-muted text-muted-foreground border-border",
                )}>
                  {ativo ? "Gera perda" : "Sem perda"}
                </span>
              </label>
              <button
                onClick={() => deleteMotivo(m.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                aria-label="Excluir"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
        {motivos.length === 0 && (
          <li className="px-4 py-3 text-xs text-muted-foreground text-center">
            Nenhum motivo cadastrado.
          </li>
        )}
      </ul>
    </div>
  );
}


function EmpresasPanel() {
  const empresas = useStore((s) => s.empresas);
  const addEmpresa = useStore((s) => s.addEmpresa);
  const deleteEmpresa = useStore((s) => s.deleteEmpresa);
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");

  return (
    <div className="rounded-lg border border-border bg-card shadow-xs">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium">Empresas (CNPJs)</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Cada empresa pode ter contas em várias plataformas.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2 border-b border-border bg-surface-muted/40 p-3">
        <div className="flex-1 min-w-[180px]">
          <label className="text-[11px] font-medium text-muted-foreground">Nome</label>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Costa Ltda" className="h-8" />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="text-[11px] font-medium text-muted-foreground">CNPJ</label>
          <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" className="h-8 font-mono" />
        </div>
        <Button
          size="sm"
          disabled={!nome.trim()}
          onClick={() => {
            addEmpresa(nome.trim(), cnpj.trim() || undefined);
            setNome("");
            setCnpj("");
          }}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Adicionar
        </Button>
      </div>
      <ul className="divide-y divide-border">
        {empresas.map((e) => (
          <li key={e.id} className="flex items-center justify-between px-4 py-2.5">
            <div>
              <p className="text-sm font-medium">{e.nome}</p>
              {e.cnpj && <p className="text-xs text-muted-foreground font-mono">{e.cnpj}</p>}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => {
                if (confirm(`Excluir "${e.nome}"? Os vínculos também serão removidos.`))
                  deleteEmpresa(e.id);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlataformasPanel() {
  const plataformas = useStore((s) => s.plataformas);
  const addPlataforma = useStore((s) => s.addPlataforma);
  const deletePlataforma = useStore((s) => s.deletePlataforma);
  const [nome, setNome] = useState("");
  const fees = usePlatformFees();
  const samples = useFreightSamples();

  return (
    <div className="rounded-lg border border-border bg-card shadow-xs">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium">Plataformas</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Marketplaces disponíveis. <span className="font-medium text-foreground">Preencher as taxas é opcional.</span>{" "}
          Shopee, Mercado Livre, Shein e TikTok já vêm com valores padrão; pra Shopee o frete real é aprendido automaticamente conforme você registra perdas.
        </p>
      </div>
      <div className="flex items-end gap-2 border-b border-border bg-surface-muted/40 p-3">
        <div className="flex-1">
          <label className="text-[11px] font-medium text-muted-foreground">Nome</label>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Magalu" className="h-8" />
        </div>
        <Button
          size="sm"
          disabled={!nome.trim()}
          onClick={() => {
            addPlataforma(nome.trim());
            setNome("");
          }}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Adicionar
        </Button>
      </div>
      <ul className="divide-y divide-border">
        {plataformas.map((p) => {
          const custom = fees[p.id];
          const isCustom = hasCustomFees(p.id);
          const defaults = getDefaultFeesByName(p.nome);
          const cur = custom ?? defaults ?? { taxaFixa: 0, freteMedio: 0 };
          const samplesArr = samples[p.id] ?? [];
          const aprendendo = samplesArr.length > 0 && samplesArr.length < FREIGHT_SAMPLE_THRESHOLD;
          const aprendido = samplesArr.length >= FREIGHT_SAMPLE_THRESHOLD;
          return (
            <li key={p.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{p.nome}</p>
                  {!isCustom && defaults && (
                    <span className="rounded bg-muted text-muted-foreground text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 border border-border">
                      padrão
                    </span>
                  )}
                  {isCustom && (
                    <span className="rounded bg-primary-soft text-primary text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 border border-primary/30">
                      personalizado
                    </span>
                  )}
                  {aprendendo && (
                    <span className="rounded bg-warning-soft text-warning-soft-foreground text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 border border-warning/30">
                      aprendendo {samplesArr.length}/{FREIGHT_SAMPLE_THRESHOLD}
                    </span>
                  )}
                  {aprendido && (
                    <span className="rounded bg-success-soft text-success-soft-foreground text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 border border-success/30">
                      auto-aprendido
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    if (confirm(`Excluir "${p.nome}"? Os vínculos serão removidos.`))
                      deletePlataforma(p.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Taxa fixa (R$) — opcional
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={custom?.taxaFixa ?? ""}
                    onChange={(e) =>
                      setPlatformFees(p.id, { ...cur, taxaFixa: Number(e.target.value) || 0 })
                    }
                    placeholder={defaults ? `padrão: ${defaults.taxaFixa.toFixed(2)}` : "0,00"}
                    className="h-8 tabular text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Frete médio ida+reverso (R$) — opcional
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={custom?.freteMedio ?? ""}
                    onChange={(e) =>
                      setPlatformFees(p.id, { ...cur, freteMedio: Number(e.target.value) || 0 })
                    }
                    placeholder={defaults ? `padrão: ${defaults.freteMedio.toFixed(2)}` : "0,00"}
                    className="h-8 tabular text-sm"
                  />
                </div>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[11px] text-muted-foreground">
                  Estimativa por devolução:{" "}
                  <span className="font-medium text-foreground">
                    R$ {((cur.taxaFixa || 0) + (cur.freteMedio || 0)).toFixed(2)}
                  </span>
                  {aprendendo && (
                    <span className="ml-2 italic">
                      coletando amostras de frete reais nas perdas…
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  {samplesArr.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("Zerar as amostras de frete coletadas para esta plataforma?"))
                          resetFreightSamples(p.id);
                      }}
                      className="text-[11px] text-muted-foreground hover:text-foreground underline"
                    >
                      zerar amostras
                    </button>
                  )}
                  {isCustom && (
                    <button
                      type="button"
                      onClick={() => clearPlatformFees(p.id)}
                      className="text-[11px] text-muted-foreground hover:text-foreground underline"
                    >
                      voltar pro padrão
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}


function VinculosPanel() {
  const empresas = useStore((s) => s.empresas);
  const plataformas = useStore((s) => s.plataformas);
  const contas = useStore((s) => s.contas);
  const toggleConta = useStore((s) => s.toggleConta);

  const has = (eId: string, pId: string) =>
    contas.some((c) => c.empresaId === eId && c.plataformaId === pId);

  return (
    <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium">Vínculos Empresa × Plataforma</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Marque em quais plataformas cada empresa opera. Isso filtra o select no formulário de registro.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-muted/50">
              <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                Empresa
              </th>
              {plataformas.map((p) => (
                <th
                  key={p.id}
                  className="text-center px-3 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground border-b border-border whitespace-nowrap"
                >
                  {p.nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {empresas.map((e) => (
              <tr key={e.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium">{e.nome}</td>
                {plataformas.map((p) => {
                  const active = has(e.id, p.id);
                  return (
                    <td key={p.id} className="text-center px-3 py-2">
                      <button
                        onClick={() => toggleConta(e.id, p.id)}
                        className={cn(
                          "inline-flex h-6 w-6 items-center justify-center rounded border transition-colors",
                          active
                            ? "bg-primary border-primary text-primary-foreground"
                            : "bg-surface border-border text-transparent hover:bg-muted",
                        )}
                        aria-label={active ? "Remover vínculo" : "Adicionar vínculo"}
                      >
                        ✓
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CatalogoPanel({
  title,
  hint,
  storeKey,
  items: initialItems,
  add,
  del,
}: {
  title: string;
  hint?: string;
  storeKey: keyof ReturnType<typeof useStore.getState>;
  items: { id: string; nome: string }[];
  add: (n: string) => void;
  del: (id: string) => void;
}) {
  // re-subscreve para reagir a mudanças
  const items = useStore((s) => s[storeKey] as { id: string; nome: string }[]);
  const [nome, setNome] = useState("");
  void initialItems;

  return (
    <div className="rounded-lg border border-border bg-card shadow-xs">
      <div className="border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-medium">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="flex items-center gap-2 border-b border-border bg-surface-muted/40 p-2">
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && nome.trim()) {
              add(nome.trim());
              setNome("");
            }
          }}
          placeholder="Adicionar…"
          className="h-8 text-sm"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!nome.trim()}
          onClick={() => {
            add(nome.trim());
            setNome("");
          }}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <ul className="max-h-72 overflow-y-auto divide-y divide-border">
        {items.map((it) => (
          <li key={it.id} className="flex items-center justify-between px-4 py-2 group">
            <span className="text-sm">{it.nome}</span>
            <button
              onClick={() => del(it.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
              aria-label="Excluir"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
        {items.length === 0 && (
          <li className="px-4 py-3 text-xs text-muted-foreground text-center">
            Nenhum item.
          </li>
        )}
      </ul>
    </div>
  );
}
