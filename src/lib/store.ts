import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ContaPlataforma,
  Cor,
  Devolucao,
  DevolucaoItem,
  Empresa,
  Modelo,
  ModeloVariantes,
  Motivo,
  Peca,
  PedidoACaminho,
  Plataforma,
  ReturnStatus,
  Tamanho,
  TipoDefeito,
} from "./types";
import {
  seedContas,
  seedCores,
  seedDevolucoes,
  seedEmpresas,
  seedModelos,
  seedModeloVariantes,
  seedMotivos,
  seedPecas,
  seedPlataformas,
  seedTamanhos,
  seedTiposDefeito,
} from "./seed";
import { valorTotal } from "./format";

const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

interface State {
  empresas: Empresa[];
  plataformas: Plataforma[];
  contas: ContaPlataforma[];
  modelos: Modelo[];
  modeloVariantes: ModeloVariantes[];
  pecas: Peca[];
  cores: Cor[];
  tamanhos: Tamanho[];
  motivos: Motivo[];
  tiposDefeito: TipoDefeito[];
  devolucoes: Devolucao[];
  pedidosACaminho: PedidoACaminho[];
  theme: "light" | "dark";
}

interface Actions {
  // Devoluções
  addDevolucao: (d: Omit<Devolucao, "id" | "createdAt">) => Devolucao;
  updateDevolucao: (id: string, patch: Partial<Devolucao>) => void;
  deleteDevolucao: (id: string) => void;
  setStatus: (id: string, status: ReturnStatus, valorRecuperado?: number, tipoDefeitoId?: string) => void;

  // Pedidos a caminho
  addPedidoACaminho: (p: Omit<PedidoACaminho, "id" | "createdAt">) => PedidoACaminho;
  updatePedidoACaminho: (id: string, patch: Partial<PedidoACaminho>) => void;
  deletePedidoACaminho: (id: string) => void;

  // CRUD genérico
  addEmpresa: (nome: string, cnpj?: string) => Empresa;
  updateEmpresa: (id: string, patch: Partial<Empresa>) => void;
  deleteEmpresa: (id: string) => void;

  addPlataforma: (nome: string) => Plataforma;
  updatePlataforma: (id: string, patch: Partial<Plataforma>) => void;
  deletePlataforma: (id: string) => void;

  toggleConta: (empresaId: string, plataformaId: string) => void;

  addModelo: (nome: string) => Modelo;
  deleteModelo: (id: string) => void;
  /** Vincula/desvincula uma cor (por nome) a um modelo. */
  toggleModeloCor: (modeloId: string, cor: string) => void;
  /** Vincula/desvincula um tamanho (por nome) a um modelo. */
  toggleModeloTamanho: (modeloId: string, tamanho: string) => void;
  /** Cria a cor no catálogo (se ainda não existir) E vincula ao modelo. */
  addCorEVincular: (modeloId: string, nome: string) => void;
  /** Cria o tamanho no catálogo (se ainda não existir) E vincula ao modelo. */
  addTamanhoEVincular: (modeloId: string, nome: string) => void;
  addPeca: (nome: string) => Peca;
  deletePeca: (id: string) => void;
  addCor: (nome: string) => Cor;
  deleteCor: (id: string) => void;
  addTamanho: (nome: string) => Tamanho;
  deleteTamanho: (id: string) => void;
  addMotivo: (nome: string, geraPerda?: boolean) => Motivo;
  updateMotivo: (id: string, patch: Partial<Motivo>) => void;
  deleteMotivo: (id: string) => void;
  addTipoDefeito: (nome: string) => TipoDefeito;
  deleteTipoDefeito: (id: string) => void;

  setTheme: (t: "light" | "dark") => void;
  resetSeed: () => void;
}

/** Migra um registro v1 (campos no nível raiz) para v2 (com array `itens`). */
type LegacyDevolucao = Devolucao & {
  modeloId?: string;
  pecaId?: string;
  cor?: string;
  tamanho?: string;
  quantidade?: number;
  valor?: number;
};
function migrateDevolucao(raw: LegacyDevolucao): Devolucao {
  if (Array.isArray(raw.itens) && raw.itens.length > 0) return raw as Devolucao;
  // Registro legado: converte para 1 item
  const item: DevolucaoItem = {
    id: uid("itm"),
    modeloId: raw.modeloId ?? "",
    pecaId: raw.pecaId ?? "",
    cor: raw.cor ?? "",
    tamanho: raw.tamanho ?? "",
    quantidade: raw.quantidade ?? 1,
    valor: raw.valor ?? 0,
  };
  return {
    id: raw.id,
    createdAt: raw.createdAt,
    competencia: raw.competencia,
    empresaId: raw.empresaId,
    plataformaId: raw.plataformaId,
    pedidoId: raw.pedidoId,
    devolucaoId: raw.devolucaoId,
    motivoId: raw.motivoId,
    status: raw.status,
    valorRecuperado: raw.valorRecuperado,
    notas: raw.notas,
    itens: [item],
  };
}

