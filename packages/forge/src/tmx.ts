/**
 * TMX (Tiled) → scene.json: importa mapas COMPOSTOS PELO ARTISTA dos packs
 * (assets/_packs/…/Tiled_files/…tmx) e exporta no formato que o jogo consome.
 *
 * Suporta o que os TMX reais dos packs usam (verificado nos arquivos):
 *  - orthogonal, 16px, infinite (chunks) e finito
 *  - <data encoding="csv"> (único encoding presente nos packs)
 *  - tilesets embutidos e externos (.tsx), PNGs co-localizados
 *  - flip flags nos 3 bits altos do GID (H=0x80000000 V=0x40000000 D=0x20000000)
 *
 * Saída: <outDir>/scene.json + cópia dos PNGs de tileset usados.
 * Tiles animados do Tiled são exportados estáticos (frame 0) — animação fica
 * como evolução futura (o TMX traz <animation> por tile).
 */

import path from "node:path";
import { promises as fs } from "node:fs";
import { DOMParser } from "@xmldom/xmldom";

export const FLIP_H = 0x80000000;
export const FLIP_V = 0x40000000;
export const FLIP_D = 0x20000000;
export const GID_MASK = 0x1fffffff;

export interface SceneTileset {
  firstgid: number;
  name: string;
  image: string; // nome do arquivo copiado pro outDir
  columns: number;
  tilecount: number;
  tileW: number;
  tileH: number;
}

export interface SceneLayer {
  name: string;
  /** trincas achatadas [x, y, rawGid, ...] — rawGid ainda carrega os flip bits */
  tiles: number[];
}

export interface SceneDoc {
  name: string;
  tileW: number;
  tileH: number;
  width: number; // em tiles (após crop/normalização)
  height: number;
  tilesets: SceneTileset[];
  layers: SceneLayer[]; // ordem do arquivo = ordem de render (baixo → cima)
}

interface RawTile {
  x: number;
  y: number;
  raw: number; // uint32 com flags
}

// @xmldom retorna "" (não null) pra atributo ausente — normalizamos os dois casos
function attr(n: Element, k: string, d?: string): string | undefined {
  const v = n.getAttribute(k);
  return v === null || v === "" ? d : v;
}
const iattr = (n: Element, k: string, d = 0) => parseInt(attr(n, k, String(d))!, 10);

function children(node: Element, tag: string): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < node.childNodes.length; i++) {
    const c = node.childNodes[i] as Element;
    if (c.nodeType === 1 && c.nodeName === tag) out.push(c);
  }
  return out;
}

async function parseXmlFile(file: string): Promise<Element> {
  const text = await fs.readFile(file, "utf8");
  return new DOMParser().parseFromString(text, "text/xml").documentElement as unknown as Element;
}

