# Loots & Glory — Sistemas MU (plano + spec + status)

> **Visão:** o jogo **é o MU Online**, só que com **cenas de caçada idle**. Todas as
> mecânicas e fórmulas vêm do **OpenMU** (MIT) e os assets do **MU-Webzen** (Season 6).
> Inventário, itens, drops, stats, upgrade = **padrão do MU**. O que muda é a camada de
> apresentação: **cena em PixiJS**, **todas as interfaces em Next**.

## Linha vermelha (legal)
- **Fórmulas/mecânicas** via OpenMU = limpo/legal (MIT), inclusive comercial.
- **Arte ripada do MU-Webzen** em **lançamento comercial** = infração (copyright Webzen).
  Uso em R&D/protótipo/validação de pipeline = privado, risco ~zero.
- Todo asset MU entra no manifesto com `source:"mu-webzen"` + `shippable:false`;
  `forge audit --provenance` é o gate de build de produção.

## Vocação → Classe MU
| Vocação | Classe MU | Build |
|---|---|---|
| `knight` | Dark Knight (dk) | tank STR/VIT, corpo-a-corpo |
| `sorcerer` | Dark Wizard (dw) | nuker ENE |
| `ranger` | Fairy Elf (elf) | arqueiro AGI |
| `cleric` | Fairy Elf (elf) | suporte/heal ENE/VIT (no MU a Elf **é** a healer) |

Classes MU completas já modeladas em `mu/stats.ts`: dw, dk, elf, mg, dl, sum
(expandir o roster jogável = adicionar vocações apontando pra mg/dl/sum).

---

## Roadmap (6 fases)

| # | Fase | Onde | Status |
|---|---|---|---|
| 1 | **Motor de stats/atributos + combate** | `shared/src/mu/*`, `game-core` | ✅ feito, testado (24/24) |
| 2 | **Modelo + catálogo de itens (S6)** | `mu/items.ts`, `shared/content/mu-items.json` | 🔷 tipos ✅ · catálogo em port |
| 3 | **Inventário + equipamento** | `game-core/session`, `game-server/store`, UI | 🔷 UI ✅ · persistência pendente |
| 4 | **Drops MU** | `mu/drops.ts`, `game-core/loot` | 🔷 módulo ✅ · wiring pendente (depende do catálogo) |
| 5 | **Pipeline de ícones** | `tools/mu/*` | ⬜ pendente |
| 6 | **UI Next** (ficha, inventário, equipar, tooltips) | `apps/web/components` | 🔷 ficha+mochila ✅ · equipar/tooltip pendente |

---

## Spec de fórmulas (extraída do OpenMU, termo a termo)

### Atributos → derivados (por classe) — `mu/stats.ts`
Base do MU: `DefenseFinal = 0.5 × DefenseBase`. Stats base por classe (nível 1) +
pontos por nível (DK/DW/Elf/Sum = 5; MG/DL = 7). Exemplos de derivados:

- **Dark Knight:** `maxHp = 35 + 2·L + 3·VIT` · `attackRate = 5·L + 1.5·AGI + 0.25·STR`
  · `minDmg = STR/6` · `maxDmg = STR/4` · `defBase = AGI/3`
- **Dark Wizard:** `maxHp = 30 + L + 2·VIT` · `minMagic = ENE/9` · `maxMagic = ENE/4`
- **Fairy Elf:** `maxHp = 39 + L + 2·VIT` · archery `min = AGI/7 + STR/14`, `max = AGI/4 + STR/8`

Dano de arma/gear é a maior fatia no MU → enquanto o inventário real não existe,
`assumedGear(voc, level)` gera um gear stand-in por nível (substituído por
`gearTermsFromEquipment(equipados)` na Fase 3).

### Curva de XP — `mu/xp.ts`
`xpAcumulada(L) = 10·(L+8)·(L-1)²` (L<256; termo extra acima de 256). Cap 400.

### Resolução de ataque (PvM) — `mu/combat.ts`
`hitChance = clamp(attackRate / (attackRate + defenseRate·1.4 + 1), 0.25, 0.99)` →
`dano = rand(minDmg, maxDmg)` → especiais (**excellent** +20% ignora defesa ·
**crítico** ignora defesa) → `− defesa` → piso `15%` do base.

### Drops — `mu/drops.ts`
Grupos padrão (1 drop/kill, roleta): **money 50% · item 30% · jewel 0.1% · excellent 0.01%**.
`itemLevel = min(floor((mobLevel − dropLevel)/3), maxLevel)`. Gap de drop = 12 níveis.
Rolls: luck 25% (+5% crit), opção normal 25% (nível 1–3 = +4/+8/+12/+16), skill 50% (armas),
excellent só via grupo excellent (mobLevel ≥ 25). Money = `xpGanho + 7`.

### Itens — `mu/items.ts`
`ItemDefinition{group,number,name,w,h,slot,dropLevel,maxLevel,durability,value,requirements,classes,power}`
· `ItemInstance{level(+0..15),luck,skill,option,excellent[],sockets}`.
Bônus por +level (dano/def): `[0,3,6,9,12,15,18,21,24,27,31,36,42,49,57,66]`; escudo `+1/nível`.
12 slots de equip (0..11): armas L/R, elmo, armadura, calça, luvas, botas, asas, pet, pingente, anel×2.

---

## Assets MU (para ícones — Fase 5)
- Modelos: `MU-Webzen/Data/Item/*.bmd` (pasta chata; nome = `<Prefixo><NN>.bmd`).
- **Não há atlas de ícone pronto** → renderizar do BMD.
- Mapeamento (grupo,número)→arquivo: decriptar `Data/Local/item.bmd`
  (**Bux XOR**, chave `FC CF AB`, pula header de 4 bytes) → tabela `id = group*512 + number`.

---

## Regras de ouro (ao implementar)
1. `SessionState` e `ItemInstance` **100% JSON-safe** (sem bigint/Date/classe) — offline replay quebra senão.
2. Toda aleatoriedade passa pelo `RngCursor` — **nunca `Math.random`** — ou o determinismo quebra.
3. A sim emite **slot lógico**, nunca pixel (o client é dono das posições).
4. Todo shape novo de conteúdo ganha checagem em `validateContent`.
5. `deriveParticipant` (session) e o re-derive do `levelUp` (rewards) mudam **juntos**.
