/**
 * HuntScene — RENDER puro (PixiJS 8). Não simula nada: recebe entidades +
 * eventos (do MockEngine hoje, do servidor amanhã) e desenha. Piso em tiles do
 * bioma, heróis em formação, monstros, ataques, damage numbers e barras de HP.
 */

import { Application, Container, Graphics, Text, Assets, AnimatedSprite, Spritesheet } from "pixi.js";
import type { CombatEntity, RegionDef } from "@pixel-idle/shared";
import type { EngineEvent } from "./MockEngine";
import { GRID } from "./MockEngine";

const TILE = 32;
const WORLD_W = GRID.w * TILE;
const WORLD_H = GRID.h * TILE;
const HERO_SPRITE_SCALE = 0.62; // 64px → ~40px (um pouco maior que um tile)

interface Sprite {
  root: Container;
  body: Graphics;
  anim?: AnimatedSprite; // sprite real (ex: knight) — quando existe, substitui o body
  state?: "idle" | "attack";
  hpFill: Graphics;
  hpWrap: Container;
  entity: CombatEntity;
  ox: number; // deslocamento de lunge
  oy: number;
  flash: number;
}

/** direção de spritesheet (linha) por facing — heróis encaram leste (monstros à direita) */
type SheetSet = { idle: Spritesheet; walk: Spritesheet; attack: Spritesheet };

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

const tileToPx = (t: { x: number; y: number }) => ({
  x: t.x * TILE + TILE / 2,
  y: t.y * TILE + TILE / 2,
});

export class HuntScene {
  private app = new Application();
  private world = new Container();
  private floorLayer = new Container();
  private shadowLayer = new Container();
  private entityLayer = new Container();
  private fxLayer = new Container();
  private sprites = new Map<string, Sprite>();
  private floats: Float[] = [];
  private projectiles: Projectile[] = [];
  private region!: RegionDef;
  private host!: HTMLElement;
  private ro?: ResizeObserver;
  private ready = false;
  private knight?: SheetSet; // sprites reais da Forja (idle/walk/attack)

  async init(host: HTMLElement, region: RegionDef) {
    this.host = host;
    this.region = region;
    await this.app.init({
      antialias: false,
      roundPixels: true,
      backgroundColor: region.palette.bg,
      resolution: 1,
      resizeTo: host,
    });
    host.appendChild(this.app.canvas);

    await this.loadSprites();

    this.world.addChild(this.floorLayer, this.shadowLayer, this.entityLayer, this.fxLayer);
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
    const scale = Math.min(w / WORLD_W, h / WORLD_H);
    this.world.scale.set(scale);
    this.world.position.set((w - WORLD_W * scale) / 2, (h - WORLD_H * scale) / 2);
  }

  setRegion(region: RegionDef) {
    this.region = region;
    if (this.app.renderer) this.app.renderer.background.color = region.palette.bg;
    this.drawFloor();
  }

  private drawFloor() {
    this.floorLayer.removeChildren();
    const { floorA, floorB, accent } = this.region.palette;
    const g = new Graphics();
    for (let y = 0; y < GRID.h; y++) {
      for (let x = 0; x < GRID.w; x++) {
        const c = (x + y) % 2 === 0 ? floorA : floorB;
        g.rect(x * TILE, y * TILE, TILE, TILE).fill(c);
      }
    }
    // specks de detalhe (pixel-dithering barato)
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
    // moldura
    g.rect(0, 0, WORLD_W, WORLD_H).stroke({ width: 2, color: 0x000000, alpha: 0.5 });
    this.floorLayer.addChild(g);
  }

  // ── carregamento de sprites reais (saída da Forja) ──────────────────────────
  private async loadSprites() {
    try {
      const [idle, walk, attack] = await Promise.all([
        this.loadSheet("/sprites/knight.idle"),
        this.loadSheet("/sprites/knight.walk"),
        this.loadSheet("/sprites/knight.attack"),
      ]);
      this.knight = { idle, walk, attack };
    } catch (err) {
      // sem sprites → cai no fallback procedural (paintBody). Não quebra a cena.
      console.warn("[HuntScene] sprites do knight não carregaram, usando fallback:", err);
    }
  }

