/**
 * O MUNDO — escada de biomas (Região → Cidade-hub + hunt maps gated por nível).
 *
 * Profundidade vem do CONTEÚDO (mapas/criaturas/cidades), não do enredo.
 * A Região 1 está fleshed-out o bastante pra cena renderizar; as demais são o
 * esqueleto da escada de progressão, prontas pra encher com criaturas/hunts.
 */

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

export const REGIONS: RegionDef[] = [
  {
    id: "greenfields",
    index: 1,
    name: "Campos de Rivenwatch",
    biome: "Campos / vilarejo",
    city: "Rivenwatch",
    levelRange: [1, 20],
    palette: { bg: 0x2f3a24, floorA: 0x3f5130, floorB: 0x475a37, accent: 0x6b7a4a },
    creatures: [
      { id: 101, name: "Cave Rat", level: 2, hp: 60, attack: 8, xp: 12, color: 0x8a7d6b },
      { id: 102, name: "Grey Wolf", level: 6, hp: 140, attack: 18, xp: 34, color: 0x9aa0a6 },
      { id: 103, name: "Bandit", level: 10, hp: 220, attack: 26, xp: 60, color: 0xb05a4a },
      { id: 104, name: "Giant Spider", level: 15, hp: 340, attack: 34, xp: 95, color: 0x5c4a6b },
    ],
    boss: { id: 199, name: "Bandit Warlord", level: 20, hp: 1400, attack: 55, xp: 600, color: 0xd14b3a },
  },
  {
    id: "duskwood",
    index: 2,
    name: "Floresta de Duskwood",
    biome: "Floresta densa",
    city: "Thornhollow",
    levelRange: [20, 40],
    palette: { bg: 0x1f2a1c, floorA: 0x2c3a24, floorB: 0x334228, accent: 0x4a5a34 },
    creatures: [
      { id: 201, name: "Goblin Scout", level: 24, hp: 480, attack: 44, xp: 150, color: 0x6f9f57 },
      { id: 202, name: "Forest Treant", level: 32, hp: 900, attack: 58, xp: 280, color: 0x5a7a3a },
      { id: 203, name: "Venom Spider", level: 38, hp: 700, attack: 72, xp: 340, color: 0x7a4a8a },
    ],
    boss: { id: 299, name: "Elder Treant", level: 40, hp: 3200, attack: 90, xp: 1500, color: 0x3f6b2a },
  },
  {
    id: "mirelands",
    index: 3,
    name: "Pântano de Mireland",
    biome: "Pântano",
    city: "Sedgemoor",
    levelRange: [40, 70],
    palette: { bg: 0x1c2620, floorA: 0x28352b, floorB: 0x2f3d31, accent: 0x46583f },
    creatures: [
      { id: 301, name: "Bog Slime", level: 46, hp: 1200, attack: 80, xp: 460, color: 0x6a9a5a },
      { id: 302, name: "Marsh Serpent", level: 55, hp: 1600, attack: 105, xp: 620, color: 0x4a7a6a },
      { id: 303, name: "Swamp Witch", level: 66, hp: 2100, attack: 140, xp: 880, color: 0x8a5a9a },
    ],
    boss: { id: 399, name: "The Bog Hag", level: 70, hp: 7000, attack: 180, xp: 3400, color: 0x5a8a4a },
  },
  {
    id: "sunscar",
    index: 4,
    name: "Deserto de Sunscar",
    biome: "Deserto / ruínas",
    city: "Karsh",
    levelRange: [70, 110],
    palette: { bg: 0x3a2f1c, floorA: 0x5a4a2c, floorB: 0x6a5836, accent: 0x8a7346 },
    creatures: [
      { id: 401, name: "Scarab Swarm", level: 76, hp: 2600, attack: 165, xp: 1100, color: 0x8a7a3a },
      { id: 402, name: "Tomb Mummy", level: 90, hp: 3800, attack: 210, xp: 1600, color: 0xb0a070 },
      { id: 403, name: "Tomb Guardian", level: 105, hp: 5200, attack: 270, xp: 2300, color: 0xc7a24a },
    ],
    boss: { id: 499, name: "Pharaoh Undying", level: 110, hp: 16000, attack: 340, xp: 8000, color: 0xd4af37 },
  },
  {
    id: "frostpeak",
    index: 5,
    name: "Montanhas de Frostpeak",
    biome: "Montanhas geladas",
    city: "Holdenfrost",
    levelRange: [110, 160],
    palette: { bg: 0x22303a, floorA: 0x3a4e5c, floorB: 0x45596a, accent: 0x6a8296 },
    creatures: [
      { id: 501, name: "Frost Wolf", level: 118, hp: 6000, attack: 320, xp: 3000, color: 0xa8c4d6 },
      { id: 502, name: "Ice Elemental", level: 140, hp: 8500, attack: 420, xp: 4400, color: 0x7ab6d6 },
      { id: 503, name: "Yeti", level: 158, hp: 11000, attack: 520, xp: 6000, color: 0xd6e2ea },
    ],
    boss: { id: 599, name: "Jarl of the Deep Ice", level: 160, hp: 34000, attack: 640, xp: 18000, color: 0x9fd0e6 },
  },
  {
    id: "emberfall",
    index: 6,
    name: "Terras de Emberfall",
    biome: "Terras vulcânicas",
    city: "Cinderhold",
    levelRange: [160, 220],
    palette: { bg: 0x30181a, floorA: 0x4a2224, floorB: 0x5a2a26, accent: 0x8a3a2a },
    creatures: [
      { id: 601, name: "Hellhound", level: 170, hp: 14000, attack: 640, xp: 8000, color: 0xd15a2a },
      { id: 602, name: "Fire Elemental", level: 195, hp: 19000, attack: 800, xp: 11000, color: 0xe07a2a },
      { id: 603, name: "Lesser Demon", level: 218, hp: 26000, attack: 980, xp: 15000, color: 0xb0402a },
    ],
    boss: { id: 699, name: "Balgor the Infernal", level: 220, hp: 90000, attack: 1300, xp: 46000, color: 0xff5a2a },
  },
  {
    id: "abyss",
    index: 7,
    name: "Criptas do Abismo",
    biome: "Criptas / abismo",
    city: "Nethergate",
    levelRange: [220, 999],
    palette: { bg: 0x18141f, floorA: 0x241d30, floorB: 0x2b2338, accent: 0x4a3a6a },
    creatures: [
      { id: 701, name: "Wraith", level: 230, hp: 34000, attack: 1200, xp: 20000, color: 0x8a6ad5 },
      { id: 702, name: "Bone Lich", level: 260, hp: 52000, attack: 1600, xp: 30000, color: 0xc7b0e0 },
      { id: 703, name: "Ancient Dragon", level: 300, hp: 120000, attack: 2400, xp: 60000, color: 0x9a3a6a },
    ],
    boss: { id: 799, name: "The Abyssal Sovereign", level: 350, hp: 500000, attack: 4000, xp: 250000, color: 0xd14bd1 },
  },
];

export const REGION_BY_ID: Record<string, RegionDef> = Object.fromEntries(
  REGIONS.map((r) => [r.id, r]),
);

export function regionForLevel(level: number): RegionDef {
  return (
    [...REGIONS].reverse().find((r) => level >= r.levelRange[0]) ?? REGIONS[0]
  );
}
