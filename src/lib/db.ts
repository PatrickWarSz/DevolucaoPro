/**
 * db.ts — Camada de acesso ao banco para o DevolucaoPro
 *
 * Padrão VEXO:
 * - maybeSingle() em vez de single() para evitar throw silencioso
 * - workspace_id sempre passado no INSERT (RLS valida, não preenche)
 * - deleted_at IS NULL em todas as queries de leitura de catálogo
 * - Tabelas com prefixo dev_ para isolar do EstoquePro no mesmo banco
 */

import { supabase } from "./supabase";
import type {
  ContaPlataforma, Cor, Devolucao, DevolucaoItem,
  Empresa, Modelo, ModeloVariantes, Motivo,
  Peca, PedidoACaminho, Plataforma, Tamanho, TipoDefeito,
} from "./types";

// ══════════════════════════════════════════════════════════════
// MAPPERS: row do banco → tipo do frontend
// ══════════════════════════════════════════════════════════════

const mapEmpresa = (r: any): Empresa => ({
  id: r.id,
  nome: r.nome,
  cnpj: r.cnpj ?? undefined,
});

const mapPlataforma = (r: any): Plataforma => ({
  id: r.id,
  nome: r.nome,
});

const mapConta = (r: any): ContaPlataforma => ({
  id: r.id,
  empresaId: r.empresa_id,
  plataformaId: r.plataforma_id,
  apelido: r.apelido ?? undefined,
});

const mapModelo = (r: any): Modelo => ({ id: r.id, nome: r.nome });

const mapModeloVariantes = (r: any): ModeloVariantes => ({
  id: r.id,
  modeloId: r.modelo_id,
  cores: r.cores ?? [],
  tamanhos: r.tamanhos ?? [],
});

const mapPeca = (r: any): Peca => ({ id: r.id, nome: r.nome });
const mapCor = (r: any): Cor => ({ id: r.id, nome: r.nome });
const mapTamanho = (r: any): Tamanho => ({ id: r.id, nome: r.nome });

const mapMotivo = (r: any): Motivo => ({
  id: r.id,
  nome: r.nome,
  geraPerda: r.gera_perda ?? true,
});

const mapTipoDefeito = (r: any): TipoDefeito => ({ id: r.id, nome: r.nome });

const mapItem = (r: any): DevolucaoItem => ({
  id: r.id,
  modeloId: r.modelo_id ?? "",
  pecaId: r.peca_id ?? "",
  cor: r.cor ?? "",
  tamanho: r.tamanho ?? "",
  quantidade: Number(r.quantidade ?? 1),
  valor: Number(r.valor ?? 0),
});

const mapDevolucao = (r: any): Devolucao => ({
  id: r.id,
  createdAt: r.criado_em,
  competencia: r.competencia,
  empresaId: r.empresa_id ?? "",
  plataformaId: r.plataforma_id ?? "",
  pedidoId: r.pedido_id ?? "",
  devolucaoId: r.devolucao_id ?? "",
  motivoId: r.motivo_id ?? "",
  status: r.status,
  valorRecuperado: r.valor_recuperado ?? undefined,
  tipoDefeitoId: r.tipo_defeito_id ?? undefined,
  notas: r.notas ?? undefined,
  itens: (r.dev_devolucao_itens ?? []).map(mapItem),
});

const mapPedidoACaminho = (r: any): PedidoACaminho => ({
  id: r.id,
  createdAt: r.criado_em,
  empresaId: r.empresa_id ?? "",
  plataformaId: r.plataforma_id ?? "",
  pedidoId: r.pedido_id,
  devolucaoId: r.devolucao_id ?? undefined,
  motivoId: r.motivo_id ?? undefined,
  notas: r.notas ?? undefined,
  itens: (r.dev_pedido_a_caminho_itens ?? []).map(mapItem),
});

// ══════════════════════════════════════════════════════════════
// FETCH ALL — para hydration do store no initialize()
// ══════════════════════════════════════════════════════════════

