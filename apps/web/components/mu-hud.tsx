"use client";

/**
 * mu-hud.tsx — BARRA DE COMANDO do MU Online (base da tela), montada FIEL ao cliente.
 *
 * Fonte de layout = AUTORITATIVA (não "no olho"): coordenadas de `NewUIMainFrameWindow.cpp`
 * do MuMain (S6), documentadas em tools/mu/hud-coords.md. A barra é UM fundo único
 * (`hud-bar.png` = strips newui_menu01/02/03 montados = 640×51, via tools/mu/build-hud-bar.mjs);
 * as joias HP/Mana vivem DENTRO dos sockets do próprio strip (não flutuam), drenando pelo topo;
 * os slots de skill são as molduras reais do strip; a barra de EXP fica na faixa inferior.
 * Dados 100% do motor MU via EngineSnapshot.
 */
import { VOCATIONS, type VocationId } from "@pixel-idle/shared";
import type { EngineSnapshot } from "@/game/NetClient";

const HUD = "/ui/mu/hud";
const BOX = { w: 640, h: 51 }; // caixa nativa da barra (coords do .cpp são relativas a ela)
// posições dos overlays dinâmicos (rel. à caixa 640×51) — de hud-coords.md
const COORD = {
  hpGem: { x: 158, y: 6, w: 45, h: 39 },
  manaGem: { x: 445, y: 6, w: 45, h: 39 },
  exp: { x: 221, y: 45, w: 198, h: 4 },
};
const fmt = (n: number) => (n >= 1e4 ? (n / 1e3).toFixed(1) + "k" : String(Math.round(n)));
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
// converte um rect da caixa nativa em % (pra sobrepor sobre a barra escalada)
const pct = (r: { x: number; y: number; w: number; h: number }) => ({
  left: `${(r.x / BOX.w) * 100}%`,
  top: `${(r.y / BOX.h) * 100}%`,
  width: `${(r.w / BOX.w) * 100}%`,
  height: `${(r.h / BOX.h) * 100}%`,
});

/** joia de recurso: a textura real do MU no socket do strip; um véu escuro cobre o topo
 *  (1-ratio) → drena de cima pra baixo, como no cliente. Valor sobreposto. */
function Gem({ cur, max, img, rect, label }: { cur: number; max: number; img: string; rect: typeof COORD.hpGem; label: string }) {
  const ratio = max > 0 ? clamp01(cur / max) : 0;
  return (
    <div className="mu-gem" style={pct(rect)} title={`${label}: ${Math.round(cur)} / ${Math.round(max)}`}>
      <img className="mu-gem-img" src={`${HUD}/${img}`} alt="" draggable={false} />
      <div className="mu-gem-drain" style={{ height: `${Math.round((1 - ratio) * 100)}%` }} />
      <span className="mu-gem-val tabular">{fmt(cur)}</span>
    </div>
  );
}

export function MuStatusBar({
  snap,
  you,
  onOpenChar,
}: {
  snap: EngineSnapshot;
  you: VocationId;
  onOpenChar: () => void;
}) {
  const voc = VOCATIONS[you];
  const sheet = snap.sheet;
  const me = snap.heroes.find((h) => h.vocation === you);
  const hp = sheet?.hp ?? me?.hp ?? 0;
  const maxHp = sheet?.derived.maxHp ?? me?.maxHp ?? 1;
  const maxMana = sheet?.derived.maxMana ?? 0;
  const xpRatio = snap.levelInfo.xpToNext > 0 ? clamp01(snap.levelInfo.xp / snap.levelInfo.xpToNext) : 0;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-center pb-2">
      <div className="mu-statusbar pointer-events-auto" style={{ aspectRatio: `${BOX.w} / ${BOX.h}` }}>
        {/* barra = strips reais do cliente (fundo único) */}
        <img className="mu-bar-bg" src={`${HUD}/hud-bar.png`} alt="" draggable={false} />

        {/* crista da classe (abre Personagem/C) — canto esquerdo */}
        <button className="mu-crest" onClick={onOpenChar} title="Personagem & Inventário (C)" style={{ background: voc.accent }}>
          {voc.name[0]}
        </button>

        {/* joias HP/Mana dentro dos sockets do strip */}
        <Gem cur={hp} max={maxHp} img="hp-orb.png" rect={COORD.hpGem} label="HP" />
        <Gem cur={maxMana} max={maxMana || 1} img="mana-orb.png" rect={COORD.manaGem} label="MP" />

        {/* barra de experiência na faixa inferior */}
        <div className="mu-expbar" style={pct(COORD.exp)} title={`EXP ${Math.round(xpRatio * 100)}%`}>
          <div className="mu-expbar-fill" style={{ width: `${Math.round(xpRatio * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}
