# Pixel Idle Game

Idle MMORPG de browser em pixel art — referência forte em Tibia. Party de 4 classes
(Tank / Healer / Mage / Archer), mundo em biomas com cidades-hub, criaturas por região,
loot e marketplace P2P.

> Projeto da casa **Tempest**. Fórmula "MMORPG clássico → idle no navegador" (ref: Stonegy/TibiaIdle)
> num IP original de alta-fantasia clássica.

## Stack

| Camada | Tech |
|---|---|
| UI / shell | Next.js 16 + React 19 |
| Cena de combate | PixiJS 8 (canvas WebGL) |
| Servidor de jogo (autoritativo) | Node + TypeScript + Colyseus *(Fase 3)* |
| Persistência | Postgres + Prisma *(futuro)* |

## Monorepo (npm workspaces)

```
apps/
  web/        Next.js + PixiJS — o cliente visual (roda hoje)
  server/     servidor autoritativo Colyseus (stub, Fase 3)
packages/
  shared/     tipos compartilhados: classes, entidades, protocolo, mundo
docs/
  GDD.md            game design
  ARCHITECTURE.md   arquitetura técnica + roadmap
```

## Rodar

```bash
npm install
npm run dev      # http://localhost:3000  →  /play
```

## Roadmap

- **Fase 0** — núcleo visual + arquitetura (⬅ atual): shell + cena de hunt no Pixi, loop mockado.
- **Fase 1** — progressão: níveis, loot, inventário, gear, regiões.
- **Fase 2** — idle real: simulação offline + stamina.
- **Fase 3** — social: servidor autoritativo, party de 4 players reais.
- **Fase 4** — economia: marketplace P2P.
- **Fase 5** — retenção: tasks, boosted creature, daily, bestiário.

Ver `docs/ARCHITECTURE.md` para detalhes.
