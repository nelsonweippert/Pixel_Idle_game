/**
 * ART_SPEC — a Bíblia de Arte como código. É a fonte de verdade das regras
 * OBJETIVAS que todo asset precisa obedecer. Ratificada em 2026-07-11 (direção
 * de mercado: 32px base, top-down 4-dir, animação nível Tibia, Resurrect 64).
 *
 * A versão legível pra humanos vive em docs/ART_BIBLE.md — mas ESTE arquivo é
 * quem o validador consulta. Mudou aqui, mudou a regra.
 */

import { PALETTE_NAME } from "./palette";

export type AssetType = "tile" | "character" | "creature" | "prop" | "icon" | "effect";
export type Anchor = "bottom-center" | "center";

export interface Size {
  w: number;
  h: number;
}

export interface AnimRule {
  name: string;
  /** frames por direção (faixa permitida) */
  minFrames: number;
  maxFrames: number;
  directions: 1 | 4 | 8;
  fps: number;
  /** se a animação pode não existir pro asset */
  optional?: boolean;
}

export interface TypeSpec {
  type: AssetType;
  /** tamanhos de canvas (por frame) permitidos */
  sizes: Size[];
  /** teto de cores por sprite (contagem, não pertencimento) */
  maxColors: number;
  /** fundo precisa ser transparente (cantos vazios) */
  requireTransparency: boolean;
  anchor: Anchor;
  /** [] = estático (sem animação) */
  animations: AnimRule[];
  note: string;
}

export const TILE = 32;
export const MASTER_PALETTE = PALETTE_NAME;

// animação NÍVEL TIBIA: básica de propósito. idle + walk + attack curtos.
const CHAR_ANIMS: AnimRule[] = [
  { name: "idle", minFrames: 1, maxFrames: 2, directions: 4, fps: 2 },
  { name: "walk", minFrames: 3, maxFrames: 4, directions: 4, fps: 8 },
  { name: "attack", minFrames: 2, maxFrames: 3, directions: 4, fps: 10 },
];

const CREATURE_ANIMS: AnimRule[] = [
  { name: "idle", minFrames: 1, maxFrames: 3, directions: 4, fps: 4 },
  { name: "walk", minFrames: 2, maxFrames: 4, directions: 4, fps: 8, optional: true },
  { name: "attack", minFrames: 1, maxFrames: 3, directions: 4, fps: 10, optional: true },
];

export const ART_SPEC: Record<AssetType, TypeSpec> = {
  tile: {
    type: "tile",
    sizes: [{ w: 32, h: 32 }],
    maxColors: 24,
    requireTransparency: false, // tiles preenchem a célula
    anchor: "center",
    animations: [],
    note: "Piso/parede da grade. Deve encaixar sem costura (seamless) com vizinhos.",
  },
  character: {
    type: "character",
    sizes: [{ w: 48, h: 48 }],
    maxColors: 24,
    requireTransparency: true,
    anchor: "bottom-center",
    animations: CHAR_ANIMS,
    note: "Heróis/humanoides. Corpo ~32 de largura com headroom + sombra. 4 direções.",
  },
  creature: {
    type: "creature",
    sizes: [
      { w: 32, h: 32 },
      { w: 48, h: 48 },
      { w: 64, h: 64 },
      { w: 96, h: 96 },
      { w: 128, h: 128 }, // bosses (respeita o cap PRO do Pixellab)
    ],
    maxColors: 24,
    requireTransparency: true,
    anchor: "bottom-center",
    animations: CREATURE_ANIMS,
    note: "Monstros/bosses. Tamanho por classe: 32 pequeno … 128 boss. walk/attack opcionais.",
  },
  prop: {
    type: "prop",
    sizes: [
      { w: 32, h: 32 },
      { w: 48, h: 48 },
      { w: 64, h: 64 },
    ],
    maxColors: 24,
    requireTransparency: true,
    anchor: "bottom-center",
    animations: [],
    note: "Objetos de cena (barril, árvore, baú). Estático.",
  },
  icon: {
    type: "icon",
    sizes: [{ w: 32, h: 32 }],
    maxColors: 16,
    requireTransparency: true,
    anchor: "center",
    animations: [],
    note: "Ícones de item/UI. Paleta mais enxuta pra leitura em tamanho pequeno.",
  },
  effect: {
    type: "effect",
    sizes: [
      { w: 32, h: 32 },
      { w: 48, h: 48 },
      { w: 64, h: 64 },
    ],
    maxColors: 24,
    requireTransparency: true,
    anchor: "center",
    animations: [{ name: "play", minFrames: 2, maxFrames: 8, directions: 1, fps: 12 }],
    note: "Efeitos (slash, fireball, cura, hit). Direção única, tocado uma vez.",
  },
};

export function specFor(type: AssetType): TypeSpec {
  const s = ART_SPEC[type];
  if (!s) throw new Error(`tipo de asset desconhecido: ${type}`);
  return s;
}
