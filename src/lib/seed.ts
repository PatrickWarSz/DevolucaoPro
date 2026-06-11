import type {
  ContaPlataforma,
  Cor,
  Devolucao,
  Empresa,
  Modelo,
  ModeloVariantes,
  Motivo,
  Peca,
  Plataforma,
  Tamanho,
  TipoDefeito,
} from "./types";

/**
 * VEXO — Estado inicial limpo.
 * Nenhum registro ou catálogo pré-salvo. Tudo será cadastrado pelo usuário
 * a partir da operação real (ou via backend quando conectado).
 */

export const seedEmpresas: Empresa[] = [];
export const seedPlataformas: Plataforma[] = [];
export const seedContas: ContaPlataforma[] = [];
export const seedModelos: Modelo[] = [];
export const seedModeloVariantes: ModeloVariantes[] = [];
export const seedPecas: Peca[] = [];
export const seedTiposDefeito: TipoDefeito[] = [];
export const seedCores: Cor[] = [];
export const seedTamanhos: Tamanho[] = [];
export const seedMotivos: Motivo[] = [];
export const seedDevolucoes: Devolucao[] = [];
