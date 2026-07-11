# Game Design Document — Pixel Idle

> Documento vivo. Fase 0. Consolidação das decisões de design tomadas em 2026-07-11.

## Pitch

Idle MMORPG de **browser** em **pixel art** — referência forte em **Tibia**. Você escolhe
**uma** classe, forma party com até **3 outros jogadores reais** e caça em um mundo largo de
biomas. Progresso continua **offline** (idle). Loot, gear e um **marketplace P2P** movem a
economia. Fórmula "MMORPG clássico → idle no navegador" (ref. Stonegy/TibiaIdle) num **IP
original** de alta-fantasia clássica.

## Pilares de design

1. **Fricção zero, profundidade alta.** Entra e joga em segundos; a profundidade vem do
   conteúdo (mapas, criaturas, gear, economia), não de tutorial.
2. **Idle premia quem AFKa, recompensa quem senta.** Idle rende, jogar ativo rende mais
   (regra ~3× do Stonegy).
3. **Anti-pay-to-win.** Premium vende **conveniência + cosmético**, nunca poder.
4. **O mundo é a atração.** Profundidade enciclopédica (lugares, ecologia, cidades), lore
   fina de propósito.

## As 4 classes (Tank · Healer · Mage · Archer)

Party = trindade clássica + DPS à distância. 4 slots de skill por char + **posição na grade**
(tank na frente, ranged atrás) + gear. Profundidade tática = **configurar**, não apertar botão.

| Classe | Papel | Fantasia | Formação |
|---|---|---|---|
| **Knight** | Tank | segura aggro/linha de frente, HP e defesa altos | frente |
| **Cleric** | Healer | mantém o grupo vivo, buffs, utilidade | trás |
| **Sorcerer** | Mage | dano mágico em área, frágil | trás |
| **Ranger** | Archer | DPS físico à distância, foco em bosses | trás |

Definições canônicas (stats, cores, skills) em `packages/shared/src/index.ts` → `VOCATIONS`.

## O mundo — escada de biomas

**Região → Cidade-hub + hunt maps gated por nível.** 7 regiões do noob ao endgame:

| # | Região | Cidade | Bioma | Nível |
|---|---|---|---|---|
| 1 | Campos de Rivenwatch | Rivenwatch | campos/vilarejo | 1–20 |
| 2 | Floresta de Duskwood | Thornhollow | floresta densa | 20–40 |
| 3 | Pântano de Mireland | Sedgemoor | pântano | 40–70 |
| 4 | Deserto de Sunscar | Karsh | deserto/ruínas | 70–110 |
| 5 | Montanhas de Frostpeak | Holdenfrost | gelo | 110–160 |
| 6 | Terras de Emberfall | Cinderhold | vulcânico | 160–220 |
| 7 | Criptas do Abismo | Nethergate | abismo/undead | 220+ |

Cada região tem famílias de criatura + boss. Dados em `packages/shared/src/world.ts` → `REGIONS`.

## Core loop

`escolhe região (por nível) → party auto-caça (idle) → ganha XP + loot → sobe nível + gear →
destrava região mais difícil`. Configura skills/posição/gear e ativa/desativa a caçada.

## Sistemas (roadmap — ver ARCHITECTURE.md p/ fases)

- **Loot & gear** — drops por raridade (common→legendary), equipar, vender.
- **Marketplace P2P** — trade assíncrono com taxas (sink de gold), moedas intermediárias.
- **Tasks** — metas dirigidas sobre o grind (1 ativa por vez).
- **Boosted creature diário** — +15% xp num monstro aleatório (hook diário grátis).
- **Bestiário** — mata X de uma criatura → destrava lore/bônus.
- **Stamina** — consome caçando, recupera parado (ritmo idle).
- **Bosses / raids** — 1 por região + eventos.

## Monetização (anti-P2W, modelo Stonegy refinado)

- **Premium (subscription)** — conveniência (fast-travel, offline market, ganho passivo de
  pontos) + cosmético. **Não vende poder.**
- **Cosméticos** — outfits, mounts, decoração (chase sem P2W).
- **Pix** como método de atrito zero (público BR).

Ver o neurônio `stonegy-referencia.md` para a análise completa da fórmula que estamos adaptando.