export const useStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      empresas: seedEmpresas,
      plataformas: seedPlataformas,
      contas: seedContas,
      modelos: seedModelos,
      modeloVariantes: seedModeloVariantes,
      pecas: seedPecas,
      cores: seedCores,
      tamanhos: seedTamanhos,
      motivos: seedMotivos,
      tiposDefeito: seedTiposDefeito,
      devolucoes: seedDevolucoes,
      pedidosACaminho: [],
      theme: "light",

      addDevolucao: (d) => {
        const novo: Devolucao = {
          ...d,
          id: uid("dev"),
          createdAt: new Date().toISOString(),
          itens: d.itens.map((it) => ({ ...it, id: it.id || uid("itm") })),
        };
        set((s) => ({ devolucoes: [novo, ...s.devolucoes] }));
        return novo;
      },
      updateDevolucao: (id, patch) =>
        set((s) => ({
          devolucoes: s.devolucoes.map((d) => (d.id === id ? { ...d, ...patch } : d)),
        })),
      deleteDevolucao: (id) =>
        set((s) => ({ devolucoes: s.devolucoes.filter((d) => d.id !== id) })),
      setStatus: (id, status, valorRecuperado, tipoDefeitoId) =>
        set((s) => ({
          devolucoes: s.devolucoes.map((d) => {
            if (d.id !== id) return d;
            const total = valorTotal(d);
            return {
              ...d,
              status,
              valorRecuperado:
                status === "resolved"
                  ? valorRecuperado ?? total
                  : status === "loss"
                  ? valorRecuperado ?? 0
                  : d.valorRecuperado,
              // Atualiza tipo de defeito apenas se foi passado; finalizando para
              // dispute (reabrir) preserva o que já existia.
              tipoDefeitoId:
                tipoDefeitoId !== undefined ? tipoDefeitoId || undefined : d.tipoDefeitoId,
            };
          }),
        })),

      addPedidoACaminho: (p) => {
        const novo: PedidoACaminho = {
          ...p,
          id: uid("pac"),
          createdAt: new Date().toISOString(),
          itens: p.itens.map((it) => ({ ...it, id: it.id || uid("itm") })),
        };
        set((s) => ({ pedidosACaminho: [novo, ...s.pedidosACaminho] }));
        return novo;
      },
      updatePedidoACaminho: (id, patch) =>
        set((s) => ({
          pedidosACaminho: s.pedidosACaminho.map((p) =>
            p.id === id ? { ...p, ...patch } : p,
          ),
        })),
      deletePedidoACaminho: (id) =>
        set((s) => ({
          pedidosACaminho: s.pedidosACaminho.filter((p) => p.id !== id),
        })),

      addEmpresa: (nome, cnpj) => {
        const novo: Empresa = { id: uid("emp"), nome, cnpj };
        set((s) => ({ empresas: [...s.empresas, novo] }));
        return novo;
      },
      updateEmpresa: (id, patch) =>
        set((s) => ({
          empresas: s.empresas.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),
      deleteEmpresa: (id) =>
        set((s) => ({
          empresas: s.empresas.filter((e) => e.id !== id),
          contas: s.contas.filter((c) => c.empresaId !== id),
        })),

      addPlataforma: (nome) => {
        const novo: Plataforma = { id: uid("plt"), nome };
        set((s) => ({ plataformas: [...s.plataformas, novo] }));
        return novo;
      },
      updatePlataforma: (id, patch) =>
        set((s) => ({
          plataformas: s.plataformas.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),
      deletePlataforma: (id) =>
        set((s) => ({
          plataformas: s.plataformas.filter((p) => p.id !== id),
          contas: s.contas.filter((c) => c.plataformaId !== id),
        })),

      toggleConta: (empresaId, plataformaId) => {
        const existente = get().contas.find(
          (c) => c.empresaId === empresaId && c.plataformaId === plataformaId,
        );
        if (existente) {
          set((s) => ({ contas: s.contas.filter((c) => c.id !== existente.id) }));
        } else {
          set((s) => ({
            contas: [...s.contas, { id: uid("cnt"), empresaId, plataformaId }],
          }));
        }
      },

      addModelo: (nome) => {
        const n = { id: uid("mod"), nome };
        set((s) => ({ modelos: [...s.modelos, n] }));
        return n;
      },
      deleteModelo: (id) =>
        set((s) => ({
          modelos: s.modelos.filter((x) => x.id !== id),
          // Limpa variantes vinculadas ao modelo removido para evitar lixo.
          modeloVariantes: s.modeloVariantes.filter((mv) => mv.modeloId !== id),
        })),
      toggleModeloCor: (modeloId, cor) =>
        set((s) => {
          const existente = s.modeloVariantes.find((mv) => mv.modeloId === modeloId);
          if (!existente) {
            return {
              modeloVariantes: [
                ...s.modeloVariantes,
                { id: uid("mv"), modeloId, cores: [cor], tamanhos: [] },
              ],
            };
          }
          const has = existente.cores.includes(cor);
          return {
            modeloVariantes: s.modeloVariantes.map((mv) =>
              mv.id === existente.id
                ? {
                    ...mv,
                    cores: has
                      ? mv.cores.filter((c) => c !== cor)
                      : [...mv.cores, cor],
                  }
                : mv,
            ),
          };
        }),
      toggleModeloTamanho: (modeloId, tamanho) =>
        set((s) => {
          const existente = s.modeloVariantes.find((mv) => mv.modeloId === modeloId);
          if (!existente) {
            return {
              modeloVariantes: [
                ...s.modeloVariantes,
                { id: uid("mv"), modeloId, cores: [], tamanhos: [tamanho] },
              ],
            };
          }
          const has = existente.tamanhos.includes(tamanho);
          return {
            modeloVariantes: s.modeloVariantes.map((mv) =>
              mv.id === existente.id
                ? {
                    ...mv,
                    tamanhos: has
                      ? mv.tamanhos.filter((t) => t !== tamanho)
                      : [...mv.tamanhos, tamanho],
                  }
                : mv,
            ),
          };
        }),
      addCorEVincular: (modeloId, nome) => {
        const trimmed = nome.trim();
        if (!trimmed) return;
        const s = get();
        // Cria a cor no catálogo se ainda não existir (case-insensitive).
        const existente = s.cores.find(
          (c) => c.nome.toLowerCase() === trimmed.toLowerCase(),
        );
        const corNome = existente?.nome ?? trimmed;
        if (!existente) {
          set((st) => ({ cores: [...st.cores, { id: uid("cor"), nome: trimmed }] }));
        }
        // Vincula ao modelo (sem duplicar).
        const mv = get().modeloVariantes.find((m) => m.modeloId === modeloId);
        if (!mv || !mv.cores.includes(corNome)) {
          get().toggleModeloCor(modeloId, corNome);
        }
      },
      addTamanhoEVincular: (modeloId, nome) => {
        const trimmed = nome.trim();
        if (!trimmed) return;
        const s = get();
        const existente = s.tamanhos.find(
          (t) => t.nome.toLowerCase() === trimmed.toLowerCase(),
        );
        const tamNome = existente?.nome ?? trimmed;
        if (!existente) {
          set((st) => ({ tamanhos: [...st.tamanhos, { id: uid("tam"), nome: trimmed }] }));
        }
        const mv = get().modeloVariantes.find((m) => m.modeloId === modeloId);
        if (!mv || !mv.tamanhos.includes(tamNome)) {
          get().toggleModeloTamanho(modeloId, tamNome);
        }
      },
      addPeca: (nome) => {
        const n = { id: uid("pec"), nome };
        set((s) => ({ pecas: [...s.pecas, n] }));
        return n;
      },
      deletePeca: (id) => set((s) => ({ pecas: s.pecas.filter((x) => x.id !== id) })),
      addCor: (nome) => {
        const n = { id: uid("cor"), nome };
        set((s) => ({ cores: [...s.cores, n] }));
        return n;
      },
      deleteCor: (id) => set((s) => ({ cores: s.cores.filter((x) => x.id !== id) })),
      addTamanho: (nome) => {
        const n = { id: uid("tam"), nome };
        set((s) => ({ tamanhos: [...s.tamanhos, n] }));
        return n;
      },
      deleteTamanho: (id) => set((s) => ({ tamanhos: s.tamanhos.filter((x) => x.id !== id) })),
      addMotivo: (nome, geraPerda) => {
        const n: Motivo = { id: uid("mot"), nome, geraPerda: geraPerda ?? true };
        set((s) => ({ motivos: [...s.motivos, n] }));
        return n;
      },
      updateMotivo: (id, patch) =>
        set((s) => ({
          motivos: s.motivos.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        })),
      deleteMotivo: (id) => set((s) => ({ motivos: s.motivos.filter((x) => x.id !== id) })),
      addTipoDefeito: (nome) => {
        const n: TipoDefeito = { id: uid("def"), nome };
        set((s) => ({ tiposDefeito: [...s.tiposDefeito, n] }));
        return n;
      },
      deleteTipoDefeito: (id) =>
        set((s) => ({ tiposDefeito: s.tiposDefeito.filter((x) => x.id !== id) })),

      setTheme: (t) => set({ theme: t }),
      resetSeed: () =>
        set({
          empresas: seedEmpresas,
          plataformas: seedPlataformas,
          contas: seedContas,
          modelos: seedModelos,
          modeloVariantes: seedModeloVariantes,
          pecas: seedPecas,
          cores: seedCores,
          tamanhos: seedTamanhos,
          motivos: seedMotivos,
          tiposDefeito: seedTiposDefeito,
          devolucoes: seedDevolucoes,
        }),
    }),
    {
      name: "vexo-devolucoes-v1",
      version: 6,
      migrate: (persistedState, version) => {
        const s = persistedState as Partial<State> | undefined;
        if (!s) return s as unknown as State & Actions;
        let next = s;
        if (version < 2 && Array.isArray(next.devolucoes)) {
          next = {
            ...next,
            devolucoes: (next.devolucoes as LegacyDevolucao[]).map(migrateDevolucao),
          };
        }
        if (version < 3 && Array.isArray(next.motivos)) {
          // Defaults conhecidos por nome (case-insensitive). Tudo que não casar
          // assume true (gera perda) — comportamento legado seguro.
          const defaults: Record<string, boolean> = {
            "produto com defeito": true,
            "produto errado enviado": true,
            "problema na entrega": true,
            "não corresponde ao anúncio": false,
            "nao corresponde ao anuncio": false,
            "arrependimento de compra": false,
            "outro": false,
          };
          next = {
            ...next,
            motivos: (next.motivos as Motivo[]).map((m) => {
              if (typeof m.geraPerda === "boolean") return m;
              const guess = defaults[m.nome.trim().toLowerCase()];
              return { ...m, geraPerda: guess ?? true };
            }),
          };
        }
        if (version < 4 && !Array.isArray(next.tiposDefeito)) {
          // Catálogo de tipos de defeito é novo — semeia com defaults.
          next = { ...next, tiposDefeito: seedTiposDefeito };
        }
        if (version < 5 && !Array.isArray(next.modeloVariantes)) {
          // Vínculos modelo→cores/tamanhos são novos. Inicia vazio: o app cai
          // no fallback "mostrar tudo" para todos os modelos antigos.
          next = { ...next, modeloVariantes: [] };
        }
        return next as unknown as State & Actions;
      },
    },
  ),
);

