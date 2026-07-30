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
// Tetos subidos em 2026-07-12 pra caber a SÉRIE ÂNCORA (CraftPix swordsman,
// padrão comprovado do knight em produção): idle 12f, walk 6f (Walk_Attack),
// attack 7f. Subimos o PORTÃO, não contornamos — os mínimos continuam baixos
// pra aceitar a arte Pixellab (animate-v3 gera 4f).
const CHAR_ANIMS: AnimRule[] = [
  { name: "idle", minFrames: 1, maxFrames: 12, directions: 4, fps: 2 },
  { name: "walk", minFrames: 3, maxFrames: 8, directions: 4, fps: 8 },
  { name: "attack", minFrames: 2, maxFrames: 10, directions: 4, fps: 10 }, // 10: skeleton attack=9f (swordsman=7f)
  { name: "hurt", minFrames: 1, maxFrames: 6, directions: 4, fps: 8, optional: true },
  { name: "death", minFrames: 1, maxFrames: 8, directions: 4, fps: 10, optional: true },
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
    sizes: [{ w: 64, h: 64 }],
    maxColors: 96,
    requireTransparency: true,
    anchor: "bottom-center",
    animations: CHAR_ANIMS,
    note: "Heróis/humanoides, 64×64 (subido de 48 em 2026-07-11: PRO gera master ~112px e o downscale nearest→64 fica legível; 48 ficava rústico). 4 direções. maxColors 96 (subido de 64 em 2026-07-12 por dado empírico da série âncora CraftPix: knight walk 85c, attack 87c — arte artesanal coesa, sem snap. O teto existe pra pegar arte NÃO-processada de IA com milhares de cores, não pra limitar arte curada; 96 dá folga e ainda pega o caso cru dramaticamente).",
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
    requireTransparency: true,
    anchor: "bottom-center",
    animations: CREATURE_ANIMS,
    maxColors: 64,
    note: "Monstros/bosses. Tamanho por classe: 32 pequeno … 128 boss. walk/attack opcionais. maxColors 64 (nivelado com character em 2026-07-11: o pixflux com highly-detailed-shading gera arte rica que, pós-snap na Resurrect 64, usa até 64 cores — que é o teto natural do snap. O cap pega arte CRUA não-processada, não é orçamento artístico apertado).",
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
    animations: [{ name: "play", minFrames: 2, maxFrames: 24, directions: 1, fps: 12 }],
    note: "Efeitos (slash, fireball, cura, hit). Direção única, tocado uma vez. maxFrames 24 (subido de 8 em 2026-07-11: packs FX externos tipo 'Effect and FX' têm 7–22 frames por animação — FX legitimamente precisa de mais frames que walk de personagem).",
  },
};

export function specFor(type: AssetType): TypeSpec {
  const s = ART_SPEC[type];
  if (!s) throw new Error(`tipo de asset desconhecido: ${type}`);
  return s;
}

/**
 * CONTRATO de direções — ordem das linhas do spritesheet (top→bottom) p/ 4-dir.
 * É um contrato explícito de propósito (foi ambiguidade assim que quebrou o walk
 * do Wraithfall 3×). Toda geração/edição 4-dir DEVE seguir esta ordem.
 */
export const DIRECTION_ORDER = ["south", "north", "east", "west"] as const;
export type Direction = (typeof DIRECTION_ORDER)[number];

/** regras de QUALIDADE de pixel art (limpeza), aplicadas na validação */
export const QUALITY = {
  /** máx proporção de pixels com alpha parcial (borda de AA) antes de reprovar */
  maxPartialAlphaRatio: 0.02,
  /** exige escala de pixel 1:1 (reprova upscale disfarçado) */
  requireUnitPixelScale: true,
  /** tolerância de alpha "cheio/vazio" p/ detectar AA */
  alphaEdgeTolerance: 16,
  /** limiar de binarização de alpha no clean */
  cleanAlphaThreshold: 128,
};

export function anchorPoint(anchor: Anchor): { x: number; y: number } {
  return anchor === "bottom-center" ? { x: 0.5, y: 1 } : { x: 0.5, y: 0.5 };
}
