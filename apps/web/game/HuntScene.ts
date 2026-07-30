/**
 * HuntScene — RENDER puro (PixiJS 8). Não simula nada: recebe entidades +
 * eventos (do NetClient/game-core hoje, do servidor amanhã) e desenha. Piso em tiles do
 * bioma, heróis em formação, monstros, ataques, damage numbers e barras de HP.
 */

import { Application, Container, Graphics, Text, Assets, AnimatedSprite, Spritesheet, Sprite as PixiSprite, Texture, Rectangle } from "pixi.js";
import type { CombatEntity, RegionDef } from "@pixel-idle/shared";
import type { EngineEvent, HeroPieces } from "./NetClient";
import { GRID } from "./NetClient";
import { loadTiledScene, type TiledScene } from "./TiledMap";

// TILE 64 → WORLD 960×576 ≈ resolução NATIVA do piso bakeado de Lorência (960×600).
// Assim o piso NÃO é encolhido pra caber (perda de detalhe) e só sobe ~1.5× no layout
// (nearest, nítido) em vez de 0.5×→3× (borrado). Corrige o "zoom alto/animação feia".
const TILE = 64;
const WORLD_W = GRID.w * TILE;
const WORLD_H = GRID.h * TILE;
const GROUND_Y = TILE * 0.42; // linha do chão (onde o pé do sprite fica)
const FACING = "south"; // fallback de direção quando não há vetor de movimento
// velocidade de marcha (px de MUNDO/s): heróis e monstros ANDAM da borda até a linha de
// combate ao surgir (como nos artefatos do explorer), tocando o walk anim. Constante (sem
// lerp/ease — passo fixo por frame), pé plantado via roundPixels.
const WALK_SPEED = 240;
// direção (nome do sheet) a partir do vetor de movimento — igual ao dirOf do explorer
// (|dx|>|dy| → leste/oeste; senão sul/norte). Os sheets têm as 4 direções.
const facingOf = (dx: number, dy: number): string =>
  Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "east" : "west") : dy > 0 ? "south" : "north";
// em repouso: herói encara LESTE por padrão; monstro encara O CENTRO da party (spawn
// radial — quem nasce a oeste olha pra leste, quem nasce ao norte olha pro sul, etc).
// O facing real do monstro é resolvido na cena (restFacingFor) com a posição dele.
const restFacing = (e: CombatEntity): string => (e.kind === "hero" ? "east" : "west");

interface Sprite {
  root: Container;
  body: Graphics;
  anim?: AnimatedSprite; // sprite real (ex: knight) — quando existe, substitui o body
  state?: "idle" | "attack" | "walk";
  facing: string; // direção atual do sheet (south/north/east/west)
  hpFill: Graphics;
  hpWrap: Container;
  entity: CombatEntity;
  wx: number; // posição ATUAL em px do mundo (anda em passos fixos até o alvo do tile)
  wy: number;
  ox: number; // deslocamento de lunge (jab de ataque, decai rápido)
  oy: number;
  flash: number;
  bobPhase: number; // fase da respiração (idle vivo, por código)
  scale: number; // escala do ator (relativa ao terreno, estilo explorer)
  shadow?: Graphics; // sombra elíptica no pé
  dying?: boolean; // tocando a animação de morte — não interromper nem sync remover
}

/** spritesheets de uma entidade (idle obrigatório; walk/attack opcionais).
 *  Heróis encaram leste (monstros à direita); monstros encaram oeste. */
type SheetSet = {
  idle: Spritesheet;
  walk?: Spritesheet;
  attack?: Spritesheet;
  hurt?: Spritesheet;
  death?: Spritesheet;
};

const HERO_VOCATIONS = ["knight", "ranger", "cleric", "sorcerer"];
// monstros MU de Lorência (sprites reais rendered do BMD via Forja) + skeleton
const CREATURE_IDS = ["bull-fighter", "spider", "budge-dragon", "hound", "lich", "giant", "skeleton-warrior", "skeleton"];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// escala por ator = 1.0. Os sprites da Forja (reforge-actors) JÁ saem na altura de tela
// (altura nativa = BASE_H·mobScale px: spider 48, DK 100, giant 113) — o tamanho relativo
// está embutido na resolução do próprio PNG. Então o engine NÃO reamostra por-ator (sem
// downscale nearest interno); a nitidez chunky vem do upscale do mundo. Overrides finos
// por ator ficam aqui se preciso (default 1.0).
const ACTOR_BASE = 1.0;
const REL_SCALE: Record<string, number> = {};
const actorScale = (e: CombatEntity) =>
  ACTOR_BASE * (REL_SCALE[e.kind === "hero" ? e.vocation ?? "" : slug(e.name)] ?? 1.0);

interface Float {
  t: Text;
  life: number;
  max: number;
  vy: number;
}

interface Projectile {
  g: Graphics;
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
}