export interface ParsedTmx {
  tileW: number;
  tileH: number;
  tilesets: (SceneTileset & { imagePath: string })[];
  layers: { name: string; tiles: RawTile[] }[];
  /** bounds em coords de tile do Tiled (mapas infinite têm coords negativas) */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export async function parseTmx(tmxPath: string): Promise<ParsedTmx> {
  const map = await parseXmlFile(tmxPath);
  const orientation = attr(map, "orientation");
  if (orientation !== "orthogonal") throw new Error(`só orthogonal é suportado (mapa é ${orientation})`);
  const tileW = iattr(map, "tilewidth");
  const tileH = iattr(map, "tileheight");
  const tmxDir = path.dirname(path.resolve(tmxPath));

  // tilesets (embutidos ou .tsx externos)
  const tilesets: ParsedTmx["tilesets"] = [];
  for (const ts of children(map, "tileset")) {
    const firstgid = iattr(ts, "firstgid");
    let node = ts;
    let baseDir = tmxDir;
    const src = attr(ts, "source");
    if (src) {
      const tsxPath = path.resolve(tmxDir, src);
      node = await parseXmlFile(tsxPath);
      baseDir = path.dirname(tsxPath);
    }
    const img = children(node, "image")[0];
    if (!img) continue; // tileset sem imagem (coleção de imagens) — não usado nos packs
    tilesets.push({
      firstgid,
      name: attr(node, "name") ?? `ts${firstgid}`,
      image: "", // preenchido no export
      columns: iattr(node, "columns"),
      tilecount: iattr(node, "tilecount"),
      tileW: iattr(node, "tilewidth", tileW),
      tileH: iattr(node, "tileheight", tileH),
      imagePath: path.resolve(baseDir, attr(img, "source")!),
    });
  }
  tilesets.sort((a, b) => a.firstgid - b.firstgid);

  // layers → tiles com coords absolutas (chunks de mapas infinite têm offset próprio)
  const layers: ParsedTmx["layers"] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const layer of children(map, "layer")) {
    if (attr(layer, "visible") === "0") continue;
    const data = children(layer, "data")[0];
    if (!data) continue;
    const enc = attr(data, "encoding");
    if (enc !== "csv") throw new Error(`encoding "${enc}" não suportado (só csv — é o que os packs usam)`);
    const tiles: RawTile[] = [];
    const readCsv = (text: string, ox: number, oy: number, w: number) => {
      const vals = text.trim().split(",");
      for (let i = 0; i < vals.length; i++) {
        const raw = Number(vals[i].trim()) >>> 0;
        if (raw === 0) continue;
        const x = ox + (i % w);
        const y = oy + Math.floor(i / w);
        tiles.push({ x, y, raw });
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    };
    const chunks = children(data, "chunk");
    if (chunks.length) {
      for (const ch of chunks) readCsv(ch.textContent ?? "", iattr(ch, "x"), iattr(ch, "y"), iattr(ch, "width"));
    } else {
      readCsv(data.textContent ?? "", 0, 0, iattr(layer, "width"));
    }
    if (tiles.length) layers.push({ name: attr(layer, "name") ?? "layer", tiles });
  }
  if (!layers.length) throw new Error("nenhuma layer com tiles");
  return { tileW, tileH, tilesets, layers, minX, minY, maxX, maxY };
}

export interface ExportOptions {
  name: string;
  outDir: string;
  /** recorte em coords NORMALIZADAS (0,0 = canto superior-esquerdo do conteúdo) */
  crop?: { x: number; y: number; w: number; h: number };
}

/** Exporta scene.json + PNGs de tileset usados. Retorna o doc + avisos. */
export async function exportScene(tmxPath: string, opts: ExportOptions): Promise<{ doc: SceneDoc; warnings: string[] }> {
  const parsed = await parseTmx(tmxPath);
  const warnings: string[] = [];
  const crop = opts.crop ?? {
    x: 0,
    y: 0,
    w: parsed.maxX - parsed.minX + 1,
    h: parsed.maxY - parsed.minY + 1,
  };

  // filtra/normaliza placements pro recorte e coleta os tilesets realmente usados
  const usedFirstgids = new Set<number>();
  const tsFor = (gid: number) => {
    for (let i = parsed.tilesets.length - 1; i >= 0; i--) {
      if (gid >= parsed.tilesets[i].firstgid) return parsed.tilesets[i];
    }
    return undefined;
  };
  const layers: SceneLayer[] = [];
  for (const l of parsed.layers) {
    const flat: number[] = [];
    for (const t of l.tiles) {
      const nx = t.x - parsed.minX - crop.x;
      const ny = t.y - parsed.minY - crop.y;
      if (nx < 0 || ny < 0 || nx >= crop.w || ny >= crop.h) continue;
      const ts = tsFor(t.raw & GID_MASK);
      if (!ts) {
        warnings.push(`gid ${t.raw & GID_MASK} sem tileset (layer ${l.name})`);
        continue;
      }
      usedFirstgids.add(ts.firstgid);
      flat.push(nx, ny, t.raw);
    }
    if (flat.length) layers.push({ name: l.name, tiles: flat });
  }

  // copia só os PNGs usados; falha de PNG ausente vira aviso + tiles ficam de fora
  await fs.mkdir(opts.outDir, { recursive: true });
  const tilesets: SceneTileset[] = [];
  const nameToPath = new Map<string, string>(); // basename → origem (detecta colisão)
  for (const ts of parsed.tilesets) {
    if (!usedFirstgids.has(ts.firstgid)) continue;
    let image = path.basename(ts.imagePath);
    const claimed = nameToPath.get(image);
    if (claimed && claimed !== ts.imagePath) image = `${ts.firstgid}-${image}`; // mesmo nome, arquivo diferente
    else nameToPath.set(image, ts.imagePath);
    try {
      await fs.copyFile(ts.imagePath, path.join(opts.outDir, image));
    } catch {
      warnings.push(`PNG de tileset ausente no disco: ${ts.imagePath} — tiles dele não vão renderizar`);
    }
    const { imagePath: _drop, ...rest } = ts;
    tilesets.push({ ...rest, image });
  }

  const doc: SceneDoc = {
    name: opts.name,
    tileW: parsed.tileW,
    tileH: parsed.tileH,
    width: crop.w,
    height: crop.h,
    tilesets,
    layers,
  };
  await fs.writeFile(path.join(opts.outDir, "scene.json"), JSON.stringify(doc));
  return { doc, warnings };
}
