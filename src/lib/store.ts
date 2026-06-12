/**
 * store.ts — VEXO DevolucaoPro
 *
 * Arquitetura: Zustand como cache de UI + Supabase como fonte da verdade.
 *
 * Padrão de mutação (todos os adds/deletes/updates):
 *  1. Gera UUID local (crypto.randomUUID) — válido direto no Supabase
 *  2. Atualiza Zustand imediatamente (UI reativa, zero lag)
 *  3. Persiste no Supabase em background (fire-and-forget com _syncGuard)
 *  4. Em caso de erro: toast + reinicializa do banco (corrige inconsistência)
 *
 * Fluxo de boot:
 *  AppLayout → useEffect → store.initialize() → hydrate from Supabase
 */

import { create } from "zustand";
import { toast } from "sonner";
import { getWorkspaceId } from "./supabase";
import * as db from "./db";
import {
  fetchCatalogo,
  fetchDevolucoes,
  fetchPedidosACaminho,
} from "./db";
import type {
  ContaPlataforma, Cor, Devolucao, DevolucaoItem,
  Empresa, Modelo, ModeloVariantes, Motivo,
  Peca, PedidoACaminho, Plataforma, ReturnStatus,
  Tamanho, TipoDefeito,
} from "./types";

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Gera UUID padrão — compatível diretamente com o Supabase (sem substituição de ID) */
const uid = () => crypto.randomUUID();

// ──────────────────────────────────────────────
// State & Actions interfaces
// ──────────────────────────────────────────────

interface State {
  // Meta do store
  _initialized: boolean;
  _loading: boolean;
  _workspaceId: string | null;

  // Catálogo
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

  // Transações
  devolucoes: Devolucao[];
  pedidosACaminho: PedidoACaminho[];

  // UI
  theme: "light" | "dark";
}

interface Actions {
  // Boot
  initialize: () => Promise<void>;

  // Devoluções
  addDevolucao: (d: Omit<Devolucao, "id" | "createdAt">) => Devolucao;
  updateDevolucao: (id: string, patch: Partial<Devolucao>) => void;
  deleteDevolucao: (id: string) => void;
  setStatus: (
    id: string,
    status: ReturnStatus,
    valorRecuperado?: number,
    tipoDefeitoId?: string
  ) => void;

  // Pedidos a caminho
  addPedidoACaminho: (p: Omit<PedidoACaminho, "id" | "createdAt">) => PedidoACaminho;
  updatePedidoACaminho: (id: string, patch: Partial<PedidoACaminho>) => void;
  deletePedidoACaminho: (id: string) => void;

  // Catálogo — Empresas
  addEmpresa: (nome: string, cnpj?: string) => Empresa;
  updateEmpresa: (id: string, patch: Partial<Empresa>) => void;
  deleteEmpresa: (id: string) => void;

  // Catálogo — Plataformas
  addPlataforma: (nome: string) => Plataforma;
  updatePlataforma: (id: string, patch: Partial<Plataforma>) => void;
  deletePlataforma: (id: string) => void;

  // Catálogo — Contas Plataforma
  toggleConta: (empresaId: string, plataformaId: string) => void;

  // Catálogo — Modelos
  addModelo: (nome: string) => Modelo;
  deleteModelo: (id: string) => void;
  toggleModeloCor: (modeloId: string, cor: string) => void;
  toggleModeloTamanho: (modeloId: string, tamanho: string) => void;
  addCorEVincular: (modeloId: string, nome: string) => void;
  addTamanhoEVincular: (modeloId: string, nome: string) => void;

  // Catálogo — Peças, Cores, Tamanhos
  addPeca: (nome: string) => Peca;
  deletePeca: (id: string) => void;
  addCor: (nome: string) => Cor;
  deleteCor: (id: string) => void;
  addTamanho: (nome: string) => Tamanho;
  deleteTamanho: (id: string) => void;

  // Catálogo — Motivos
  addMotivo: (nome: string, geraPerda?: boolean) => Motivo;
  updateMotivo: (id: string, patch: Partial<Motivo>) => void;
  deleteMotivo: (id: string) => void;

  // Catálogo — Tipos de Defeito
  addTipoDefeito: (nome: string) => TipoDefeito;
  deleteTipoDefeito: (id: string) => void;

