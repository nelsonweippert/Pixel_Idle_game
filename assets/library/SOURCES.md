# Biblioteca de assets externos — proveniência & licenças

A biblioteca (`assets/library/`) é um **pool de matéria-prima de terceiros** que passou
pela Forja (normalizada pro nosso padrão: 64px, transparente, sem AA, snap Resurrect 64).

> ⚠️ **Passar pela Forja NÃO muda a licença do original.** Um derivado herda a licença
> da fonte. Antes de embutir qualquer item destes no jogo (promover pro
> `assets/manifest.json`), a licença da fonte precisa permitir uso comercial.

## effect/ — pack "Effect and FX Pixel All (Free)"

- **Origem local:** `C:\Users\Storming\Downloads\Effect and FX Pixel All Free\Free`
- **Importado:** 2026-07-11 · 180 sheets → **1620 effects** (grade frames×9 cores, célula 64px).
- **Autor / licença:** ⚠️ **A VERIFICAR.** O nome corresponde a um pack gratuito de
  itch.io (provável autor **BDragon1727** — "Free - Effect and FX Pixel All"). Packs
  "Free" desse tipo costumam permitir uso comercial COM crédito e **proibir revenda/
  redistribuição do asset cru**. Confirmar na página de origem antes de publicar e
  adicionar o crédito exigido aqui.
- **Como usar sem violar:** embutir apenas os **spritesheets processados** (a saída da
  Forja), nunca redistribuir os PNGs-fonte soltos. Ver relatório de fontes/licenças
  (pesquisa 2026-07-11).

### Classificação
Índice: `assets/library/index.json` (facetado por `byColor`, `byFrames`, `bySource`).
Cada entrada: `id` (`fx/<part>_<num>_r<linha>_<cor>`), `color`+`colorHex`, `frames`,
`fps`, `colors`, `source` (proveniência), `sheet` (Pixi JSON pronto).
Campo `family` = "" (nome semântico a curar depois — ex. "swirl", "burst", "explosion").

CLI: `npm run forge -- library import <dir>` · `npm run forge -- library list`
