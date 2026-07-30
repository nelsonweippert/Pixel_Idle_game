/**
 * TiledMap — desenha uma cena exportada do Tiled (`forge tmx-export`) em PixiJS.
 * A cena é o mapa COMPOSTO PELO ARTISTA: layers na ordem certa, flips aplicados.
 * scene.json + PNGs de tileset vivem juntos em /tilesets/<nome>/.
 */

import { Assets, Container, Rectangle, Sprite, Texture } from "pixi.js";

const FLIP_H = 0x80000000;
const FLIP_V = 0x40000000;
const FLIP_D = 0x20000000;
const GID_MASK = 0x1fffffff;

interface SceneTileset {
  firstgid: number;
  image: string;
  columns: number;
  tilecount: number;
  tileW: number;
  tileH: number;
}

interface SceneDoc {
  name: string;
  tileW: number;
  tileH: number;
  width: number;
  height: number;
  tilesets: SceneTileset[];
  layers: { name: string; tiles: number[] }[]; // trincas [x,y,rawGid,...]
  /** área de batalha (em TILES da cena): retângulo de chão onde as entidades lutam.
   *  `floorGid` = tile de piso limpo pra forrar essa área (garante arena aberta). */
  battle?: { x: number; y: number; w: number; h: number; floorGid?: number };
  /** cena BAKADA: PNG único já composto (chão+props), ex. clareira wang de bioma
   *  (tools/compose-biome-clearing.mts). Quando presente, carrega 1 sprite e ignora
   *  layers/tilesets. `pxW`/`pxH` = tamanho nativo do PNG. */
  baked?: string;
  pxW?: number;
  pxH?: number;
  /** backdrop FOTOGRÁFICO (não pixel-art): usa filtro linear (liso) em vez de nearest. */
  smooth?: boolean;
}

export interface TiledScene {
  container: Container;
  /** tamanho em px nativos (width*tileW × height*tileH) */
  pxW: number;
  pxH: number;
  doc: SceneDoc;
}

// ── formato do MAP EDITOR (Montador Tiled) — map.json editável+renderável ─────────
interface MapDoc {
  format: "mapkit";
  name: string;
  tileW: number;
  tileH: number;
  width: number;
  height: number;
  /** camada de terreno WANG: png do atlas 64×64 + tiles(cantos→bbox) + grade de cantos
   *  (height+1)×(width+1) de 0=lower/1=upper. Auto-fundido igual ao composer. */
  wang: { pack: string; png: string; tiles: { key: string; x: number; y: number; w: number; h: number }[]; corners: number[][]; erased?: number[][] } | null;
  /** tiles individuais estampados: recorte (src+sub-rect) numa posição (px, canto sup-esq).
   *  Camada acima do piso wang e abaixo dos props. */
  tiles?: { src: string; sx: number; sy: number; sw: number; sh: number; x: number; y: number }[];
  /** props posicionados (px, âncora no pé) — renderizados com y-sort */
  objects: { path: string; x: number; y: number; scale: number }[];
  battle: { x: number; y: number; w: number; h: number };
}

const terra = (n: number) => (n ? "upper" : "lower");

/** renderiza um map.json do editor em PixiJS: wang floor + objects y-sorted + battle. */
async function renderMapkit(doc: MapDoc): Promise<TiledScene> {
  const T = doc.tileW;
  const container = new Container();

  // 1) piso WANG — resolve cada célula pelos 4 cantos e recorta o tile do atlas
  if (doc.wang && doc.wang.corners.length) {
    const tex = await Assets.load(doc.wang.png);
    tex.source.scaleMode = "nearest";
    const lut = new Map(doc.wang.tiles.map((t) => [t.key, t]));
    const floor = new Container();
    const cg = doc.wang.corners;
    const er = doc.wang.erased;
    for (let r = 0; r < doc.height; r++) {
      for (let c = 0; c < doc.width; c++) {
        if (er?.[r]?.[c]) continue; // célula apagada pela borracha (buraco)
        const NW = cg[r]?.[c] ?? 0, NE = cg[r]?.[c + 1] ?? 0, SW = cg[r + 1]?.[c] ?? 0, SE = cg[r + 1]?.[c + 1] ?? 0;
        const bb = lut.get(`${terra(NE)}_${terra(NW)}_${terra(SE)}_${terra(SW)}`);
        if (!bb) continue;
        const s = new Sprite(new Texture({ source: tex.source, frame: new Rectangle(bb.x, bb.y, bb.w, bb.h) }));
        s.position.set(c * T, r * T);
        floor.addChild(s);
      }
    }
    container.addChild(floor);
  }

  // 1b) tiles individuais estampados (sobre o piso wang, sob os props) — recorte src+sub-rect
  const placed = doc.tiles ?? [];
  if (placed.length) {
    const srcs = [...new Set(placed.map((t) => t.src))];
    const texBySrc = new Map<string, Texture>();
    await Promise.all(srcs.map(async (src) => {
      const tex = await Assets.load(src);
      tex.source.scaleMode = "nearest";
      texBySrc.set(src, tex);
    }));
    const tileLayer = new Container();
    for (const t of placed) {
      const base = texBySrc.get(t.src);
      if (!base) continue;
      const s = new Sprite(new Texture({ source: base.source, frame: new Rectangle(t.sx, t.sy, t.sw, t.sh) }));
      s.position.set(t.x, t.y);
      tileLayer.addChild(s);
    }
    container.addChild(tileLayer);
  }

  // 2) objects (props) — âncora no pé, y-sort (pé mais embaixo = na frente)
  const objLayer = new Container();
  objLayer.sortableChildren = true;
  await Promise.all(
    doc.objects.map(async (o) => {
      const tex = await Assets.load(o.path);
      tex.source.scaleMode = "nearest";
      const s = new Sprite(tex);
      s.anchor.set(0.5, 1);
      s.scale.set(o.scale ?? 1);
      s.position.set(o.x, o.y);
      s.zIndex = o.y;
      objLayer.addChild(s);
    }),
  );
  container.addChild(objLayer);

  // doc compatível com o drawFloor do HuntScene (lê battle + tileW/tileH)
  const outDoc = { name: doc.name, tileW: T, tileH: T, width: doc.width, height: doc.height, tilesets: [], layers: [], battle: doc.battle } as unknown as SceneDoc;
  return { container, pxW: doc.width * T, pxH: doc.height * T, doc: outDoc };
}