  // UI
  setTheme: (t: "light" | "dark") => void;
}

// ──────────────────────────────────────────────
// Implementação
// ──────────────────────────────────────────────

export const useStore = create<State & Actions>()((set, get) => {
  /**
   * _syncGuard: executa `fn` async e, em caso de erro,
   * mostra toast e reinicializa o store a partir do banco.
   * Garante que o estado local nunca fique divergente por mais de 1 ciclo.
   */
  const _syncGuard = (fn: () => Promise<void>) => {
    fn().catch((err) => {
      const msg: string = err?.message ?? "Erro de sincronização";
      console.error("[VEXO sync]", msg);
      toast.error("Erro ao salvar", {
        description: msg,
        action: { label: "Recarregar", onClick: () => get().initialize() },
      });
      // Reinicializa para corrigir qualquer inconsistência local
      get().initialize().catch(console.error);
    });
  };

  /** Sincroniza variantes de um modelo com o Supabase */
  const _syncVariantes = (modeloId: string) => {
    const { _workspaceId, modeloVariantes } = get();
    if (!_workspaceId) return;
    const mv = modeloVariantes.find((m) => m.modeloId === modeloId);
    if (!mv) return;
    _syncGuard(() =>
      db.dbUpsertModeloVariantes(
        _workspaceId,
        mv.id,
        modeloId,
        mv.cores,
        mv.tamanhos
      )
    );
  };

  return {
    // ── Estado inicial (vazio — hydratado pelo initialize()) ──────────
    _initialized: false,
    _loading: false,
    _workspaceId: null,
    empresas:        [],
    plataformas:     [],
    contas:          [],
    modelos:         [],
    modeloVariantes: [],
    pecas:           [],
    cores:           [],
    tamanhos:        [],
    motivos:         [],
    tiposDefeito:    [],
    devolucoes:      [],
    pedidosACaminho: [],
    theme: "light",

    // ── Boot ─────────────────────────────────────────────────────────
    initialize: async () => {
      set({ _loading: true });
      try {
        const wsId = await getWorkspaceId();
        if (!wsId) {
          console.warn("[VEXO] Workspace não encontrado — usuário não autenticado?");
          set({ _loading: false, _initialized: true });
          return;
        }

        const [catalogo, devolucoes, pedidosACaminho] = await Promise.all([
          fetchCatalogo(wsId),
          fetchDevolucoes(wsId),
          fetchPedidosACaminho(wsId),
        ]);

        set({
          _workspaceId: wsId,
          ...catalogo,
          devolucoes,
          pedidosACaminho,
          _initialized: true,
          _loading: false,
        });
      } catch (err: any) {
        console.error("[VEXO] initialize() error:", err?.message);
        set({ _loading: false, _initialized: true });
        toast.error("Erro ao carregar dados", {
          description: err?.message,
          action: { label: "Tentar novamente", onClick: () => get().initialize() },
        });
      }
    },

    // ── Devoluções ────────────────────────────────────────────────────
    addDevolucao: (d) => {
      const { _workspaceId } = get();
      const id = uid();
      const novo: Devolucao = {
        ...d,
        id,
        createdAt: new Date().toISOString(),
        itens: d.itens.map((it) => ({ ...it, id: it.id || uid() })),
      };
      set((s) => ({ devolucoes: [novo, ...s.devolucoes] }));
      if (_workspaceId) {
        _syncGuard(() => db.insertDevolucao(_workspaceId, id, novo));
      }
      return novo;
    },

    updateDevolucao: (id, patch) =>
      set((s) => ({
        devolucoes: s.devolucoes.map((d) =>
          d.id === id ? { ...d, ...patch } : d
        ),
      })),

    deleteDevolucao: (id) => {
      set((s) => ({ devolucoes: s.devolucoes.filter((d) => d.id !== id) }));
      _syncGuard(() => db.softDeleteDevolucao(id));
    },

    setStatus: (id, status, valorRecuperado, tipoDefeitoId) => {
      set((s) => ({
        devolucoes: s.devolucoes.map((d) => {
          if (d.id !== id) return d;
          const total = d.itens.reduce((acc, it) => acc + Number(it.valor || 0), 0);
          return {
            ...d,
            status,
            valorRecuperado:
              status === "resolved"
                ? valorRecuperado ?? total
                : status === "loss"
                ? valorRecuperado ?? 0
                : d.valorRecuperado,
            tipoDefeitoId:
              tipoDefeitoId !== undefined ? tipoDefeitoId || undefined : d.tipoDefeitoId,
          };
        }),
      }));
      _syncGuard(() =>
        db.updateDevolucaoStatus(id, status, valorRecuperado, tipoDefeitoId)
      );
    },

    // ── Pedidos a caminho ─────────────────────────────────────────────
    addPedidoACaminho: (p) => {
      const { _workspaceId } = get();
      const id = uid();
      const novo: PedidoACaminho = {
        ...p,
        id,
        createdAt: new Date().toISOString(),
        itens: p.itens.map((it) => ({ ...it, id: it.id || uid() })),
      };
      set((s) => ({ pedidosACaminho: [novo, ...s.pedidosACaminho] }));
      if (_workspaceId) {
        _syncGuard(() => db.insertPedidoACaminho(_workspaceId, id, novo));
      }
      return novo;
    },

    updatePedidoACaminho: (id, patch) =>
      set((s) => ({
        pedidosACaminho: s.pedidosACaminho.map((p) =>
          p.id === id ? { ...p, ...patch } : p
        ),
      })),

    deletePedidoACaminho: (id) => {
      set((s) => ({ pedidosACaminho: s.pedidosACaminho.filter((p) => p.id !== id) }));
      _syncGuard(() => db.softDeletePedidoACaminho(id));
    },

    // ── Empresas ──────────────────────────────────────────────────────
    addEmpresa: (nome, cnpj) => {
      const { _workspaceId } = get();
      const id = uid();
      const novo: Empresa = { id, nome, cnpj };
      set((s) => ({ empresas: [...s.empresas, novo] }));
      if (_workspaceId) {
        _syncGuard(() => db.dbInsertEmpresa(_workspaceId, id, nome, cnpj));
      }
      return novo;
    },

    updateEmpresa: (id, patch) =>
      set((s) => ({
        empresas: s.empresas.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      })),

    deleteEmpresa: (id) => {
      set((s) => ({
        empresas: s.empresas.filter((e) => e.id !== id),
        contas: s.contas.filter((c) => c.empresaId !== id),
      }));
      _syncGuard(() => db.dbDeleteEmpresa(id));
    },

    // ── Plataformas ───────────────────────────────────────────────────
    addPlataforma: (nome) => {
      const { _workspaceId } = get();
      const id = uid();
      const novo: Plataforma = { id, nome };
      set((s) => ({ plataformas: [...s.plataformas, novo] }));
      if (_workspaceId) {
        _syncGuard(() => db.dbInsertPlataforma(_workspaceId, id, nome));
      }
      return novo;
    },

    updatePlataforma: (id, patch) =>
      set((s) => ({
        plataformas: s.plataformas.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      })),

    deletePlataforma: (id) => {
      set((s) => ({
        plataformas: s.plataformas.filter((p) => p.id !== id),
        contas: s.contas.filter((c) => c.plataformaId !== id),
      }));
      _syncGuard(() => db.dbDeletePlataforma(id));
    },

    // ── Contas (vínculo empresa × plataforma) ─────────────────────────
    toggleConta: (empresaId, plataformaId) => {
      const { _workspaceId } = get();
      const existente = get().contas.find(
        (c) => c.empresaId === empresaId && c.plataformaId === plataformaId
      );
      if (existente) {
        set((s) => ({ contas: s.contas.filter((c) => c.id !== existente.id) }));
        _syncGuard(async () => { await db.dbDeleteConta(existente.id); });
      } else {
        const id = uid();
        set((s) => ({
          contas: [...s.contas, { id, empresaId, plataformaId }],
        }));
        if (_workspaceId) {
          _syncGuard(() => db.dbInsertConta(_workspaceId, id, empresaId, plataformaId));
        }
      }
    },

    // ── Modelos ───────────────────────────────────────────────────────
    addModelo: (nome) => {
      const { _workspaceId } = get();
      const id = uid();
      const novo = { id, nome };
      set((s) => ({ modelos: [...s.modelos, novo] }));
      if (_workspaceId) {
        _syncGuard(() => db.dbInsertModelo(_workspaceId, id, nome));
      }
      return novo;
    },

    deleteModelo: (id) => {
      set((s) => ({
        modelos: s.modelos.filter((m) => m.id !== id),
        modeloVariantes: s.modeloVariantes.filter((mv) => mv.modeloId !== id),
      }));
      _syncGuard(() => db.dbDeleteModelo(id));
    },

    toggleModeloCor: (modeloId, cor) => {
      const { _workspaceId } = get();
      const existente = get().modeloVariantes.find((mv) => mv.modeloId === modeloId);
      if (!existente) {
        const id = uid();
        set((s) => ({
          modeloVariantes: [
            ...s.modeloVariantes,
            { id, modeloId, cores: [cor], tamanhos: [] },
          ],
        }));
        if (_workspaceId) {
          _syncGuard(() =>
            db.dbUpsertModeloVariantes(_workspaceId, id, modeloId, [cor], [])
          );
        }
      } else {
        const has = existente.cores.includes(cor);
        const novoCores = has
          ? existente.cores.filter((c) => c !== cor)
          : [...existente.cores, cor];
        set((s) => ({
          modeloVariantes: s.modeloVariantes.map((mv) =>
            mv.id === existente.id ? { ...mv, cores: novoCores } : mv
          ),
        }));
        setTimeout(() => _syncVariantes(modeloId), 0);
      }
    },

    toggleModeloTamanho: (modeloId, tamanho) => {
      const { _workspaceId } = get();
      const existente = get().modeloVariantes.find((mv) => mv.modeloId === modeloId);
      if (!existente) {
        const id = uid();
        set((s) => ({
          modeloVariantes: [
            ...s.modeloVariantes,
            { id, modeloId, cores: [], tamanhos: [tamanho] },
          ],
        }));
        if (_workspaceId) {
          _syncGuard(() =>
            db.dbUpsertModeloVariantes(_workspaceId, id, modeloId, [], [tamanho])
          );
        }
      } else {
        const has = existente.tamanhos.includes(tamanho);
        const novoTamanhos = has
          ? existente.tamanhos.filter((t) => t !== tamanho)
          : [...existente.tamanhos, tamanho];
        set((s) => ({
          modeloVariantes: s.modeloVariantes.map((mv) =>
            mv.id === existente.id ? { ...mv, tamanhos: novoTamanhos } : mv
          ),
        }));
        setTimeout(() => _syncVariantes(modeloId), 0);
      }
    },

    addCorEVincular: (modeloId, nome) => {
      const trimmed = nome.trim();
      if (!trimmed) return;
      const s = get();
      const existente = s.cores.find(
        (c) => c.nome.toLowerCase() === trimmed.toLowerCase()
      );
      const corNome = existente?.nome ?? trimmed;
      if (!existente) get().addCor(trimmed);
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
        (t) => t.nome.toLowerCase() === trimmed.toLowerCase()
      );
      const tamNome = existente?.nome ?? trimmed;
      if (!existente) get().addTamanho(trimmed);
      const mv = get().modeloVariantes.find((m) => m.modeloId === modeloId);
      if (!mv || !mv.tamanhos.includes(tamNome)) {
        get().toggleModeloTamanho(modeloId, tamNome);
      }
    },

    // ── Peças ─────────────────────────────────────────────────────────
    addPeca: (nome) => {
      const { _workspaceId } = get();
      const id = uid();
      const novo = { id, nome };
      set((s) => ({ pecas: [...s.pecas, novo] }));
      if (_workspaceId) _syncGuard(() => db.dbInsertPeca(_workspaceId, id, nome));
      return novo;
    },
    deletePeca: (id) => {
      set((s) => ({ pecas: s.pecas.filter((x) => x.id !== id) }));
      _syncGuard(() => db.dbDeletePeca(id));
    },

    // ── Cores ─────────────────────────────────────────────────────────
    addCor: (nome) => {
      const { _workspaceId } = get();
      const id = uid();
      const novo = { id, nome };
      set((s) => ({ cores: [...s.cores, novo] }));
      if (_workspaceId) _syncGuard(() => db.dbInsertCor(_workspaceId, id, nome));
      return novo;
    },
    deleteCor: (id) => {
      set((s) => ({ cores: s.cores.filter((x) => x.id !== id) }));
      _syncGuard(() => db.dbDeleteCor(id));
    },

    // ── Tamanhos ──────────────────────────────────────────────────────
    addTamanho: (nome) => {
      const { _workspaceId } = get();
      const id = uid();
      const novo = { id, nome };
      set((s) => ({ tamanhos: [...s.tamanhos, novo] }));
      if (_workspaceId) _syncGuard(() => db.dbInsertTamanho(_workspaceId, id, nome));
      return novo;
    },
    deleteTamanho: (id) => {
      set((s) => ({ tamanhos: s.tamanhos.filter((x) => x.id !== id) }));
      _syncGuard(() => db.dbDeleteTamanho(id));
    },

    // ── Motivos ───────────────────────────────────────────────────────
    addMotivo: (nome, geraPerda) => {
      const { _workspaceId } = get();
      const id = uid();
      const novo: Motivo = { id, nome, geraPerda: geraPerda ?? true };
      set((s) => ({ motivos: [...s.motivos, novo] }));
      if (_workspaceId) {
        _syncGuard(() =>
          db.dbInsertMotivo(_workspaceId, id, nome, geraPerda ?? true)
        );
      }
      return novo;
    },
    updateMotivo: (id, patch) => {
      set((s) => ({
        motivos: s.motivos.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      }));
      const dbPatch: { nome?: string; gera_perda?: boolean } = {};
      if (patch.nome !== undefined) dbPatch.nome = patch.nome;
      if (patch.geraPerda !== undefined) dbPatch.gera_perda = patch.geraPerda;
      _syncGuard(() => db.dbUpdateMotivo(id, dbPatch));
    },
    deleteMotivo: (id) => {
      set((s) => ({ motivos: s.motivos.filter((x) => x.id !== id) }));
      _syncGuard(() => db.dbDeleteMotivo(id));
    },

    // ── Tipos de Defeito ──────────────────────────────────────────────
    addTipoDefeito: (nome) => {
      const { _workspaceId } = get();
      const id = uid();
      const novo: TipoDefeito = { id, nome };
      set((s) => ({ tiposDefeito: [...s.tiposDefeito, novo] }));
      if (_workspaceId) {
        _syncGuard(() => db.dbInsertTipoDefeito(_workspaceId, id, nome));
      }
      return novo;
    },
    deleteTipoDefeito: (id) => {
      set((s) => ({ tiposDefeito: s.tiposDefeito.filter((x) => x.id !== id) }));
      _syncGuard(() => db.dbDeleteTipoDefeito(id));
    },

    // ── UI ────────────────────────────────────────────────────────────
    setTheme: (t) => set({ theme: t }),
  };
});