export class HuntScene {
  private app = new Application();
  private world = new Container();
  private floorLayer = new Container();
  private entityLayer = new Container();
  private fxLayer = new Container();
  private sprites = new Map<string, Sprite>();
  private floats: Float[] = [];
  private projectiles: Projectile[] = [];
  private region!: RegionDef;
  private host!: HTMLElement;
  private ro?: ResizeObserver;
  private ready = false;
  private time = 0; // acumulador pra animações por código (respiração)
  private heroSheets = new Map<string, SheetSet>(); // por vocação
  private creatureSheets = new Map<string, SheetSet>(); // por slug do nome
  private setSheets = new Map<number, SheetSet | null>(); // sheets do herói VESTINDO cada set completo (lazy)
  private heroSetOverride: SheetSet | null = null; // visual atual do herói (sobrepõe o sheet base do knight)
  private currentPiecesKey = ""; // combo de peças atualmente vestido (evita recomposição)
  private pieceSheets = new Map<string, SheetSet | null>(); // cache de combos compostos em camadas
  // manifesto das camadas bakeadas (undefined = ainda não buscado; null = indisponível)
  private layerManifest: { cellW: number; cellH: number; layers: string[] } | null | undefined = undefined;
  private floorTiles: Texture[] = []; // tiles de chão do tileset, vazio = fallback xadrez
  private propTex = new Map<string, Texture>(); // props de cenário (árvore/lápide/osso…)
  private tmxScene: TiledScene | null = null; // mapa composto pelo artista (forge tmx-export)
  private preferredScene: string | null = null; // cena escolhida no seletor do HUD (senão, lista padrão)
  // área de batalha em px do MUNDO (o grid 15×9 das entidades é mapeado aqui dentro).
  // default = mundo inteiro; uma cena tmx pode declarar um retângulo menor (a arena).
  private battle = { x: 0, y: 0, w: WORLD_W, h: WORLD_H };

  async init(host: HTMLElement, region: RegionDef) {
    this.host = host;
    this.region = region;
    await this.app.init({
      antialias: false,
      roundPixels: true,
      backgroundColor: region.palette.bg,
      // resolution = DPR: renderiza no nº de pixels FÍSICOS da tela (não nos lógicos).
      // Sem isto, num display HiDPI (2×) o Pixi rasteriza em baixa-res e o NAVEGADOR
      // estica o canvas inteiro → o pixel-art borra. Com autoDensity o canvas mantém
      // o tamanho CSS certo mas o backbuffer é 2× → sprite nítido no zoom fracionário.
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      resizeTo: host,
    });
    host.appendChild(this.app.canvas);

    await this.loadSprites();
    await this.loadTileset();

    this.world.addChild(this.floorLayer, this.entityLayer, this.fxLayer);
    this.app.stage.addChild(this.world);
    this.drawFloor();
    this.layout();

    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(host);

    this.app.ticker.add((tk) => this.update(tk.deltaMS));
    this.ready = true;
  }

  private layout() {
    if (!this.app.renderer) return;
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    // COVER (Math.max): a cena PREENCHE a tela inteira (fullscreen), recortando as
    // bordas — o HUD flutua sobre elas. O centro (arena/combate) fica sempre visível
    // e centralizado entre os painéis. (Antes era Math.min = fit com barras pretas.)
    const scale = Math.max(w / WORLD_W, h / WORLD_H);
    this.world.scale.set(scale);
    this.world.position.set((w - WORLD_W * scale) / 2, (h - WORLD_H * scale) / 2);
  }

  setRegion(region: RegionDef) {
    this.region = region;
    if (this.app.renderer) this.app.renderer.background.color = region.palette.bg;
    this.drawFloor();
  }

  /** troca o CENÁRIO ao vivo (seletor do HUD): carrega a scene.json escolhida e
   *  redesenha o chão + reposiciona a arena. Se falhar, mantém o cenário atual. */
  async setScene(url: string) {
    if (!this.ready || url === this.preferredScene) return;
    const prev = this.tmxScene;
    this.preferredScene = url;
    try {
      this.tmxScene = await loadTiledScene(url);
    } catch {
      this.tmxScene = prev; // cena inválida → não quebra a atual
      return;
    }
    this.drawFloor();
    this.layout();
  }

  /** mapeia um tile do grid lógico (15×9) pra px do mundo, DENTRO da área de batalha
   *  (a arena). Assim as entidades nunca saem do chão aberto, mesmo em mapas decorados. */
  private tileToPx(t: { x: number; y: number }) {
    const b = this.battle;
    return {
      x: b.x + ((t.x + 0.5) / GRID.w) * b.w,
      y: b.y + ((t.y + 0.5) / GRID.h) * b.h,
    };
  }

