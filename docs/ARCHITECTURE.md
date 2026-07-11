# Arquitetura técnica — Pixel Idle

> Fase 0. Baseado na engenharia reversa do Stonegy (Next+PixiJS+servidor autoritativo,
> protocolo snapshot+patch sobre 1 WebSocket). Ver neurônio `stonegy-referencia.md` §8.

## Princípio central: render desacoplado da simulação

O erro que evitamos: **não** fazer o jogo inteiro numa game engine monolítica. Em vez disso:

- **React/Next** faz ~90% do jogo (UI, HUD, loja, chat, inventário) — DOM comum.
- **PixiJS** renderiza **só a cena de combate** (1 canvas WebGL).
- A **simulação** é uma fonte de verdade separada. Hoje é `MockEngine` (client-side); na
  Fase 3 vira um **servidor autoritativo** que emite as mesmas formas de dados.

```
┌─────────────── apps/web ───────────────┐
│  React HUD  ◄── EngineSnapshot ──┐      │
│  (painéis, loja, chat)           │      │
│                                  │      │
│  HuntScene (PixiJS)  ◄── events ─┤      │
│  (render puro)                   │      │
│                                  │      │
│            ┌─────────────────────┴───┐  │
│  Fase 0 →  │ MockEngine (client)     │  │
│  Fase 3 →  │ WS client ◄── servidor  │  │  ← só troca a caixa da simulação;
│            └─────────────────────────┘  │     render e HUD não mudam.
└─────────────────────────────────────────┘
```

`MockEngine` (`apps/web/game/MockEngine.ts`) e `HuntScene` (`apps/web/game/HuntScene.ts`)
são propositalmente independentes: o engine emite `EngineEvent` (hit/death/spawn/loot) +
`EngineSnapshot`; a cena só desenha; a HUD só lê o snapshot.

## Stack

| Camada | Tech | Status |
|---|---|---|
| UI / shell | Next.js 16 + React 19 | ✅ Fase 0 |
| Cena de combate | PixiJS 8 (WebGL) | ✅ Fase 0 |
| Simulação | `MockEngine` (client) | ✅ Fase 0 → substituída na Fase 3 |
| Estilo | Tailwind CSS 4 | ✅ |
| Servidor de jogo | Node + TS + **Colyseus** | ⏳ Fase 3 |
| Persistência | Postgres + Prisma | ⏳ |
| Pagamento | Pix (Pagar.me/Stripe) | ⏳ |

## Monorepo (npm workspaces)

```
apps/
  web/       Next.js + PixiJS (roda hoje)
    app/           rotas (/ → /play)
    components/    GameClient, CanvasStage, hud
    game/          MockEngine (sim) + HuntScene (render)
  server/    stub Colyseus (Fase 3)
packages/
  shared/    domínio: VOCATIONS, REGIONS, entidades, LOOT, PROTOCOLO
docs/
```

`packages/shared` é consumido direto do TS-source via `transpilePackages` (sem build step).

## Protocolo de rede (Fase 3 — já definido em `shared`)

Espelha o Stonegy: 1 WebSocket, mensagens `{ type, data }`, **snapshot no bootstrap +
patches incrementais**. Servidor é **autoridade total** (dano/loot/XP calculados server-side
— é o que torna o idle offline real). Tipos: `ClientMessage` (intenções) e `ServerMessage`
(estado) em `packages/shared/src/index.ts`.

## Roadmap

| Fase | Entrega | Status |
|---|---|---|
| **0** | Núcleo visual: shell + cena Pixi + loop mockado | ✅ |
| **1** | Progressão: loot real, inventário, gear, equipar | ⏳ próximo |
| **2** | Idle real: simulação offline + stamina |  |
| **3** | Social: servidor autoritativo (Colyseus) + party de 4 players |  |
| **4** | Economia: marketplace P2P |  |
| **5** | Retenção: tasks, boosted creature, daily, bestiário |  |

## Rodar

```bash
npm install
npm run dev     # http://localhost:3000 → /play
```

Validação visual da Fase 0: página carrega em `/play`, combate roda (damage numbers, loot,
XP/h subindo), troca de região redesenha o bioma, zero erro de console.
