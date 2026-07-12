/**
 * O REGISTRO — assets/manifest.json. É o PORTÃO: o jogo só carrega o que está
 * aqui. Asset fora do manifesto não existe pro jogo. Cada ingest valida →
 * normaliza → registra.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PALETTE_NAME } from "./palette";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, "../../..");
export const ASSETS_DIR = path.join(REPO_ROOT, "assets");
export const SPRITES_DIR = path.join(ASSETS_DIR, "sprites");
export const MANIFEST_PATH = path.join(ASSETS_DIR, "manifest.json");

export interface AssetEntry {
  id: string;
  type: string;
  anim?: string;
  path: string; // PNG, relativo a assets/
  sheet?: string; // spritesheet JSON Pixi, relativo a assets/
  width: number;
  height: number;
  frameW?: number;
  frameH?: number;
  frames?: number;
  directions?: number;
  fps?: number;
  anchor?: { x: number; y: number };
  colors: number;
  pixelScale: number;
  partialAlpha: number;
  source?: string;
  validatedAt: string;
}

export interface Manifest {
  version: number;
  palette: string;
  assets: AssetEntry[];
}

export async function readManifest(): Promise<Manifest> {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, "utf8");
    return JSON.parse(raw) as Manifest;
  } catch {
    return { version: 1, palette: PALETTE_NAME, assets: [] };
  }
}

export async function writeManifest(m: Manifest): Promise<void> {
  await fs.mkdir(ASSETS_DIR, { recursive: true });
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(m, null, 2) + "\n", "utf8");
}

/** upsert por (id, anim) — um personagem tem 1 id com várias animações
 *  (idle/walk/attack) que coexistem; a animação faz parte da chave. */
export async function register(entry: AssetEntry): Promise<Manifest> {
  const m = await readManifest();
  m.assets = m.assets.filter((a) => !(a.id === entry.id && a.anim === entry.anim));
  m.assets.push(entry);
  m.assets.sort((a, b) => a.id.localeCompare(b.id) || (a.anim ?? "").localeCompare(b.anim ?? ""));
  await writeManifest(m);
  return m;
}
