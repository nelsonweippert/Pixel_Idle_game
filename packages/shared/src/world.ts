/**
 * O MUNDO — escada de biomas (Região → Cidade-hub + hunt maps gated por nível).
 *
 * Os DADOS vivem em ../content/regions.json (fonte canônica — balancear sem tocar
 * código). Aqui ficam só os TIPOS e os helpers. Profundidade vem do conteúdo.
 */
import regionsJson from "../content/regions.json";

export interface CreatureDef {
  id: number;
  name: string;
  level: number;
  hp: number;
  attack: number;
  /** xp concedido ao matar */
  xp: number;
  /** cor do placeholder no Pixi (0xRRGGBB) */
  color: number;
}

export interface RegionPalette {
  /** cor de fundo da cena */
  bg: number;
  /** duas cores de piso pro padrão xadrez de tiles */
  floorA: number;
  floorB: number;
  /** cor de detalhe/parede */
  accent: number;
}

export interface RegionDef {
  id: string;
  index: number;
  name: string;
  biome: string;
  /** cidade-hub da região */
  city: string;
  levelRange: [number, number];
  palette: RegionPalette;
  creatures: CreatureDef[];
  boss?: CreatureDef;
}

export const REGIONS: RegionDef[] = regionsJson as unknown as RegionDef[];

export const REGION_BY_ID: Record<string, RegionDef> = Object.fromEntries(
  REGIONS.map((r) => [r.id, r]),
);

export function regionForLevel(level: number): RegionDef {
  return (
    [...REGIONS].reverse().find((r) => level >= r.levelRange[0]) ?? REGIONS[0]
  );
}