// ──────────────────────────────────────────────
// Selectors
// ──────────────────────────────────────────────

export const selectPlataformasDeEmpresa = (empresaId: string | undefined) => {
  if (!empresaId) return [];
  const { contas, plataformas } = useStore.getState();
  const ids = contas.filter((c) => c.empresaId === empresaId).map((c) => c.plataformaId);
  return plataformas.filter((p) => ids.includes(p.id));
};

export interface VariantesResolvidas {
  cores: { nome: string }[];
  tamanhos: { nome: string }[];
  hasVinculo: boolean;
}

export const selectVariantesDoModelo = (
  modeloId: string | undefined,
  todasCores: { nome: string }[],
  todosTamanhos: { nome: string }[],
  modeloVariantes: ModeloVariantes[]
): VariantesResolvidas => {
  if (!modeloId)
    return { cores: todasCores, tamanhos: todosTamanhos, hasVinculo: false };
  const mv = modeloVariantes.find((m) => m.modeloId === modeloId);
  if (!mv)
    return { cores: todasCores, tamanhos: todosTamanhos, hasVinculo: false };
  return {
    cores:    mv.cores.length > 0 ? mv.cores.map((nome) => ({ nome })) : todasCores,
    tamanhos: mv.tamanhos.length > 0 ? mv.tamanhos.map((nome) => ({ nome })) : todosTamanhos,
    hasVinculo: true,
  };
};

export const lookup = <T extends { id: string; nome: string }>(arr: T[], id: string) =>
  arr.find((x) => x.id === id)?.nome ?? "—";