# Tibia Style Profile — regras visuais (referência de estilo, NÃO assets)

> ⚠️ Este documento destila as **REGRAS DE ESTILO** do Tibia (perspectiva, contorno,
> paleta, proporção) a partir de observação pública. Estilo e gênero **não são
> protegidos por copyright** — podemos nos inspirar. O que é proibido é usar os
> **sprites/mapas/criaturas/nomes específicos** da CipSoft. Nenhum asset do Tibia
> entra neste repo. Aqui ficam só as regras, que a Forja aplica à NOSSA arte.

Objetivo: chegar à precisão/leitura do Tibia (e ao "pop" do idle premium tipo
DeFi Dungeons) na nossa pipeline, com IP 100% nosso.

## As regras destiladas

| Dimensão | Regra Tibia-like | Nosso estado |
|---|---|---|
| **Grid** | 32px ortogonal; criaturas grandes ocupam múltiplos tiles | tile 32 ✅ · char 64 (2 tiles) ✅ |
| **Perspectiva** | top-down ortogonal com leve viés "de frente" (face visível na pose sul) | facing sul ✅ |
| **Contorno** | **outline escuro 1px** em toda a silhueta — o maior fator de leitura/pop | `addOutline` ✅ |
| **Paleta** | limitada, mas com **acentos saturados** (sangue, ouro, verde-veneno, azul-mana) — não pastel, não lavada | Resurrect 64 + saturação 1.4 ✅ |
| **Sombreamento** | **cel shading chapado** com dithering leve; luz dura de topo; poucos gradientes | ajustar prompt → flat cel + dither |
| **Proporção** | chunky/robusta, cabeça grande, silhueta larga e legível | ok (Pixellab tende a isso) |
| **Animação** | mínima de propósito: idle ~estático, walk 2-3f, attack curto | idle+respiração ✅ · walk/attack a regerar |
| **Legibilidade** | silhueta clara à distância; cor distingue tipo de criatura | validar por criatura |

## Prompt-base da Forja (derivado das regras)

```
high-fantasy pixel art character, top-down orthogonal RPG sprite, bold dark outline
around the silhouette, limited palette with vibrant saturated accent colors, flat cel
shading with light dithering, hard top light, chunky readable proportions, dark
fantasy medieval, clean silhouette, no anti-aliasing
```

## Diferença de calibragem (dial)

- **Tibia puro:** mais chapado/fosco, paleta contida.
- **DeFi Dungeons / idle premium:** mais vibrante, rim-light, contraste alto.
- **Nosso alvo:** estrutura Tibia (grid, outline, proporção, leitura) + **cor vibrante**
  (o Nelson quer que "chame atenção"). Saturação é o dial (`SATURATION` em generate.ts).

## Referências LEGAIS pra ancorar (baixáveis, comerciais)

- **Estudar o Tibia** (client/wiki/prints) — livre pra olhar, pro moodboard.
- Packs top-down dark comerciais como âncora de proporção/leitura (Pipoya 32×32 grátis,
  CraftPix top-down) — importáveis via `forge library import`, herdam a licença da fonte.
- Nossa própria geração (Pixellab + Forja) é a fonte principal — IP nosso.
