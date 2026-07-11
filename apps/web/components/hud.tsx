"use client";

import { useState } from "react";
import {
  RARITY_COLOR,
  REGIONS,
  VOCATIONS,
  type CombatEntity,
  type VocationId,
} from "@pixel-idle/shared";
import type { EngineSnapshot } from "@/game/MockEngine";

const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");
const fmt = (n: number) =>
  n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(Math.floor(n));

// ─── Top bar ─────────────────────────────────────────────────────────────────
export function TopBar({ snap, you }: { snap: EngineSnapshot; you: VocationId }) {
  const { levelInfo, region } = snap;
  const voc = VOCATIONS[you];
  const xpPct = Math.min(100, (levelInfo.xp / levelInfo.xpToNext) * 100);
  return (
    <header className="flex items-center gap-4 border-b border-[var(--hud-line)] bg-[#171309] px-4 py-2">
      <div className="font-fantasy text-lg text-[var(--hud-gold)]">Pixel Idle</div>
      <div className="mx-2 h-8 w-px bg-[var(--hud-line)]" />

      {/* personagem */}
      <div className="flex items-center gap-2">
        <div
          className="grid h-8 w-8 place-items-center rounded-sm text-xs font-bold text-black"
          style={{ background: voc.accent }}
          title={voc.role}
        >
          {voc.name[0]}
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Ashen</div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-400">
            {voc.name} · nv {levelInfo.level}
          </div>
        </div>
      </div>

      {/* xp */}
      <div className="min-w-[180px] flex-1 max-w-md">
        <div className="mb-0.5 flex justify-between text-[10px] text-neutral-400">
          <span>XP</span>
          <span className="tabular">
            {fmt(levelInfo.xp)} / {fmt(levelInfo.xpToNext)} · {xpPct.toFixed(1)}%
          </span>
        </div>
        <div className="bar h-2">
          <span style={{ width: `${xpPct}%`, background: "linear-gradient(90deg,#b8923a,#f2c14e)" }} />
        </div>
      </div>

      <Stat label="Ouro" value={fmt(levelInfo.gold)} color="#f2c14e" />
      <Stat label="XP/h" value={fmt(snap.xpPerHour)} color="#9ad0ff" />
      <div className="ml-auto text-right">
        <div className="text-[10px] uppercase tracking-wider text-neutral-400">Região</div>
        <div className="text-sm text-[var(--hud-gold)]">{region.city}</div>
      </div>
    </header>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-right leading-tight">
      <div className="text-[10px] uppercase tracking-wider text-neutral-400">{label}</div>
      <div className="tabular text-sm font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

// ─── Party ───────────────────────────────────────────────────────────────────
export function PartyPanel({ snap, you }: { snap: EngineSnapshot; you: VocationId }) {
  return (
    <section className="panel flex flex-col">
      <div className="panel-header px-3 py-1.5">Grupo · 4/4</div>
      <div className="flex flex-col gap-1 p-2">
        {snap.heroes.map((h) => (
          <PartyMember key={h.id} hero={h} isYou={h.vocation === you} />
        ))}
      </div>
    </section>
  );
}

function PartyMember({ hero, isYou }: { hero: CombatEntity; isYou: boolean }) {
  const voc = hero.vocation ? VOCATIONS[hero.vocation] : undefined;
  const pct = Math.max(0, (hero.hp / hero.maxHp) * 100);
  return (
    <div
      className={`flex items-center gap-2 rounded-sm px-2 py-1.5 ${
        isYou ? "bg-[#2a2314] ring-1 ring-[var(--hud-gold)]/40" : "bg-black/20"
      }`}
    >
      <div
        className="grid h-7 w-7 shrink-0 place-items-center rounded-sm text-xs font-bold text-black"
        style={{ background: voc?.accent }}
      >
        {voc?.name[0]}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between text-xs">
          <span className="truncate font-medium">
            {voc?.name} {isYou && <span className="text-[9px] text-[var(--hud-gold)]">(você)</span>}
          </span>
          <span className="tabular text-[10px] text-neutral-400">nv {hero.level}</span>
        </div>
        <div className="bar mt-1 h-2">
          <span
            style={{
              width: `${pct}%`,
              background: pct > 50 ? "#6fbf73" : pct > 25 ? "#f2c14e" : "#d14b3a",
            }}
          />
        </div>
        <div className="tabular mt-0.5 text-[9px] text-neutral-500">
          {fmt(hero.hp)} / {fmt(hero.maxHp)}
        </div>
      </div>
    </div>
  );
}

// ─── Skills ──────────────────────────────────────────────────────────────────
export function SkillBar({ you }: { you: VocationId }) {
  const voc = VOCATIONS[you];
  return (
    <section className="panel">
      <div className="panel-header px-3 py-1.5">Skills · {voc.name}</div>
      <div className="grid grid-cols-4 gap-1.5 p-2">
        {voc.skills.map((s, i) => (
          <div
            key={s}
            title={s}
            className="group relative grid aspect-square place-items-center rounded-sm border border-[var(--hud-line)] bg-black/40 text-center"
            style={{ boxShadow: `inset 0 0 0 1px ${voc.accent}22` }}
          >
            <span className="text-[8px] leading-tight text-neutral-300">{s}</span>
            <span className="absolute right-0.5 top-0.5 text-[8px] text-neutral-600">{i + 1}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Hunt panel (região + start/stop + loot) ─────────────────────────────────
export function HuntPanel({
  snap,
  onToggleRun,
  onSelectRegion,
}: {
  snap: EngineSnapshot;
  onToggleRun: () => void;
  onSelectRegion: (id: string) => void;
}) {
  return (
    <section className="panel flex min-h-0 flex-col">
      <div className="panel-header px-3 py-1.5">Caçada</div>

      <div className="flex items-center gap-2 p-2">
        <button
          onClick={onToggleRun}
          className={`flex-1 rounded-sm px-3 py-2 text-xs font-bold uppercase tracking-wider transition ${
            snap.running
              ? "bg-[#d14b3a]/80 hover:bg-[#d14b3a] text-white"
              : "bg-[#6fbf73]/80 hover:bg-[#6fbf73] text-black"
          }`}
        >
          {snap.running ? "◼ Parar" : "▶ Caçar"}
        </button>
      </div>

      {/* seletor de região */}
      <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-neutral-400">Regiões</div>
      <div className="flex flex-col gap-0.5 overflow-y-auto px-2" style={{ maxHeight: 148 }}>
        {REGIONS.map((r) => {
          const active = r.id === snap.region.id;
          const locked = snap.levelInfo.level < r.levelRange[0];
          return (
            <button
              key={r.id}
              onClick={() => onSelectRegion(r.id)}
              className={`flex items-center justify-between rounded-sm px-2 py-1 text-left text-[11px] transition ${
                active ? "bg-[#2a2314] text-[var(--hud-gold)]" : "hover:bg-white/5 text-neutral-300"
              }`}
            >
              <span className="truncate">
                <span className="text-neutral-500">{r.index}.</span> {r.city}
              </span>
              <span className={`tabular text-[9px] ${locked ? "text-[#d14b3a]" : "text-neutral-500"}`}>
                {locked ? "🔒 " : ""}
                {r.levelRange[0]}–{r.levelRange[1] > 900 ? "∞" : r.levelRange[1]}
              </span>
            </button>
          );
        })}
      </div>

      {/* loot feed */}
      <div className="mt-2 border-t border-[var(--hud-line)] px-2 pt-1 text-[10px] uppercase tracking-wider text-neutral-400">
        Loot
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2 pt-1">
        {snap.lootFeed.length === 0 && (
          <div className="text-[11px] text-neutral-600">Nada ainda…</div>
        )}
        {snap.lootFeed.map((l) => (
          <div key={l.id} className="flex items-center justify-between text-[11px]">
            <span style={{ color: RARITY_COLOR[l.rarity] }} className="truncate">
              {l.name}
            </span>
            {l.amount > 1 && <span className="tabular text-neutral-500">×{l.amount}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Chat ────────────────────────────────────────────────────────────────────
const CHAT: Record<string, { who: string; msg: string; c?: string }[]> = {
  GLOBAL: [
    { who: "Kaelra", msg: "alguém pra Sunscar? preciso de tank", c: "#9ad0ff" },
    { who: "Dorn", msg: "vendo Dragonhide Cloak, chama no pv", c: "#6fbf73" },
    { who: "Sys", msg: "Boosted hoje: Grey Wolf (+15% xp idle)", c: "#f2c14e" },
    { who: "Mira", msg: "boss de Duskwood caiu 🔥", c: "#a06cd5" },
  ],
  LOCAL: [
    { who: "Ashen", msg: "puxa o próximo pack", c: "#f2c14e" },
    { who: "Vell", msg: "curando, pode ir", c: "#6fbf73" },
  ],
};

export function ChatBox() {
  const [tab, setTab] = useState<"GLOBAL" | "LOCAL">("GLOBAL");
  return (
    <section className="panel flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-[var(--hud-line)] px-2 py-1">
        {(["GLOBAL", "LOCAL"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              tab === t ? "bg-[#2a2314] text-[var(--hud-gold)]" : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 py-1.5 text-[11px]">
        {CHAT[tab].map((m, i) => (
          <div key={i}>
            <span style={{ color: m.c }} className="font-semibold">
              {m.who}:
            </span>{" "}
            <span className="text-neutral-300">{m.msg}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-[var(--hud-line)] p-1.5">
        <input
          disabled
          placeholder="Chat (Fase 3)…"
          className="w-full rounded-sm bg-black/40 px-2 py-1 text-[11px] text-neutral-300 placeholder:text-neutral-600 outline-none"
        />
      </div>
    </section>
  );
}