  /** carrega o chão: 1º a arena composta com tiles do artista (ringue de treino
   *  murado — tools/compose-arena.mts; alternativa temática: /tilesets/crypt-chamber);
   *  senão a cena da cripta; senão o graveyard baked; senão o xadrez procedural. */
  private async loadTileset() {
    // cena escolhida no HUD tem prioridade; senão, ordem padrão das cenas construídas
    const urls = this.preferredScene
      ? [this.preferredScene]
      : ["/tilesets/forest-clearing/scene.json", "/tilesets/arena/scene.json", "/tilesets/crypt/scene.json"];
    for (const url of urls) {
      try {
        this.tmxScene = await loadTiledScene(url);
        return; // cena do artista carregada — dispensa o chão baked
      } catch {
        this.tmxScene = null; // tenta a próxima → fallbacks abaixo
      }
    }
    try {
      const tex = await Assets.load("/tilesets/graveyard-floor.png");
      tex.source.scaleMode = "nearest";
      const T = 32;
      const tile = (i: number) =>
        new Texture({ source: tex.source, frame: new Rectangle(i * T, 0, T, T) });
      this.floorTiles = [tile(0), tile(1), tile(2), tile(3)]; // grama · transição · terra · fenda
    } catch {
      this.floorTiles = [];
      return;
    }
    const names = ["tree", "gargoyle", "tomb1", "tomb2", "bone1", "bone2"];
    await Promise.all(
      names.map(async (n) => {
        try {
          const t = await Assets.load(`/props/graveyard/${n}.png`);
          t.source.scaleMode = "nearest";
          this.propTex.set(n, t);
        } catch {
          /* prop opcional */
        }
      }),
    );
  }

  /** posiciona um prop com o pé no tile (tx,ty) — anchor bottom-center. floorLayer =
   *  atrás das entidades (backdrop/decais acima ou sob o combate). */
  private addProp(name: string, tx: number, ty: number) {
    const t = this.propTex.get(name);
    if (!t) return;
    const s = new PixiSprite(t);
    s.anchor.set(0.5, 1);
    s.position.set(tx * TILE, ty * TILE);
    this.floorLayer.addChild(s);
  }

