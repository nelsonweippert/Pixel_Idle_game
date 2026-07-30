# Inventário de assets — cliente MU-Webzen (S6)

> Gerado por `tools/mu/inventory-mu-assets.mjs` em 2026-07-13. Fonte: `MU-Webzen/Data`.
> **32.616 arquivos**. ⚠️ LINHA VERMELHA: tudo aqui é arte ripada
> Webzen → uso R&D/protótipo (`shippable:false`); substituir por arte própria antes de launch.

| Categoria | Arquivos | Formatos principais | O que oferece / status |
|---|---:|---|---|
| **Object* (cenário dos mundos)** | 13.092 | bmd:6863 ozj:5264 ozt:965 | ~140 pastas ObjectN = props 3D por mundo (árvores, prédios, fontes, estátuas). **NÃO EXPLORADO**: decorar as cenas (a fonte de Lorência!) e compor cidade. |
| **Item** | 7.819 | ozj:4633 bmd:2716 ozt:467 mapack:1 | Modelos BMD de TODOS os itens (armas/armaduras/joias/asas) + texturas. **JÁ EXPLORADO**: catálogo 457 itens + 465 ícones + 13 sets vestidos no herói. Pendente: sets de outras classes, asas no personagem. |
| **Interface** | 2.231 | ozd:1246 ozt:483 ozj:238 ozg:175 | 2.2k texturas de UI: barra de comando, janelas, botões, fontes bitmap, cursores, minimapa, loading. **PARCIAL**: barra de comando fiel (hud-coords.md) + janela/inventário. Pendente: janela C fiel, botões reais, fonts bitmap, cursores, loot/tooltips. |
| **Monster** | 2.097 | ozj:1304 bmd:552 ozt:239 tga:2 | ~2.1k arquivos: BMD+texturas de ~200 monstros com animações (idle/walk/attack/die). **PARCIAL**: 7 monstros de Lorência virados sprites. Pendente: bosses e bestiário completo (Dungeon/Devias/etc). |
| **World* (terrenos)** | 2.009 | ozj:1289 ozt:309 ozb:161 att:84 | 80 mundos completos (att/map/obj + tiles). **PARCIAL**: Lorência bakeada (5 zonas). Pendente: Devias/Dungeon/Noria/Atlans… = novas regiões de caçada. |
| **Effect** | 1.356 | ozj:704 bmd:311 ein:292 ozt:49 | 1.3k texturas/modelos de efeitos genéricos (fogo, brilho, hit, level-up). **NÃO EXPLORADO**: juice de combate (hits, crits, level-up). |
| **Sound** | 1.339 | wav:1320 mp3:12 ogg:6 ini:1 | 1.3k WAV/MP3: TODOS os sons do MU (hits, skills, ambiente, UI, música). **NÃO EXPLORADO**: nostalgia auditiva imediata (mHit, level-up, eMud, música de Lorência). |
| **Player** | 1.292 | bmd:669 ozj:485 ozt:138 | Rig do jogador: player_s6.bmd (animações) + partes de corpo por classe + texturas. **JÁ EXPLORADO** (DK). Pendente: classes DW/Elf/MG/DL/Sum pra party visual. |
| **Skill** | 612 | ozj:319 bmd:245 ozt:48 | 612 arquivos: efeitos/modelos de skills (Twisting Slash, Evil Spirit…). **NÃO EXPLORADO**: base pros efeitos de combate na cena. |
| **NPC** | 436 | ozj:255 bmd:128 ozt:53 | Modelos dos NPCs (ferreiro, mercadora, Chaos Goblin…). **NÃO EXPLORADO**: essencial pra cidade/vendas/Chaos Machine. |
| **Logo** | 200 | ozj:127 ozt:44 bmd:29 | Logos/telas de marca da Webzen. Uso R&D apenas. |
| **Music** | 67 | mp3:63 ogg:4 | — |
| **Local** | 61 | bmd:55 ozj:5 csr:1 | DADOS estruturados: item.bmd (**fonte do catálogo**), skill.bmd, itemtooltip, itemsetoption (opções de set!), formuladata, gate.bmd, mapcharacters. **PARCIAL**: item.bmd. Pendente: skill.bmd (skills reais), itemsetoption (bônus de set), gates/warp. |
| **(raiz)** | 5 | dat:2 bmd:2 mpr:1 | — |

## Prioridades de extração (pro nosso roadmap)

1. **Sound/** — nostalgia instantânea, custo mínimo (WAV direto no browser): hits, level-up, música de Lorência, UI.
2. **Local/skill.bmd + Skill/** — skills reais (nomes/dados + efeitos) pro combate deixar de ser genérico.
3. **Local/itemsetoption.bmd** — bônus de SET reais (completa o sistema de sets já visível no herói).
4. **Player/ (demais classes)** — party visual: DW/Elf no lugar de silhuetas.
5. **World2/7 (Devias/Atlans…) + Object*** — novas regiões de caçada + props (fonte de Lorência).
6. **NPC/** — cidade: ferreiro, lojas, Chaos Goblin (Chaos Machine já é o sistema de upgrade do flagship).
7. **Interface/ (fonts bitmap, botões, janela C)** — interface 100% fiel (engenharia hud-coords).

## Ferramental existente

- `mu-textures.mjs` — OZJ/OZT→PNG · `mu-bmd.mjs` — parse BMD+rig · `parse-item-bmd.mjs` — Local/item.bmd
- `bake-lorencia-floor.mjs` — terreno → backdrop · `reforge-actors.mjs`/`build-player-sets.mjs` — BMD → sprites
- `extract-hud-assets.mjs` + `build-hud-bar.mjs` — HUD fiel (coords autoritativas em `hud-coords.md`)
