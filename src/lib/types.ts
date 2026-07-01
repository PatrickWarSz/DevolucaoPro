export type ID = string;

export type ReturnStatus = "resolved" | "dispute" | "loss" | "pending";

export interface Empresa {
  id: ID;
  nome: string;
  cnpj?: string;
}

export interface Plataforma {
  id: ID;
  nome: string;
}

/** Vínculo Empresa <-> Plataforma (uma empresa pode estar em várias plataformas) */
export interface ContaPlataforma {
  id: ID;
  empresaId: ID;
  plataformaId: ID;
  apelido?: string;
}

export interface Modelo {
  id: ID;
  nome: string;
}

/** Vínculo Modelo → variantes disponíveis (cores e tamanhos).
 *  Quando um modelo NÃO tem entrada aqui, o app mostra todas as cores/tamanhos
 *  do catálogo (fallback "mostrar tudo"). Quando tem, os selects filtram pra
 *  acelerar o cadastro: "Calça Legging só vem em Preto/Rosa/Branco e P/M".
 *
 *  Os arrays guardam NOMES (string), não IDs, porque cor/tamanho são gravados
 *  como nome em DevolucaoItem.cor / tamanho — manter consistência facilita
 *  filtragem e evita lookup extra. */
export interface ModeloVariantes {
  id: ID;
  modeloId: ID;
  cores: string[];   // nomes das cores permitidas
  tamanhos: string[]; // nomes dos tamanhos permitidos
}

/** Componente do produto (ex.: legging, top, tela, carregador, peça única).
 *  Antes chamado de "Peça" — mantemos a chave `pecas` no store por compatibilidade. */
export interface Peca {
  id: ID;
  nome: string;
}

/** Tipo de defeito constatado quando uma devolução é finalizada por motivo
 *  que gera perda operacional (ex.: rasgo na costura, mancha, tela quebrada). */
export interface TipoDefeito {
  id: ID;
  nome: string;
}

export interface Cor {
  id: ID;
  nome: string;
}

export interface Tamanho {
  id: ID;
  nome: string;
}

export interface Motivo {
  id: ID;
  nome: string;
  /** Se true, devoluções com este motivo geram perda operacional para o vendedor
   *  (ex.: defeito, envio errado). Se false, são "sem perda" (ex.: arrependimento)
   *  e não entram em valor recuperado nem em valor de perda no dashboard. */
  geraPerda?: boolean;
}

/** Item individual dentro de uma devolução. Uma devolução pode ter N itens
 *  (ex.: pedido com calça legging + short, ou mesmo modelo em cores diferentes). */
export interface DevolucaoItem {
  id: ID;
  modeloId: ID;
  pecaId: ID;
  cor: string;
  tamanho: string;
  quantidade: number;
  valor: number; // valor unitário do produto
}

/** Pré-cadastro de pedido que o cliente já postou mas ainda não chegou.
 *  Quando chega, é convertido em uma Devolucao usando seus dados. */
export interface PedidoACaminho {
  id: ID;
  createdAt: string; // ISO
  empresaId: ID;
  plataformaId: ID;
  pedidoId: string;
  /** ID da devolução na plataforma (opcional, nem sempre disponível ainda) */
  devolucaoId?: string;
  /** Motivo previsto, se o cliente já informou */
  motivoId?: ID;
  notas?: string;
  itens: DevolucaoItem[];
}

export interface Devolucao {
  id: ID;
  createdAt: string; // ISO
  competencia: string; // YYYY-MM
  empresaId: ID;
  plataformaId: ID;
  pedidoId: string;
  devolucaoId: string;
  motivoId: ID;
  status: ReturnStatus;
  /** valor total recuperado quando a disputa é ganha */
  valorRecuperado?: number;
  /** Tipo de defeito constatado — preenchido apenas ao finalizar a devolução
   *  como Resolvida ou Perda quando o motivo gera perda operacional. */
  tipoDefeitoId?: ID;
  notas?: string;
  /** Sinaliza se esta devolução já passou por status "Em disputa" em algum
   *  momento. Uma vez marcada como true, permanece true mesmo após a disputa
   *  ser resolvida (ganha) ou perdida. Usado no dashboard para manter o
   *  histórico de "quantas disputas foram feitas no mês" fixo. */
  foiDisputa?: boolean;
  itens: DevolucaoItem[];
}
