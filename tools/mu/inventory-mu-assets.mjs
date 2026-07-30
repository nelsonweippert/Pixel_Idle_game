/**
 * inventory-mu-assets.mjs — INVENTÁRIO COMPLETO dos assets do cliente MU-Webzen.
 * Varre Data/ inteiro e emite docs/mu-assets-inventory.md: cada categoria com contagem,
 * formatos, amostras e O QUE ELA OFERECE pro Loots & Glory (revisão de assets pedida
 * pelo Nelson em 2026-07-13). É o mapa-mestre pra puxar elementos do MU pro projeto.
 *
 * Formatos do cliente (todos já crackados pelo nosso ferramental):
 *   .bmd = modelo 3D/animação OU dado estruturado (em Local/) · .ozj = JPEG+header 24B
 *   .ozt = TGA+header (BGRA, alpha) · .ozb/.ozd/.ozp/.ozg = variantes (bump/etc)
 *   .att/.map/.obj = terreno por World · .wav/.mp3 = áudio
 *
 *   node tools/mu/inventory-mu-assets.mjs
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const DATA = "C:/Users/Storming/Desktop/GItHubs/MU-Webzen/Data";
const OUT = "C:/Users/Storming/Desktop/GItHubs/Pixel_Idle_game/docs/mu-assets-inventory.md";

// agrupa pastas: ObjectN e WorldN colapsam em famílias
function groupOf(rel) {
  const top = rel.split(/[\\/]/)[0];
  if (/^Object\d+$/i.test(top)) return "Object* (cenário dos mundos)";
  if (/^World\d+/i.test(top)) return "World* (terrenos)";
  return top;
}

const groups = new Map(); // group -> { files, ext: Map, samples: [] }
async function walk(dir, rel = "") {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) { await walk(path.join(dir, e.name), r); continue; }
    const g = rel ? groupOf(r) : "(raiz)";
    if (!groups.has(g)) groups.set(g, { files: 0, ext: new Map(), samples: [] });
    const gr = groups.get(g);
    gr.files++;
    const ext = (e.name.split(".").pop() || "?").toLowerCase();
    gr.ext.set(ext, (gr.ext.get(ext) || 0) + 1);
    if (gr.samples.length < 6) gr.samples.push(r);
  }
}
await walk(DATA);

// anotações: o que cada categoria OFERECE pro projeto + status de exploração
const NOTES = {
  Item: "Modelos BMD de TODOS os itens (armas/armaduras/joias/asas) + texturas. **JÁ EXPLORADO**: catálogo 457 itens + 465 ícones + 13 sets vestidos no herói. Pendente: sets de outras classes, asas no personagem.",
  Interface: "2.2k texturas de UI: barra de comando, janelas, botões, fontes bitmap, cursores, minimapa, loading. **PARCIAL**: barra de comando fiel (hud-coords.md) + janela/inventário. Pendente: janela C fiel, botões reais, fonts bitmap, cursores, loot/tooltips.",
  Monster: "~2.1k arquivos: BMD+texturas de ~200 monstros com animações (idle/walk/attack/die). **PARCIAL**: 7 monstros de Lorência virados sprites. Pendente: bosses e bestiário completo (Dungeon/Devias/etc).",
  NPC: "Modelos dos NPCs (ferreiro, mercadora, Chaos Goblin…). **NÃO EXPLORADO**: essencial pra cidade/vendas/Chaos Machine.",
  Player: "Rig do jogador: player_s6.bmd (animações) + partes de corpo por classe + texturas. **JÁ EXPLORADO** (DK). Pendente: classes DW/Elf/MG/DL/Sum pra party visual.",
  Skill: "612 arquivos: efeitos/modelos de skills (Twisting Slash, Evil Spirit…). **NÃO EXPLORADO**: base pros efeitos de combate na cena.",
  Effect: "1.3k texturas/modelos de efeitos genéricos (fogo, brilho, hit, level-up). **NÃO EXPLORADO**: juice de combate (hits, crits, level-up).",
  Sound: "1.3k WAV/MP3: TODOS os sons do MU (hits, skills, ambiente, UI, música). **NÃO EXPLORADO**: nostalgia auditiva imediata (mHit, level-up, eMud, música de Lorência).",
  "World* (terrenos)": "80 mundos completos (att/map/obj + tiles). **PARCIAL**: Lorência bakeada (5 zonas). Pendente: Devias/Dungeon/Noria/Atlans… = novas regiões de caçada.",
  "Object* (cenário dos mundos)": "~140 pastas ObjectN = props 3D por mundo (árvores, prédios, fontes, estátuas). **NÃO EXPLORADO**: decorar as cenas (a fonte de Lorência!) e compor cidade.",
  Logo: "Logos/telas de marca da Webzen. Uso R&D apenas.",
  Local: "DADOS estruturados: item.bmd (**fonte do catálogo**), skill.bmd, itemtooltip, itemsetoption (opções de set!), formuladata, gate.bmd, mapcharacters. **PARCIAL**: item.bmd. Pendente: skill.bmd (skills reais), itemsetoption (bônus de set), gates/warp.",
};

const order = [...groups.entries()].sort((a, b) => b[1].files - a[1].files);
const totalFiles = order.reduce((s, [, g]) => s + g.files, 0);

let md = `# Inventário de assets — cliente MU-Webzen (S6)

> Gerado por \`tools/mu/inventory-mu-assets.mjs\` em 2026-07-13. Fonte: \`MU-Webzen/Data\`.
> **${totalFiles.toLocaleString("pt-BR")} arquivos**. ⚠️ LINHA VERMELHA: tudo aqui é arte ripada
> Webzen → uso R&D/protótipo (\`shippable:false\`); substituir por arte própria antes de launch.

| Categoria | Arquivos | Formatos principais | O que oferece / status |
|---|---:|---|---|
`;
for (const [g, info] of order) {
  const exts = [...info.ext.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([e, n]) => `${e}:${n}`).join(" ");
  md += `| **${g}** | ${info.files.toLocaleString("pt-BR")} | ${exts} | ${NOTES[g] ?? "—"} |\n`;
}

md += `
## Prioridades de extração (pro nosso roadmap)

1. **Sound/** — nostalgia instantânea, custo mínimo (WAV direto no browser): hits, level-up, música de Lorência, UI.
2. **Local/skill.bmd + Skill/** — skills reais (nomes/dados + efeitos) pro combate deixar de ser genérico.
3. **Local/itemsetoption.bmd** — bônus de SET reais (completa o sistema de sets já visível no herói).
4. **Player/ (demais classes)** — party visual: DW/Elf no lugar de silhuetas.
5. **World2/7 (Devias/Atlans…) + Object\*** — novas regiões de caçada + props (fonte de Lorência).
6. **NPC/** — cidade: ferreiro, lojas, Chaos Goblin (Chaos Machine já é o sistema de upgrade do flagship).
7. **Interface/ (fonts bitmap, botões, janela C)** — interface 100% fiel (engenharia hud-coords).

## Ferramental existente

- \`mu-textures.mjs\` — OZJ/OZT→PNG · \`mu-bmd.mjs\` — parse BMD+rig · \`parse-item-bmd.mjs\` — Local/item.bmd
- \`bake-lorencia-floor.mjs\` — terreno → backdrop · \`reforge-actors.mjs\`/\`build-player-sets.mjs\` — BMD → sprites
- \`extract-hud-assets.mjs\` + \`build-hud-bar.mjs\` — HUD fiel (coords autoritativas em \`hud-coords.md\`)
`;

await fs.writeFile(OUT, md);
console.log(`✅ inventário: ${order.length} categorias, ${totalFiles} arquivos → ${OUT}`);