/** carrega scene.json + tilesets e monta o Container com todas as layers. */
export async function loadTiledScene(url: string): Promise<TiledScene> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`scene.json não encontrado: ${url}`);
  const raw = await res.json();
  // MAPA DO EDITOR (Montador Tiled): formato próprio, renderiza wang+objects+battle.
  if (raw && raw.format === "mapkit") return renderMapkit(raw as MapDoc);
  const doc: SceneDoc = raw;
  const baseUrl = url.slice(0, url.lastIndexOf("/") + 1);

  // CENA BAKADA: PNG único (clareira de bioma) → carrega 1 sprite e retorna cedo.
  // O drawFloor do HuntScene escala isso pra cobrir o mundo e lê doc.battle igual ao TMX.
  if (doc.baked) {
    const tex = await Assets.load(baseUrl + doc.baked);
    // backdrop fotográfico → linear (liso); pixel-art → nearest (chunky)
    tex.source.scaleMode = doc.smooth ? "linear" : "nearest";
    const container = new Container();
    container.addChild(new Sprite(tex));
    const pxW = doc.pxW ?? tex.width;
    const pxH = doc.pxH ?? tex.height;
    return { container, pxW, pxH, doc };
  }

  // um atlas por tileset (tilesets duplicados podem apontar pro mesmo PNG — Assets deduplica)
  const atlases = new Map<number, Texture>();
  await Promise.all(
    doc.tilesets.map(async (ts) => {
      const tex = await Assets.load(baseUrl + ts.image);
      tex.source.scaleMode = "nearest";
      atlases.set(ts.firstgid, tex);
    }),
  );

  // resolve gid → tileset (maior firstgid ≤ gid)
  const sorted = [...doc.tilesets].sort((a, b) => a.firstgid - b.firstgid);
  const tsFor = (gid: number): SceneTileset | undefined => {
    for (let i = sorted.length - 1; i >= 0; i--) if (gid >= sorted[i].firstgid) return sorted[i];
    return undefined;
  };

  // cache de sub-texturas por gid
  const texCache = new Map<number, Texture>();
  const texFor = (gid: number): Texture | undefined => {
    const hit = texCache.get(gid);
    if (hit) return hit;
    const ts = tsFor(gid);
    if (!ts) return undefined;
    const local = gid - ts.firstgid;
    if (local >= ts.tilecount) return undefined;
    const atlas = atlases.get(ts.firstgid);
    if (!atlas) return undefined;
    const t = new Texture({
      source: atlas.source,
      frame: new Rectangle((local % ts.columns) * ts.tileW, Math.floor(local / ts.columns) * ts.tileH, ts.tileW, ts.tileH),
    });
    texCache.set(gid, t);
    return t;
  };

  const container = new Container();
  for (const layer of doc.layers) {
    const lc = new Container();
    const arr = layer.tiles;
    for (let i = 0; i < arr.length; i += 3) {
      const x = arr[i];
      const y = arr[i + 1];
      const raw = arr[i + 2] >>> 0;
      const gid = raw & GID_MASK;
      const tex = texFor(gid);
      if (!tex) continue;
      const s = new Sprite(tex);
      // flips do Tiled: âncora no centro + rotação/escala equivalem aos 3 bits
      // (derivação: transform do sprite = H·V·D; com D, θ=90° e scale=(±1,±1))
      s.anchor.set(0.5);
      s.position.set(x * doc.tileW + doc.tileW / 2, y * doc.tileH + doc.tileH / 2);
      const fh = !!(raw & FLIP_H);
      const fv = !!(raw & FLIP_V);
      if (raw & FLIP_D) {
        s.rotation = Math.PI / 2;
        s.scale.set(fv ? -1 : 1, fh ? 1 : -1);
      } else if (fh || fv) {
        s.scale.set(fh ? -1 : 1, fv ? -1 : 1);
      }
      lc.addChild(s);
    }
    container.addChild(lc);
  }

  // ARENA: forra a área de batalha com um piso limpo (sobre a decoração) — garante
  // um chão aberto pro combate, com a cena do artista de moldura em volta.
  const gid = doc.battle?.floorGid;
  if (doc.battle && gid) {
    const b = doc.battle;
    const tex = texFor(gid & GID_MASK);
    if (tex) {
      const lc = new Container();
      for (let ty = b.y; ty < b.y + b.h; ty++) {
        for (let tx = b.x; tx < b.x + b.w; tx++) {
          const s = new Sprite(tex);
          s.position.set(tx * doc.tileW, ty * doc.tileH);
          lc.addChild(s);
        }
      }
      container.addChild(lc);
    }
  }

  return { container, pxW: doc.width * doc.tileW, pxH: doc.height * doc.tileH, doc };
}