  /** carrega um spritesheet Pixi da Forja (PNG + JSON co-localizados), nearest-scale. */
  private async loadSheet(base: string): Promise<Spritesheet> {
    const data = await (await fetch(`${base}.json`)).json();
    const texture = await Assets.load(`${base}.png`);
    texture.source.scaleMode = "nearest";
    const sheet = new Spritesheet(texture, data);
    await sheet.parse();
    return sheet;
  }

  /** troca o estado de animação de um sprite real (idle laço / attack uma vez). */
  private playState(s: Sprite, state: "idle" | "attack") {
    if (!s.anim || !this.knight || s.state === state) return;
    s.state = state;
    const set = this.knight;
    if (state === "attack") {
      s.anim.textures = set.attack.animations.east;
      s.anim.loop = false;
      s.anim.animationSpeed = 10 / 60;
      s.anim.gotoAndPlay(0);
      s.anim.onComplete = () => this.playState(s, "idle");
    } else {
      s.anim.textures = set.idle.animations.east;
      s.anim.loop = true;
      s.anim.animationSpeed = 2 / 60;
      s.anim.onComplete = () => {};
      s.anim.gotoAndPlay(0);
    }
  }

  // ── sprites ────────────────────────────────────────────────────────────────
  private makeSprite(e: CombatEntity): Sprite {
    const root = new Container();
    const shadow = new Graphics().ellipse(0, TILE * 0.42, 11, 4).fill({ color: 0x000000, alpha: 0.35 });
    this.shadowLayer.addChild(shadow);

    // knight tem sprite real (Forja); resto usa figura procedural
    const body = new Graphics();
    let anim: AnimatedSprite | undefined;
    if (e.vocation === "knight" && this.knight) {
      anim = new AnimatedSprite(this.knight.idle.animations.east);
      anim.anchor.set(0.5, 1); // âncora no pé
      anim.position.set(0, TILE * 0.5); // pés na base do tile
      anim.scale.set(HERO_SPRITE_SCALE);
      anim.animationSpeed = 2 / 60;
      anim.play();
    } else {
      this.paintBody(body, e);
    }

    // barra de hp
    const hpWrap = new Container();
    const hpBg = new Graphics().rect(-12, -TILE * 0.55, 24, 4).fill(0x000000);
    const hpFill = new Graphics().rect(-11, -TILE * 0.55 + 1, 22, 2).fill(0x6fbf73);
    hpWrap.addChild(hpBg, hpFill);

    const label = new Text({
      text: e.kind === "hero" ? e.name : "",
      style: { fontFamily: "monospace", fontSize: 7, fill: 0xe8ddc9, align: "center" },
    });
    label.anchor.set(0.5);
    label.position.set(0, -TILE * 0.72);

    root.addChild(anim ?? body, hpWrap, label);
    const px = tileToPx(e.tile);
    root.position.set(px.x, px.y);
    this.entityLayer.addChild(root);

    // shadow segue o root
    (root as Container & { _shadow?: Graphics })._shadow = shadow;

    return { root, body, anim, state: anim ? "idle" : undefined, hpFill, hpWrap, entity: e, ox: 0, oy: 0, flash: 0 };
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
      if (!this.sprites.has(ev.entity.id)) this.sprites.set(ev.entity.id, this.makeSprite(ev.entity));
      return;
    }
    if (ev.type === "death") {
      const s = this.sprites.get(ev.id);
      if (s) {
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
      if (ev.kind !== "heal") tgt.flash = 120;
      // animação da fonte
      if (src) {
        const melee = src.entity.vocation === "knight" || src.entity.kind === "monster";
        if (melee) {
          const dx = Math.sign(tgt.root.x - src.root.x) || 1;
          src.ox = dx * 7;
          if (src.anim) this.playState(src, "attack"); // knight: toca o ataque real
        } else {
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
    const shadow = (s.root as Container & { _shadow?: Graphics })._shadow;
    if (shadow) shadow.destroy();
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
    // lunge decay + flash
    for (const s of this.sprites.values()) {
      s.ox *= Math.pow(0.001, dt / 1000);
      if (Math.abs(s.ox) < 0.2) s.ox = 0;
      const px = tileToPx(s.entity.tile);
      s.root.position.set(px.x + s.ox, px.y + s.oy);
      const shadow = (s.root as Container & { _shadow?: Graphics })._shadow;
      if (shadow) shadow.position.set(px.x, px.y);
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
