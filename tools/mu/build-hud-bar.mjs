/**
 * build-hud-bar.mjs — monta a BARRA DE COMANDO do MU a partir dos 3 strips já
 * diagramados pelo cliente, nas coordenadas AUTORITATIVAS de NewUIMainFrameWindow.cpp
 * (ver tools/mu/hud-coords.md): menu01(0,256) + menu02(256,128) + menu03(384,256) = 640.
 * Emite public/ui/mu/hud/hud-bar.png (fundo único da barra) + hud-layout.json (coords
 * dos overlays dinâmicos HP/Mana/SD/AG/EXP/skills), tudo relativo à caixa 640x51.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
const HUD = "C:/Users/Storming/Desktop/GItHubs/Pixel_Idle_game/apps/web/public/ui/mu/hud";

const H = 51; // altura nativa dos strips
const strips = [["bar01.png", 0], ["bar02.png", 256], ["bar03.png", 384]];
const comps = [];
for (const [f, x] of strips) comps.push({ input: await fs.readFile(path.join(HUD, f)), left: x, top: 0 });
await sharp({ create: { width: 640, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(comps).png().toFile(path.join(HUD, "hud-bar.png"));

// coords (rel. à caixa 640x51) — de NewUIMainFrameWindow.cpp
const layout = {
  boxW: 640, boxH: H,
  hpGem: { x: 158, y: 6, w: 45, h: 39 },
  manaGem: { x: 437, y: 6, w: 45, h: 39 },
  sd: { x: 204, y: 6, w: 16, h: 39 },
  ag: { x: 420, y: 6, w: 16, h: 39 },
  exp: { x: 221, y: 45, w: 198, h: 4 },
  // slots de skill: teclas Q/W/E/R em x=188,217,246,275 (passo 29), + 2/3/4/5 no menu2
  skillSlots: [188, 217, 246, 275].map((x, i) => ({ key: ["Q", "W", "E", "R"][i], x, y: 12, w: 26, h: 26 })),
};
await fs.writeFile(path.join(HUD, "hud-layout.json"), JSON.stringify(layout, null, 2));
const m = await sharp(path.join(HUD, "hud-bar.png")).metadata();
console.log(`✅ hud-bar.png ${m.width}x${m.height} + hud-layout.json`);