export async function fetchCatalogo(wsId: string) {
  const [
    empresasRes, plataformasRes, contasRes,
    modelosRes, variantesRes,
    pecasRes, coresRes, tamanhosRes,
    motivosRes, tiposDefeitoRes,
  ] = await Promise.all([
    supabase.from("dev_empresas").select("*").eq("workspace_id", wsId).is("deleted_at", null),
    supabase.from("dev_plataformas").select("*").eq("workspace_id", wsId).is("deleted_at", null),
    supabase.from("dev_contas_plataforma").select("*").eq("workspace_id", wsId),
    supabase.from("dev_modelos").select("*").eq("workspace_id", wsId).is("deleted_at", null),
    supabase.from("dev_modelo_variantes").select("*").eq("workspace_id", wsId),
    supabase.from("dev_pecas").select("*").eq("workspace_id", wsId).is("deleted_at", null),
    supabase.from("dev_cores").select("*").eq("workspace_id", wsId).is("deleted_at", null),
    supabase.from("dev_tamanhos").select("*").eq("workspace_id", wsId).is("deleted_at", null),
    supabase.from("dev_motivos").select("*").eq("workspace_id", wsId).is("deleted_at", null),
    supabase.from("dev_tipos_defeito").select("*").eq("workspace_id", wsId).is("deleted_at", null),
  ]);

  return {
    empresas:      (empresasRes.data ?? []).map(mapEmpresa),
    plataformas:   (plataformasRes.data ?? []).map(mapPlataforma),
    contas:        (contasRes.data ?? []).map(mapConta),
    modelos:       (modelosRes.data ?? []).map(mapModelo),
    modeloVariantes:(variantesRes.data ?? []).map(mapModeloVariantes),
    pecas:         (pecasRes.data ?? []).map(mapPeca),
    cores:         (coresRes.data ?? []).map(mapCor),
    tamanhos:      (tamanhosRes.data ?? []).map(mapTamanho),
    motivos:       (motivosRes.data ?? []).map(mapMotivo),
    tiposDefeito:  (tiposDefeitoRes.data ?? []).map(mapTipoDefeito),
  };
}

export async function fetchDevolucoes(wsId: string): Promise<Devolucao[]> {
  const { data, error } = await supabase
    .from("dev_devolucoes")
    .select("*, dev_devolucao_itens(*)")
    .eq("workspace_id", wsId)
    .is("deleted_at", null)
    .order("criado_em", { ascending: false })
    .limit(500);

  if (error) throw error;
  return (data ?? []).map(mapDevolucao);
}

export async function fetchPedidosACaminho(wsId: string): Promise<PedidoACaminho[]> {
  const { data, error } = await supabase
    .from("dev_pedidos_a_caminho")
    .select("*, dev_pedido_a_caminho_itens(*)")
    .eq("workspace_id", wsId)
    .is("deleted_at", null)
    .order("criado_em", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapPedidoACaminho);
}

// ══════════════════════════════════════════════════════════════
// DEVOLUÇÕES — CRUD
// ══════════════════════════════════════════════════════════════

export async function insertDevolucao(
  wsId: string,
  id: string,
  d: Omit<Devolucao, "id" | "createdAt">
): Promise<void> {
  // 1. Insere cabeçalho
  const { error: errCab } = await supabase.from("dev_devolucoes").insert({
    id,
    workspace_id: wsId,
    empresa_id:      d.empresaId    || null,
    plataforma_id:   d.plataformaId || null,
    motivo_id:       d.motivoId     || null,
    tipo_defeito_id: d.tipoDefeitoId ?? null,
    pedido_id:       d.pedidoId,
    devolucao_id:    d.devolucaoId,
    competencia:     d.competencia,
    status:          d.status,
    valor_recuperado:d.valorRecuperado ?? null,
    notas:           d.notas ?? null,
  });
  if (errCab) throw errCab;

  // 2. Insere itens
  if (d.itens.length > 0) {
    const { error: errItens } = await supabase.from("dev_devolucao_itens").insert(
      d.itens.map((it) => ({
        id:           it.id,
        workspace_id: wsId,
        devolucao_id: id,
        modelo_id:    it.modeloId  || null,
        peca_id:      it.pecaId    || null,
        cor:          it.cor,
        tamanho:      it.tamanho,
        quantidade:   it.quantidade,
        valor:        it.valor,
      }))
    );
    if (errItens) throw errItens;
  }
}