// ============== Selectors / Helpers ==============

export const selectPlataformasDeEmpresa = (empresaId: string | undefined) => {
  if (!empresaId) return [];
  const { contas, plataformas } = useStore.getState();
  const ids = contas.filter((c) => c.empresaId === empresaId).map((c) => c.plataformaId);
  return plataformas.filter((p) => ids.includes(p.id));
};

/** Resultado: as variantes (cores/tamanhos) disponíveis para um modelo.
 *  Se o modelo NÃO tiver vínculo cadastrado, devolve todas as cores/tamanhos
 *  do catálogo (fallback "mostrar tudo"). Se tiver, devolve apenas as
 *  vinculadas — acelerando o cadastro. */
export interface VariantesResolvidas {
  cores: { nome: string }[];
  tamanhos: { nome: string }[];
  /** true quando o modelo tem vínculo explícito (mesmo que parcial em uma das listas). */
  hasVinculo: boolean;
}

export const selectVariantesDoModelo = (
  modeloId: string | undefined,
  todasCores: { nome: string }[],
  todosTamanhos: { nome: string }[],
  modeloVariantes: ModeloVariantes[],
): VariantesResolvidas => {
  if (!modeloId) {
    return { cores: todasCores, tamanhos: todosTamanhos, hasVinculo: false };
  }
  const mv = modeloVariantes.find((m) => m.modeloId === modeloId);
  if (!mv) {
    return { cores: todasCores, tamanhos: todosTamanhos, hasVinculo: false };
  }
  // Quando uma das listas está vazia, faz fallback APENAS daquela lista.
  // Ex.: modelo só tem cores cadastradas → mostra só as cores vinculadas
  // mas todos os tamanhos do catálogo.
  return {
    cores: mv.cores.length > 0 ? mv.cores.map((nome) => ({ nome })) : todasCores,
    tamanhos:
      mv.tamanhos.length > 0 ? mv.tamanhos.map((nome) => ({ nome })) : todosTamanhos,
    hasVinculo: true,
  };
};

export const lookup = <T extends { id: string; nome: string }>(arr: T[], id: string) =>
  arr.find((x) => x.id === id)?.nome ?? "—";
