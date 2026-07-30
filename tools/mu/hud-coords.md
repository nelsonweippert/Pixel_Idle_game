# Coordenadas AUTORITATIVAS da barra de comando (HUD) do MU Online — Season 6

Fonte: `NewUIMainFrameWindow.cpp` do cliente MuMain (Main5.2 / S6).
- Espelho consultado: https://raw.githubusercontent.com/MuCrossEngine/MuMain/master/Main/source/NewUIMainFrameWindow.cpp
- Também presente em: sven-n/MuMain `src/source/UI/NewUI/HUD/NewUIMainFrameWindow.cpp`, ctpelok73/runixmu, etc.

Estas NÃO são coordenadas "no olho": são os valores literais que o cliente usa pra desenhar
a barra. `PosX` = borda esquerda do conjunto da barra; `PosY` = base (a barra desenha de
`PosY - 48` pra cima, altura 48). Origem horizontal do conjunto: PosX. Largura total = 640.

## Strips da barra (as 3 seções montadas lado a lado)
| Seção | textura        | x (rel. PosX) | y          | w   | h  |
|-------|----------------|---------------|------------|-----|----|
| menu1 | newui_menu01   | 0             | PosY - 48  | 256 | 48 |
| menu2 | newui_menu02   | 256           | PosY - 48  | 128 | 48 |
| menu3 | newui_menu03   | 384           | PosY - 48  | 256 | 48 |

Total: 256 + 128 + 256 = **640 x 48**.
(As texturas decodificadas têm 51px de altura nativa; o cliente as desenha em 48. Montamos
em altura nativa 51 e escalamos na web.)

## Orbes (joias) — layout "New School" (o usado no S6 moderno)
| Elemento | textura         | x (rel. PosX) | y         | w  | h  |
|----------|-----------------|---------------|-----------|----|----|
| HP gem   | newui_menu_red  | 158           | PosY - 48 | 45 | 39 |
| Mana gem | newui_menu_blue | 437           | PosY - 48 | 45 | 39 |

O socket do HP fica em x=158..203 (dentro do menu1, à direita dos slots Q/W/E/R).
O socket da Mana em x=437..482 (dentro do menu3, à esquerda dos slots numéricos).
O líquido drena pelo TOPO: o cliente recorta a joia por V (mostra só a fração de baixo).

(Layout "Old School" alternativo, não usado: HP em x=97 e Mana em x=489, joia 53x48.)

## Medidores verticais SD (escudo) / AG (stamina)
| Elemento | textura        | x (rel. PosX) | y         | w  | h  |
|----------|----------------|---------------|-----------|----|----|
| SD       | newui_menu_SD  | 204           | PosY - 49 | 16 | 39 |
| AG       | newui_menu_AG  | 420           | PosY - 49 | 16 | 39 |

SD fica logo à direita do orbe HP; AG logo à esquerda do orbe Mana. Preenchem de baixo p/ cima.

## Slots de skill (New School) — teclas Q/W/E/R
Labels de hotkey renderizados (15x12) — indicam a coluna de cada slot Q/W/E/R:
| tecla | x (rel. RenderFrame/PosX) | passo |
|-------|---------------------------|-------|
| Q     | 188                       |       |
| W     | 217                       | +29   |
| E     | 246                       | +29   |
| R     | 275                       | +29   |

Passo entre slots ≈ **29px**. As molduras dos slots já vêm desenhadas nos strips
(menu1 = Q/W/E/R à esquerda; menu2 = 2/3/4/5; menu3 = slots numéricos à direita),
então NÃO recriamos moldura: usamos a do strip e só sobrepomos o ícone da skill.

## Barra de experiência
| Elemento | textura      | x (rel. centro) | y             | w   | h |
|----------|--------------|-----------------|---------------|-----|---|
| EXP fill | newui_Exbar  | 221             | (base) + 439  | 198 | 4 |

No conjunto de 640 de largura, a barra de EXP fica aproximadamente centrada
(x≈221..419) na faixa inferior da moldura.

## Ornamentos das pontas
`in_main.OZT` / `in_main2.OZT` = moldura dragão-metal. ATENÇÃO: a textura inclui um
slot/caixa vazio embaixo do ornamento. Se for usar, recortar SÓ o dragão (topo);
na prática, montando a barra a partir dos strips já-diagramados os ornamentos são
opcionais e foram OMITIDOS pra evitar o "lobo quebrado".