  private drawFloor() {
    this.floorLayer.removeChildren();
    if (this.tmxScene) {
      // cobre o WORLD mantendo proporção e CENTRALIZA a cena (offset) — assim a plaza
      // fica no centro pra qualquer tamanho de cena (cena maior = mais mata = zoom-out).
      const { pxW, pxH } = this.tmxScene;
      const sc = Math.max(WORLD_W / pxW, WORLD_H / pxH);
      const offX = (WORLD_W - pxW * sc) / 2;
      const offY = (WORLD_H - pxH * sc) / 2;
      this.tmxScene.container.scale.set(sc);
      this.tmxScene.container.position.set(offX, offY);
      this.floorLayer.addChild(this.tmxScene.container);
      // a cena pode declarar a arena (área de batalha) em tiles → px do mundo (com offset)
      const bt = this.tmxScene.doc.battle;
      const { tileW, tileH } = this.tmxScene.doc;
      if (bt) {
        this.battle = {
          x: offX + bt.x * tileW * sc,
          y: offY + bt.y * tileH * sc,
          w: bt.w * tileW * sc,
          h: bt.h * tileH * sc,
        };
      }
      return;
    }
    if (this.floorTiles.length) {
      // cena de cemitério em faixas: grama (linhas 0-1) → transição (2) → terra (3+)
      // com fenda ocasional. O combate rola nas linhas 3-6, sobre a terra.
      for (let y = 0; y < GRID.h; y++) {
        for (let x = 0; x < GRID.w; x++) {
          let ti: number;
          if (y <= 1) ti = 0; // grama
          else if (y === 2) ti = 1; // transição grama→terra
          else {
            const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
            ti = h % 6 === 0 ? 3 : 2; // terra / fenda
          }
          const spr = new PixiSprite(this.floorTiles[ti]);
          spr.x = x * TILE;
          spr.y = y * TILE;
          spr.width = TILE;
          spr.height = TILE;
          this.floorLayer.addChild(spr);
        }
      }
      // ossos espalhados no campo (decais sob as entidades)
      for (const [n, tx, ty] of [
        ["bone1", 3, 5], ["bone2", 6, 7.4], ["bone1", 9.5, 4.4], ["bone2", 12, 6], ["bone1", 7.5, 8],
      ] as [string, number, number][]) {
        this.addProp(n, tx, ty);
      }
      // props de fundo na banda de grama (atrás das entidades)
      for (const [n, tx, ty] of [
        ["tree", 1.6, 2.5], ["gargoyle", 4.5, 2.2], ["tomb1", 7.5, 2.6], ["gargoyle", 10.5, 2.2], ["tomb2", 13, 2.6],
      ] as [string, number, number][]) {
        this.addProp(n, tx, ty);
      }
      return;
    }
    // fallback procedural (xadrez) — se o tileset não carregar
    const { floorA, floorB, accent } = this.region.palette;
    const g = new Graphics();
    for (let y = 0; y < GRID.h; y++) {
      for (let x = 0; x < GRID.w; x++) {
        const c = (x + y) % 2 === 0 ? floorA : floorB;
        g.rect(x * TILE, y * TILE, TILE, TILE).fill(c);
      }
    }
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 90; i++) {
      const px = Math.floor(rnd() * WORLD_W);
      const py = Math.floor(rnd() * WORLD_H);
      const s = 2 + Math.floor(rnd() * 3);
      g.rect(px, py, s, s).fill({ color: accent, alpha: 0.25 + rnd() * 0.25 });
    }
    g.rect(0, 0, WORLD_W, WORLD_H).stroke({ width: 2, color: 0x000000, alpha: 0.5 });
    this.floorLayer.addChild(g);
  }

  // ── carregamento de sprites reais (saída da Forja) ──────────────────────────
  private async loadSprites() {
    for (const v of HERO_VOCATIONS) {
      const set = await this.loadSet(`/sprites/${v}`);
      if (set) this.heroSheets.set(v, set);
    }
    for (const c of CREATURE_IDS) {
      const set = await this.loadSet(`/sprites/${c}`);
      if (set) this.creatureSheets.set(c, set);
    }
  }

  /** carrega o SheetSet de um id (idle obrigatório; walk/attack se existirem). */
  private async loadSet(base: string): Promise<SheetSet | null> {
    const idle = await this.loadSheet(`${base}.idle`);
    if (!idle) return null; // sem idle → fallback procedural
    const [walk, attack, hurt, death] = await Promise.all([
      this.loadSheet(`${base}.walk`),
      this.loadSheet(`${base}.attack`),
      this.loadSheet(`${base}.hurt`),
      this.loadSheet(`${base}.death`),
    ]);
    return {
      idle,
      walk: walk ?? undefined,
      attack: attack ?? undefined,
      hurt: hurt ?? undefined,
      death: death ?? undefined,
    };
  }

  /** carrega um spritesheet Pixi da Forja (PNG + JSON co-localizados). null se não existir. */
  private async loadSheet(base: string): Promise<Spritesheet | null> {
    try {
      const res = await fetch(`${base}.json`);
      if (!res.ok) return null;
      const data = await res.json();
      const texture = await Assets.load(`${base}.png`);
      texture.source.scaleMode = "nearest";
      const sheet = new Spritesheet(texture, data);
      await sheet.parse();
      return sheet;
    } catch {
      return null;
    }
  }

  private sheetFor(e: CombatEntity): SheetSet | undefined {
    // herói knight vestindo um SET → usa o sheet da armadura no lugar do corpo base
    if (e.kind === "hero" && e.vocation === "knight" && this.heroSetOverride) return this.heroSetOverride;
    return e.kind === "hero"
      ? this.heroSheets.get(e.vocation ?? "")
      : this.creatureSheets.get(slug(e.name));
  }

  /** veste o herói conforme as PEÇAS equipadas (paper-doll em sprites):
   *  · nenhuma peça → corpo base (sheet padrão do knight);
   *  · set COMPLETO de mesmo tier → usa o bake full-set (oclusão entre peças perfeita);
   *  · combo misto → COMPÕE as camadas bakeadas (base-<slot> / set<N>-<slot>) num canvas
   *    (pipeline build-player-layers: camadas pixel-alinhadas por frame). */
  async setHeroPieces(pieces: HeroPieces | null) {
    const key = pieces ? JSON.stringify(pieces) : "none";
    if (key === this.currentPiecesKey) return;
    this.currentPiecesKey = key;
    const armor = pieces ? [pieces.helm, pieces.armor, pieces.pants, pieces.gloves, pieces.boots] : [];
    const hasWeapon = !!pieces && (pieces.weaponR != null || pieces.weaponL != null);
    if (!pieces || (armor.every((v) => v == null) && !hasWeapon)) {
      this.heroSetOverride = null; // corpo base
      this.reskinKnights();
      return;
    }
    if (!hasWeapon && armor.every((v) => v != null && v === armor[0])) {
      // set completo SEM arma: o render inteiriço é superior (sem emendas entre camadas)
      const n = armor[0]!;
      if (!this.setSheets.has(n)) this.setSheets.set(n, await this.loadSet(`/sprites/set-${n}`));
      const full = this.setSheets.get(n) ?? null;
      if (full) {
        this.heroSetOverride = full;
        this.reskinKnights();
        return;
      }
    }
    if (!this.pieceSheets.has(key)) this.pieceSheets.set(key, await this.composeLayers(pieces));
    this.heroSetOverride = this.pieceSheets.get(key) ?? null;
    this.reskinKnights();
  }

  /** compõe o SheetSet do herói empilhando camadas bakeadas num canvas (por estado).
   *  Ordem de pintura (baixo→cima): calça, bota, peito, luva, elmo. Peça sem camada
   *  bakeada cai pra camada base (corpo nu daquele slot). null = camadas indisponíveis. */
  private async composeLayers(pieces: HeroPieces): Promise<SheetSet | null> {
    const BASE = "/sprites/layers/dk";
    if (this.layerManifest === undefined) {
      try {
        const res = await fetch(`${BASE}/manifest.json`);
        this.layerManifest = res.ok ? await res.json() : null;
      } catch {
        this.layerManifest = null;
      }
    }
    const man = this.layerManifest;
    if (!man) return null;
    const layerFor = (slot: keyof HeroPieces) => {
      const n = pieces[slot];
      const name = n != null ? `set${n}-${slot}` : `base-${slot}`;
      return man.layers.includes(name) ? name : `base-${slot}`;
    };
    // ordem de pintura das camadas (baixo→cima); ARMAS por último (na frente do corpo)
    const order: ("pants" | "boots" | "armor" | "gloves" | "helm")[] = ["pants", "boots", "armor", "gloves", "helm"];
    const layers = order.map(layerFor);
    for (const w of [pieces.weaponL, pieces.weaponR]) {
      if (w != null && man.layers.includes(`wpn-${w}`)) layers.push(`wpn-${w}`);
    }
    const out: Partial<SheetSet> = {};
    for (const state of ["idle", "walk", "attack"] as const) {
      try {
        // geometria idêntica entre camadas → o json de QUALQUER uma serve de atlas
        const dataRes = await fetch(`${BASE}/${layers[0]}.${state}.json`);
        if (!dataRes.ok) throw new Error("json");
        const data = await dataRes.json();
        const imgs = await Promise.all(
          layers.map(async (l) => createImageBitmap(await (await fetch(`${BASE}/${l}.${state}.png`)).blob())),
        );
        const canvas = document.createElement("canvas");
        canvas.width = imgs[0].width;
        canvas.height = imgs[0].height;
        const ctx = canvas.getContext("2d")!;
        for (const img of imgs) ctx.drawImage(img, 0, 0);
        const tex = Texture.from(canvas);
        tex.source.scaleMode = "nearest";
        const sheet = new Spritesheet(tex, data);
        await sheet.parse();
        out[state] = sheet;
      } catch {
        if (state === "idle") return null; // sem idle não há composição
      }
    }
    return out.idle ? (out as SheetSet) : null;
  }

  /** re-skina o(s) knight(s) já em cena preservando estado+direção (sombra/HP seguem). */
  private reskinKnights() {
    for (const s of this.sprites.values()) {
      if (s.entity.kind !== "hero" || s.entity.vocation !== "knight" || !s.anim || s.dying) continue;
      const st = s.state ?? "idle";
      s.state = undefined; // força o setAnim a reaplicar as texturas do novo sheet
      this.setAnim(s, st, s.facing);
      if (s.shadow) {
        s.shadow.clear();
        s.shadow.ellipse(0, GROUND_Y, Math.max(10, s.anim.width * 0.36), 6).fill({ color: 0x000000, alpha: 0.3 });
      }
      s.hpWrap.position.set(0, GROUND_Y - s.anim.height - 8);
    }
  }

  /** define estado (idle/walk/attack) + direção do sprite, trocando as texturas do sheet
   *  correspondente. idle/walk em laço; attack uma vez → volta pro repouso. Mudar só a
   *  direção (mesmo estado) preserva o frame atual (passo contínuo ao virar). */
  private setAnim(s: Sprite, state: "idle" | "walk" | "attack", facing?: string) {
    if (!s.anim || s.dying) return;
    const set = this.sheetFor(s.entity);
    if (!set) return;
    const f = facing ?? s.facing;
    // fallback: walk/attack ausentes → usa idle
    const sheet = state === "attack" ? (set.attack ?? set.idle) : state === "walk" ? (set.walk ?? set.idle) : set.idle;
    const realState = state === "attack" && !set.attack ? "idle" : state === "walk" && !set.walk ? "idle" : state;
    if (s.state === realState && s.facing === f) return;
    const anims = sheet.animations[f] ?? sheet.animations[FACING];
    if (!anims) return;
    const keepFrame = s.state === realState; // só virou de direção → mantém o passo
    const cur = s.anim.currentFrame;
    s.state = realState;
    s.facing = f;
    s.anim.textures = anims;
    s.anim.loop = realState !== "attack";
    s.anim.animationSpeed = sheetSpeed(sheet, realState === "attack" ? 12 : realState === "walk" ? 10 : 6);
    if (realState === "attack") {
      s.anim.onComplete = () => this.setAnim(s, "idle", this.restFacingFor(s));
      s.anim.gotoAndPlay(0);
    } else {
      s.anim.onComplete = () => {};
      s.anim.gotoAndPlay(keepFrame ? Math.min(cur, anims.length - 1) : 0);
    }
  }

  // ── sprites ────────────────────────────────────────────────────────────────
  private makeSprite(e: CombatEntity): Sprite {
    const root = new Container();

    // entidade com sprite real da Forja → AnimatedSprite; senão figura procedural
    const set = this.sheetFor(e);
    const scale = actorScale(e);
    // encara a direção da MARCHA (herói entra da esquerda → leste; monstro da direita → oeste)
    const facing = restFacing(e);
    const body = new Graphics();
    let anim: AnimatedSprite | undefined;
    let shadow: Graphics | undefined;
    if (set) {
      const walkSheet = set.walk ?? set.idle;
      anim = new AnimatedSprite(walkSheet.animations[facing] ?? set.idle.animations[FACING]);
      anim.anchor.set(0.5, 1); // âncora no pé (o sprite já preenche a célula)
      anim.position.set(0, GROUND_Y); // pé na linha do chão
      anim.scale.set(scale);
      anim.roundPixels = true; // snap no grid de pixels físicos → sem sub-pixel borrado
      anim.animationSpeed = sheetSpeed(walkSheet, 10);
      anim.play();
      // sombra elíptica no pé — largura derivada da LARGURA REAL do sprite (nativo)
      shadow = new Graphics();
      shadow.ellipse(0, GROUND_Y, Math.max(10, anim.width * 0.36), 6).fill({ color: 0x000000, alpha: 0.3 });
    } else {
      this.paintBody(body, e);
    }

    // barra de hp + rótulo — acima da cabeça (derivada da ALTURA REAL do sprite nativo)
    const headY = anim ? GROUND_Y - anim.height - 8 : -TILE * 0.55;
    const hpWrap = new Container();
    const hpBg = new Graphics().rect(-12, 0, 24, 4).fill(0x000000);
    const hpFill = new Graphics().rect(-11, 1, 22, 2).fill(0x6fbf73);
    hpWrap.addChild(hpBg, hpFill);
    hpWrap.position.set(0, headY);

    const label = new Text({
      text: e.kind === "hero" ? e.name : "",
      style: { fontFamily: "monospace", fontSize: 7, fill: 0xe8ddc9, align: "center" },
    });
    label.anchor.set(0.5);
    label.position.set(0, headY - 8);

    if (shadow) root.addChild(shadow); // atrás do corpo
    root.addChild(anim ?? body, hpWrap, label);
    // SURGE NA BORDA e MARCHA até seu lugar. Herói: entra pela esquerda (a party acampa
    // no centro). Monstro: SPAWN RADIAL — entra pela borda NA DIREÇÃO do seu ponto no
    // anel (visto do centro da party) e marcha pra dentro até a distância de combate;
    // assim as criaturas nascem AO REDOR do grupo, como no MU.
    const px = this.tileToPx(e.tile);
    let enterX: number, enterY: number;
    if (e.kind === "hero") {
      enterX = -TILE * 1.5;
      enterY = px.y;
    } else {
      const c = this.battleCenter();
      let dx = px.x - c.x, dy = px.y - c.y;
      const len = Math.hypot(dx, dy);
      if (len < 1) { dx = 1; dy = 0; } else { dx /= len; dy /= len; }
      // empurra o ponto de entrada ~5.5 tiles pra FORA ao longo do raio → nasce na borda
      enterX = px.x + dx * TILE * 5.5;
      enterY = px.y + dy * TILE * 5.5;
    }
    root.position.set(enterX, enterY);
    this.entityLayer.addChild(root);

    return { root, body, anim, state: anim ? "walk" : undefined, facing, hpFill, hpWrap, entity: e, wx: enterX, wy: enterY, ox: 0, oy: 0, flash: 0, bobPhase: Math.random() * Math.PI * 2, scale, shadow };
  }

  /** centro da área de batalha em px do mundo (onde a party acampa) */
  private battleCenter() {
    return { x: this.battle.x + this.battle.w / 2, y: this.battle.y + this.battle.h / 2 };
  }

  /** facing de repouso REAL: herói encara leste; monstro encara o CENTRO da party
   *  (nasceu ao redor → olha pra dentro, de frente pro grupo). */
  private restFacingFor(s: Sprite): string {
    if (s.entity.kind === "hero") return "east";
    const c = this.battleCenter();
    return facingOf(c.x - s.wx, c.y - s.wy);
  }

  /** figura pixel simples: sombra + corpo + cabeça + dica de arma / olhos */
  private paintBody(g: Graphics, e: CombatEntity) {
    g.clear();
    const col = e.color;
    const dark = mix(col, 0x000000, 0.45);
    if (e.kind === "hero") {
      // pernas
      g.rect(-5, 4, 3, 6).fill(dark);
      g.rect(2, 4, 3, 6).fill(dark);
      // corpo
      g.roundRect(-7, -6, 14, 12, 2).fill(col).stroke({ width: 1, color: dark });
      // cabeça
      g.circle(0, -11, 5).fill(0xe8c9a0).stroke({ width: 1, color: dark });
      // arma por vocação
      switch (e.vocation) {
        case "knight": // espada + escudo
          g.rect(7, -10, 2, 16).fill(0xd9d9d9).stroke({ width: 1, color: 0x555555 });
          g.roundRect(-11, -4, 5, 9, 1).fill(0x8a6a3a).stroke({ width: 1, color: dark });
          break;
        case "ranger": // arco
          g.rect(8, -12, 2, 20).fill(0x8a6a3a);
          break;
        case "sorcerer": // cajado com orbe
          g.rect(8, -14, 2, 22).fill(0x6a4a2a);
          g.circle(9, -15, 4).fill(0x66ccff).stroke({ width: 1, color: 0x2a6a8a });
          break;
        case "cleric": // cajado dourado
          g.rect(8, -13, 2, 20).fill(0xb8923a);
          g.rect(6, -14, 6, 2).fill(0xf2c14e);
          break;
      }
    } else {
      // monstro: massa com olhos
      g.roundRect(-9, -8, 18, 16, 5).fill(col).stroke({ width: 1, color: dark });
      g.circle(-3, -2, 2).fill(0x000000);
      g.circle(4, -2, 2).fill(0x000000);
      g.circle(-3, -2.5, 0.7).fill(0xffffff);
      g.circle(4, -2.5, 0.7).fill(0xffffff);
      // presas
      g.rect(-4, 4, 2, 3).fill(0xffffff);
      g.rect(2, 4, 2, 3).fill(0xffffff);
    }
  }

  // ── eventos do engine ────────────────────────────────────────────────────
  handleEvent(ev: EngineEvent) {
    if (!this.ready) return;
    if (ev.type === "spawn") {
      if (!this.sprites.has(ev.entity.id)) {
        // makeSprite já posiciona na borda em estado "walk"; o update() faz a MARCHA
        // até o tile de combate (andar animado) e vira idle ao chegar.
        this.sprites.set(ev.entity.id, this.makeSprite(ev.entity));
      }
      return;
    }
    if (ev.type === "death") {
      const s = this.sprites.get(ev.id);
      if (!s) return;
      const set = this.sheetFor(s.entity);
      if (s.anim && set?.death) {
        // toca a animação de morte (uma vez) e só então remove + ✦
        s.dying = true;
        s.flash = 0;
        s.hpWrap.visible = false;
        s.anim.textures = set.death.animations[s.facing] ?? set.death.animations[FACING];
        s.anim.loop = false;
        s.anim.animationSpeed = sheetSpeed(set.death, 10);
        s.anim.gotoAndPlay(0);
        s.anim.onComplete = () => {
          this.addFloat(s.root.x, s.root.y - 10, "✦", 0xf2c14e, false);
          this.removeSprite(ev.id);
        };
      } else {
        this.addFloat(s.root.x, s.root.y - 10, "✦", 0xf2c14e, false);
        this.removeSprite(ev.id);
      }
      return;
    }
    if (ev.type === "hit") {
      const src = this.sprites.get(ev.sourceId);
      const tgt = this.sprites.get(ev.targetId);
      if (!tgt) return;
      // texto flutuante
      if (ev.kind === "heal") {
        this.addFloat(tgt.root.x, tgt.root.y - 14, `+${ev.amount}`, 0x8fe38f, false);
      } else if (ev.kind === "crit") {
        this.addFloat(tgt.root.x, tgt.root.y - 16, `${ev.amount}!`, 0xffd257, true);
      } else {
        this.addFloat(
          tgt.root.x,
          tgt.root.y - 14,
          `${ev.amount}`,
          ev.kind === "magic" ? 0x9ad0ff : 0xffffff,
          false,
        );
      }
      if (ev.kind !== "heal" && !tgt.dying) tgt.flash = 120;
      // animação da fonte — só ataca depois de CHEGAR na linha (não interrompe a marcha)
      if (src && !src.dying && src.state !== "walk") {
        const face = facingOf(tgt.wx - src.wx, tgt.wy - src.wy); // encara o alvo ao golpear
        if (src.anim) this.setAnim(src, "attack", face);
        const melee = src.entity.vocation === "knight" || src.entity.kind === "monster";
        if (melee) {
          const dx = Math.sign(tgt.wx - src.wx) || 1;
          src.ox = dx * 7; // lunge no corpo a corpo
        } else {
          // ranged: além da anim de conjurar/atirar, cospe o projétil
          const color =
            ev.kind === "heal" ? 0x8fe38f : ev.kind === "magic" ? 0x66ccff : 0xd9c27a;
          this.addProjectile(src.root.x, src.root.y - 6, tgt.root.x, tgt.root.y - 6, color);
        }
      }
      return;
    }
  }

  private removeSprite(id: string) {
    const s = this.sprites.get(id);
    if (!s) return;
    s.root.destroy({ children: true });
    this.sprites.delete(id);
  }

  private addFloat(x: number, y: number, text: string, color: number, big: boolean) {
    const t = new Text({
      text,
      style: {
        fontFamily: "monospace",
        fontSize: big ? 15 : 10,
        fontWeight: "bold",
        fill: color,
        stroke: { color: 0x000000, width: 3 },
      },
    });
    t.anchor.set(0.5);
    t.position.set(x + (Math.random() * 8 - 4), y);
    this.fxLayer.addChild(t);
    this.floats.push({ t, life: 0, max: big ? 900 : 700, vy: big ? -0.03 : -0.025 });
  }

  private addProjectile(fx: number, fy: number, tx: number, ty: number, color: number) {
    const g = new Graphics().circle(0, 0, 2.4).fill(color).stroke({ width: 1, color: 0x000000, alpha: 0.6 });
    g.position.set(fx, fy);
    this.fxLayer.addChild(g);
    this.projectiles.push({ g, fx, fy, tx, ty, t: 0, dur: 160 });
  }

  /** posições/hp a cada frame (reconciliação com o estado do engine) */
  sync(heroes: CombatEntity[], monsters: CombatEntity[]) {
    if (!this.ready) return;
    const alive = new Set<string>();
    for (const e of [...heroes, ...monsters]) {
      alive.add(e.id);
      let s = this.sprites.get(e.id);
      if (!s) {
        s = this.makeSprite(e);
        this.sprites.set(e.id, s);
      }
      s.entity = e;
      const ratio = Math.max(0, e.hp / e.maxHp);
      s.hpFill.width = 22 * ratio;
      s.hpFill.tint = e.kind === "hero" ? 0x6fbf73 : mixTint(ratio);
      s.hpWrap.visible = e.kind === "monster" || ratio < 1;
    }
    // remove sprites órfãos (heróis nunca somem; monstros saem por death)
    for (const id of [...this.sprites.keys()]) {
      if (!alive.has(id) && id.startsWith("hero_")) this.removeSprite(id);
    }
  }

  private update(dt: number) {
    this.time += dt;
    for (const s of this.sprites.values()) {
      s.ox *= Math.pow(0.001, dt / 1000); // decay do lunge de ataque
      if (Math.abs(s.ox) < 0.2) s.ox = 0;
      // ── MARCHA até a linha de combate: passo de velocidade CONSTANTE (sem lerp/ease)
      // em direção ao px do tile. Toca walk enquanto anda; ao chegar (<1.5px) vira idle
      // encarando o inimigo. Morrendo → congela no lugar.
      const px = this.tileToPx(s.entity.tile);
      let bob = 0;
      if (!s.dying) {
        const dx = px.x - s.wx, dy = px.y - s.wy, dist = Math.hypot(dx, dy);
        if (dist > 1.5) {
          const step = Math.min(dist, (WALK_SPEED * dt) / 1000);
          s.wx += (dx / dist) * step;
          s.wy += (dy / dist) * step;
          if (s.state !== "attack") this.setAnim(s, "walk", facingOf(dx, dy));
        } else {
          s.wx = px.x; s.wy = px.y;
          if (s.state === "walk") this.setAnim(s, "idle", this.restFacingFor(s)); // chegou → encara a party
          // respiração: bob de PIXEL INTEIRO só parado e vivo (feet-anchored, pixel-perfect)
          if (s.anim && s.state === "idle") bob = Math.round(Math.sin(this.time / 620 + s.bobPhase) * 1.5) - 1;
        }
      }
      s.root.position.set(Math.round(s.wx + s.ox), Math.round(s.wy + s.oy + bob));
      const node = s.anim ?? s.body;
      if (s.flash > 0) {
        s.flash -= dt;
        node.tint = 0xff6666;
      } else {
        node.tint = 0xffffff;
      }
    }
    // floats
    for (const f of this.floats) {
      f.life += dt;
      f.t.y += f.vy * dt;
      f.t.alpha = 1 - f.life / f.max;
    }
    this.floats = this.floats.filter((f) => {
      if (f.life >= f.max) {
        f.t.destroy();
        return false;
      }
      return true;
    });
    // projéteis
    for (const p of this.projectiles) {
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      p.g.position.set(p.fx + (p.tx - p.fx) * k, p.fy + (p.ty - p.fy) * k - Math.sin(k * Math.PI) * 8);
    }
    this.projectiles = this.projectiles.filter((p) => {
      if (p.t >= p.dur) {
        p.g.destroy();
        return false;
      }
      return true;
    });
  }

  destroy() {
    this.ro?.disconnect();
    this.app.destroy(true, { children: true });
  }
}

/** velocidade de animação vinda do fps do sheet da Forja (meta.fps), /60 pro Pixi */
function sheetSpeed(sheet: Spritesheet, fallbackFps: number): number {
  const fps = (sheet.data.meta as { fps?: number }).fps ?? fallbackFps;
  return fps / 60;
}

// util de cor
function mix(a: number, b: number, t: number) {
  const ar = (a >> 16) & 255,
    ag = (a >> 8) & 255,
    ab = a & 255;
  const br = (b >> 16) & 255,
    bg = (b >> 8) & 255,
    bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
function mixTint(ratio: number) {
  // verde → amarelo → vermelho conforme hp cai
  if (ratio > 0.5) return mix(0xffd257, 0x6fbf73, (ratio - 0.5) * 2);
  return mix(0xd14b3a, 0xffd257, ratio * 2);
}
