/**
 * extract-hud-assets.mjs — extrai as texturas REAIS do HUD principal do MU (Data/Interface)
 * pra public/ui/mu/hud/. É com estas que a barra de vida/mana/skills é reconstruída (fiel
 * ao cliente), no lugar dos globos desenhados em CSS.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { decodeToPngBuffer } from "./mu-textures.mjs";
const IF = "C:/Users/Storming/Desktop/GItHubs/MU-Webzen/Data/Interface";
const OUT = "C:/Users/Storming/Desktop/GItHubs/Pixel_Idle_game/apps/web/public/ui/mu/hud";
const MAP = {
  "hp-orb": "newui_menu_red.OZJ",       // orbe HP (líquido vermelho)
  "mana-orb": "newui_menu_blue.OZJ",    // orbe Mana (líquido azul)
  "sd-gauge": "newui_menu_SD.OZJ",      // medidor SD (escudo) vertical
  "ag-gauge": "newui_menu_AG.OZJ",      // medidor AG (stamina) vertical
  "exbar": "newui_Exbar.OZJ",           // preenchimento da barra de exp
  "skillframe": "newui_ctskillframe.OZT", // moldura ornamentada (2 slots)
  "skill-atlas": "newui_skill.OZJ",     // atlas de ícones de skill (grid)
  "skill-atlas2": "newui_skill2.OZJ",   // atlas de ícones (denso)
  "command": "newui_command.OZJ",       // ícones de comando (skills)
  "ornament": "in_main.OZT",            // ornamento dragão-metal (ponta da barra)
  "bar01": "newui_menu01.OZJ",          // strip 1 da barra (slots QWER + socket)
  "bar02": "newui_menu02.OZJ",          // strip 2 (slots 2345)
  "bar03": "newui_menu03.OZJ",          // strip 3 (socket + slots)
};
await fs.mkdir(OUT, { recursive: true });
for (const [name, file] of Object.entries(MAP)) {
  try {
    const png = await decodeToPngBuffer(file, await fs.readFile(path.join(IF, file)));
    await fs.writeFile(path.join(OUT, `${name}.png`), png);
    console.log(`  ✓ ${name}.png ← ${file}`);
  } catch (e) { console.log(`  ✖ ${name} (${file}): ${e.message}`); }
}
console.log(`✅ HUD → ${OUT}`);
