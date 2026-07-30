/**
 * export-pixi-sheets.mjs — PONTE: converte os atores MU renderizados (cache do explorer,
 * frames base64 idle/walk/attack × 4 direções) em SPRITESHEETS no formato da Forja/Pixi
 * (frames "state.facing.i" + animations{south,north,east,west} + meta.fps), gravando em
 * apps/web/public/sprites/. Assim o HuntScene REAL (PixiJS) passa a renderizar nossa arte
 * MU sem tocar no motor. DK→knight; monstros→slugs de criatura (regions.json).
 *   node tools/mu/export-pixi-sheets.mjs
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ACTORS = "C:/Users/Storming/AppData/Local/Temp/claude/C--WINDOWS-system32/8c5a039d-e634-4c05-a098-1e4a6f77af74/scratchpad/lorencia-explorer.html.actors.json";
const OUT = "C:/Users/Storming/Desktop/GItHubs/Pixel_Idle_game/apps/web/public/sprites";

const FACINGS = ["south", "north", "east", "west"]; // ordem de saída (Pixi)
const CACHE_DIR_ORDER = ["south", "west", "north", "east"]; // ordem no cache MU (d=0..3)
const FPS = { idle: 6, walk: 10, attack: 12 };
// ator MU → id no jogo (DK = vocação knight; monstros = slug do nome em regions.json)
const MAP = {
  dk: "knight", spider: "spider", budge: "budge-dragon", bull: "bull-fighter",
  hound: "hound", lich: "lich", giant: "giant", skeleton: "skeleton-warrior",
};

const cache = JSON.parse(await fs.readFile(ACTORS, "utf8"));
await fs.mkdir(OUT, { recursive: true });

// Frames do cache JÁ vêm feet-anchored no canvas nativo (actor.w × actor.h) da renderActor.
// Empacotamos NATIVO — sem resize (o downscale limpo já foi feito no reforge com lanczos3).
// Célula = actor.w × actor.h; o engine só faz UPSCALE nearest (chunky/nítido) via world scale.
async function exportState(id, actor, state) {
  const dirs = actor.anims[state]; if (!dirs) return false;
  const nF = Math.max(...dirs.map((fr) => fr.length));
  if (!nF) return false;
  const CW = actor.w, CH = actor.h;
  const W = nF * CW, H = FACINGS.length * CH;
  const comps = [], frames = {}, animations = {};
  for (let fi = 0; fi < FACINGS.length; fi++) {
    const srcDir = CACHE_DIR_ORDER.indexOf(FACINGS[fi]);
    const fr = dirs[srcDir] || dirs[0];
    animations[FACINGS[fi]] = [];
    for (let i = 0; i < nF; i++) {
      const uri = fr[Math.min(i, fr.length - 1)];
      const buf = Buffer.from(uri.split(",")[1], "base64");
      comps.push({ input: buf, left: i * CW, top: fi * CH });
      const name = `${state}.${FACINGS[fi]}.${i}`;
      frames[name] = { frame: { x: i * CW, y: fi * CH, w: CW, h: CH }, sourceSize: { w: CW, h: CH }, spriteSourceSize: { x: 0, y: 0, w: CW, h: CH }, anchor: { x: 0.5, y: 1 } };
      animations[FACINGS[fi]].push(name);
    }
  }
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comps).png().toFile(path.join(OUT, `${id}.${state}.png`));
  const json = { frames, animations, meta: { image: `${id}.${state}.png`, format: "RGBA8888", size: { w: W, h: H }, scale: 1, fps: FPS[state] } };
  await fs.writeFile(path.join(OUT, `${id}.${state}.json`), JSON.stringify(json, null, 2));
  return true;
}

for (const [actorKey, id] of Object.entries(MAP)) {
  const actor = cache[actorKey]; if (!actor) { console.warn(`  ⚠ ator ausente no cache: ${actorKey}`); continue; }
  const states = [];
  for (const st of ["idle", "walk", "attack"]) if (await exportState(id, actor, st)) states.push(st);
  console.log(`  ✓ ${id.padEnd(20)} ← ${actorKey}  [${states.join(", ")}]`);
}
console.log(`✅ spritesheets exportados → public/sprites/`);