export async function updateDevolucaoStatus(
  id: string,
  status: Devolucao["status"],
  valorRecuperado?: number,
  tipoDefeitoId?: string
): Promise<void> {
  const { error } = await supabase
    .from("dev_devolucoes")
    .update({
      status,
      valor_recuperado:  valorRecuperado ?? null,
      tipo_defeito_id:   tipoDefeitoId ?? null,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function softDeleteDevolucao(id: string): Promise<void> {
  const { error } = await supabase
    .from("dev_devolucoes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ══════════════════════════════════════════════════════════════
// PEDIDOS A CAMINHO — CRUD
// ══════════════════════════════════════════════════════════════

export async function insertPedidoACaminho(
  wsId: string,
  id: string,
  p: Omit<PedidoACaminho, "id" | "createdAt">
): Promise<void> {
  const { error: errCab } = await supabase.from("dev_pedidos_a_caminho").insert({
    id,
    workspace_id: wsId,
    empresa_id:   p.empresaId    || null,
    plataforma_id:p.plataformaId || null,
    motivo_id:    p.motivoId     ?? null,
    pedido_id:    p.pedidoId,
    devolucao_id: p.devolucaoId  ?? null,
    notas:        p.notas        ?? null,
  });
  if (errCab) throw errCab;

  if (p.itens.length > 0) {
    const { error: errItens } = await supabase.from("dev_pedido_a_caminho_itens").insert(
      p.itens.map((it) => ({
        id:                   it.id,
        workspace_id:         wsId,
        pedido_a_caminho_id:  id,
        modelo_id:            it.modeloId || null,
        peca_id:              it.pecaId   || null,
        cor:                  it.cor,
        tamanho:              it.tamanho,
        quantidade:           it.quantidade,
        valor:                it.valor,
      }))
    );
    if (errItens) throw errItens;
  }
}

export async function softDeletePedidoACaminho(id: string): Promise<void> {
  const { error } = await supabase
    .from("dev_pedidos_a_caminho")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ══════════════════════════════════════════════════════════════
// CATÁLOGO — helpers genéricos
// ══════════════════════════════════════════════════════════════

async function catalogInsert(table: string, wsId: string, id: string, extra: object) {
  const { error } = await supabase.from(table).insert({ id, workspace_id: wsId, ...extra });
  if (error) throw error;
}

async function catalogSoftDelete(table: string, id: string) {
  const { error } = await supabase
    .from(table)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

async function catalogUpdate(table: string, id: string, patch: object) {
  const { error } = await supabase.from(table).update(patch).eq("id", id);
  if (error) throw error;
}

// Empresas
export const dbInsertEmpresa = (wsId: string, id: string, nome: string, cnpj?: string) =>
  catalogInsert("dev_empresas", wsId, id, { nome, cnpj: cnpj ?? null });
export const dbDeleteEmpresa = (id: string) => catalogSoftDelete("dev_empresas", id);

// Plataformas
export const dbInsertPlataforma = (wsId: string, id: string, nome: string) =>
  catalogInsert("dev_plataformas", wsId, id, { nome });
export const dbDeletePlataforma = (id: string) => catalogSoftDelete("dev_plataformas", id);

// Contas Plataforma
export const dbInsertConta = (wsId: string, id: string, empresaId: string, plataformaId: string) =>
  catalogInsert("dev_contas_plataforma", wsId, id, { empresa_id: empresaId, plataforma_id: plataformaId });
export const dbDeleteConta = (id: string) =>
  supabase.from("dev_contas_plataforma").delete().eq("id", id);

// Modelos
export const dbInsertModelo = (wsId: string, id: string, nome: string) =>
  catalogInsert("dev_modelos", wsId, id, { nome });
export const dbDeleteModelo = (id: string) => catalogSoftDelete("dev_modelos", id);

// Modelo Variantes (upsert — pode já existir)
export async function dbUpsertModeloVariantes(wsId: string, id: string, modeloId: string, cores: string[], tamanhos: string[]) {
  const { error } = await supabase.from("dev_modelo_variantes").upsert(
    { id, workspace_id: wsId, modelo_id: modeloId, cores, tamanhos, atualizado_em: new Date().toISOString() },
    { onConflict: "workspace_id,modelo_id" }
  );
  if (error) throw error;
}

// Peças
export const dbInsertPeca = (wsId: string, id: string, nome: string) =>
  catalogInsert("dev_pecas", wsId, id, { nome });
export const dbDeletePeca = (id: string) => catalogSoftDelete("dev_pecas", id);

// Cores
export const dbInsertCor = (wsId: string, id: string, nome: string) =>
  catalogInsert("dev_cores", wsId, id, { nome });
export const dbDeleteCor = (id: string) => catalogSoftDelete("dev_cores", id);

// Tamanhos
export const dbInsertTamanho = (wsId: string, id: string, nome: string) =>
  catalogInsert("dev_tamanhos", wsId, id, { nome });
export const dbDeleteTamanho = (id: string) => catalogSoftDelete("dev_tamanhos", id);

// Motivos
export const dbInsertMotivo = (wsId: string, id: string, nome: string, geraPerda: boolean) =>
  catalogInsert("dev_motivos", wsId, id, { nome, gera_perda: geraPerda });
export const dbUpdateMotivo = (id: string, patch: { nome?: string; gera_perda?: boolean }) =>
  catalogUpdate("dev_motivos", id, patch);
export const dbDeleteMotivo = (id: string) => catalogSoftDelete("dev_motivos", id);

// Tipos de Defeito
export const dbInsertTipoDefeito = (wsId: string, id: string, nome: string) =>
  catalogInsert("dev_tipos_defeito", wsId, id, { nome });
export const dbDeleteTipoDefeito = (id: string) => catalogSoftDelete("dev_tipos_defeito", id);