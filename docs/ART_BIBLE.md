# Bíblia de Arte — Pixel Idle

> A versão **executável** destas regras é `packages/forge/src/spec.ts` (o que o
> validador consulta). Este doc é a versão pra humanos. Divergiu? `spec.ts` vence.
>
> Regra de ouro: **nenhum asset entra no jogo sem passar pela Forja** — validado,
> normalizado e registrado no `assets/manifest.json`. O jogo só carrega o manifesto.

## Direção (ratificada 2026-07-11, por dado de mercado)

Alta-fantasia clássica, **referência forte em Tibia**: legível, sólido, sem exagero de
detalhe. Bonecos básicos + "vida" vinda do **código** (efeitos, hit-flash, damage numbers),
não de frames caros.

## Dimensões (base 32px — o padrão de mercado)

| Tipo | Canvas (por frame) | Cores | Âncora |
|---|---|---|---|
| **tile** | 32×32 | ≤24 | centro · seamless |
| **character** | 48×48 | ≤24 | pé (bottom-center) |
| **creature** | 32 / 48 / 64 / 96 / **128** (boss) | ≤24 | pé |
| **prop** | 32 / 48 / 64 | ≤24 | pé |
| **icon** | 32×32 | ≤16 | centro |
| **effect** | 32 / 48 / 64 | ≤24 | centro |

- Fundo **transparente** (PNG-32); cantos vazios (menos em `tile`).
- Boss até 128px respeita o teto do **Pixellab PRO**.

## Vista & direções

**Top-down, 4 direções** (Norte / Sul / Leste / Oeste) — o Tibia canônico, casa com o grid.

## Animação — nível Tibia (básica de propósito)

| Asset | idle | walk | attack |
|---|---|---|---|
| **character** | 1–2f | 3–4f | 2–3f |
| **creature** | 1–3f | 2–4f *(opc)* | 1–3f *(opc)* |
| **effect** | — | — | play 2–8f (1 dir) |

Todas em 4 direções (menos `effect`). **Ataque é frame básico** — a força do golpe vem do
engine (lunge, projétil, flash, número), não da coreografia.

### Convenção de spritesheet
Grade **frames (colunas) × direções (linhas)**, cada célula = 1 tamanho válido do tipo.
Ex.: `character/walk` 48×48, 4 frames, 4 direções → folha **192×192**.

**Contrato de direções** (ordem das linhas, top→bottom): **`south · north · east · west`**.
É explícito de propósito — ambiguidade de direção foi o que quebrou o walk do Wraithfall 3×.
Tipos com vários tamanhos (creature) exigem `--size <px>` no validate/ingest pra desambiguar.

## Qualidade — o que a Forja REPROVA (limpeza de pixel art)

Além de dimensão/cor/transparência, o validador barra o que estraga arte de IA:
- **anti-aliasing** — >2% de pixels com alpha parcial (borda borrada). `ingest` já limpa
  (binariza o alpha) por padrão; use `--no-clean` pra desligar.
- **upscale** — imagem que é um sprite pequeno escalado (blocos N×N idênticos). Gere no
  tamanho nativo; scale 1:1 é obrigatório.

## Paleta

**Master: Resurrect 64** (`packages/forge/src/palette.ts`). É a paleta de trabalho + guia.
O validador **limita a contagem** de cores por sprite (não força pertencimento — isso
degradaria o Pixellab). Snap à master é **opcional** (`forge ingest … --snap`) e usa
**image-q** (quantização CIEDE2000, dither opcional com `--dither`) — não um nearest ingênuo.

## Style-prompt fixo do Pixellab

Base pra toda geração (ajustar sujeito, manter o resto):

> `<sujeito>, classic high-fantasy pixel art, top-down RPG sprite, Tibia-inspired, clean
> readable silhouette, simple shading, dark fantasy medieval, muted earthy palette, PRO mode`

- Sempre **Pro mode** (ver `pixellab-pipeline`). Char 8-dir cap 128px; nós usamos 4-dir.
- Gerou → **passa pela Forja** antes de qualquer uso.

## Workflow do portão

```bash
# ver as regras
npm run forge -- spec

# validar um asset solto
npm run forge -- validate hero.png --type character --anim walk

# ingerir (valida entrada → limpa/normaliza → re-valida saída → registra). Reprovou, não entra.
npm run forge -- ingest hero.png --type character --id knight --anim walk --size 48
npm run forge -- ingest rat.png  --type creature  --id greenfields/cave-rat --anim idle --size 48

# rodar os testes da Forja
npm test -w @pixel-idle/forge

# listar o que já passou
npm run forge -- list
```

**Saída pronta pro PixiJS:** asset animado gera `assets/sprites/<id>.<anim>.png` **+**
`assets/sprites/<id>.<anim>.json` (spritesheet no formato Pixi — `frames` com `anchor`,
`animations` por direção, `fps`). Carrega direto:

```ts
const sheet = await Assets.load("assets/sprites/knight.walk.json");
const spr = new AnimatedSprite(sheet.animations.south); // anda pra baixo
spr.animationSpeed = sheet.data.meta.fps / 60;
```

Tudo entra no `assets/manifest.json` — **o portão** (o jogo só carrega o registrado).
