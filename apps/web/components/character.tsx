"use client";

/**
 * character.tsx — JANELA DE PERSONAGEM & INVENTÁRIO no visual do MU Online.
 * Usa os ASSETS REAIS do cliente MU (Data/Interface → public/ui/mu): slots do inventário,
 * placeholders de equipamento (elmo/armadura/arma/…), gema de título. Esquerda = ficha MU
 * com ALOCAÇÃO DE PONTOS (+STR/AGI/VIT/ENE, estilo MU). Direita = paper-doll + mochila 8×8.
 * Foco: nostalgia/fidelidade ao MU.
 */
import { useState } from "react";
import {
  RARITY_COLOR,
  instanceRarity,
  EquipSlot,
  ItemGroup,
  weaponLevelBonus,
  armorLevelBonus,
  shieldLevelBonus,
  normalOptionBonus,
  canUseItem,
  type ItemInstance,
  type ItemDefinition,
  type CharReqContext,
  type BaseAttrs,
} from "@pixel-idle/shared";
import type { CharSheet, EngineSnapshot, OwnedItem } from "@/game/NetClient";

const MU = "/ui/mu";
const fmt = (n: number) => (n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(Math.round(n)));

const CLASS_NAME: Record<string, string> = {
  dk: "Dark Knight", dw: "Dark Wizard", elf: "Fairy Elf", mg: "Magic Gladiator", dl: "Dark Lord", sum: "Summoner",
};

const GROUP_LABEL: Record<number, string> = {
  [ItemGroup.Swords]: "Espada", [ItemGroup.Axes]: "Machado", [ItemGroup.Scepters]: "Cetro",
  [ItemGroup.Spears]: "Lança", [ItemGroup.Bows]: "Arco", [ItemGroup.Staffs]: "Cajado",
  [ItemGroup.Shields]: "Escudo", [ItemGroup.Helm]: "Elmo", [ItemGroup.Armor]: "Armadura",
  [ItemGroup.Pants]: "Calça", [ItemGroup.Gloves]: "Luvas", [ItemGroup.Boots]: "Botas",
  [ItemGroup.Wings]: "Asas", [ItemGroup.Misc1]: "Acessório", [ItemGroup.Potions]: "Poção", [ItemGroup.Scrolls]: "Pergaminho",
};

// paper-doll estilo MU: cada slot com seu placeholder real + posição/aspecto do MU
const EQUIP_LAYOUT: { slot: number; ph: string; x: number; y: number; w: number; h: number }[] = [
  { slot: EquipSlot.Pendant, ph: "eq-pendant", x: 60, y: 6, w: 30, h: 30 },
  { slot: EquipSlot.Helm, ph: "eq-helm", x: 114, y: 2, w: 48, h: 48 },
  { slot: EquipSlot.WeaponRight, ph: "eq-weaponR", x: 6, y: 54, w: 48, h: 68 },
  { slot: EquipSlot.Armor, ph: "eq-armor", x: 114, y: 54, w: 48, h: 68 },
  { slot: EquipSlot.WeaponLeft, ph: "eq-weaponL", x: 222, y: 54, w: 48, h: 68 },
  { slot: EquipSlot.Gloves, ph: "eq-gloves", x: 6, y: 132, w: 48, h: 48 },
  { slot: EquipSlot.Pants, ph: "eq-pants", x: 114, y: 132, w: 48, h: 48 },
  { slot: EquipSlot.Wings, ph: "eq-wing", x: 210, y: 132, w: 60, h: 46 },
  { slot: EquipSlot.Pet, ph: "eq-pet", x: 6, y: 186, w: 48, h: 48 },
  { slot: EquipSlot.Boots, ph: "eq-boots", x: 114, y: 186, w: 48, h: 48 },
  { slot: EquipSlot.Ring1, ph: "eq-ring", x: 210, y: 188, w: 30, h: 30 },
  { slot: EquipSlot.Ring2, ph: "eq-ring", x: 244, y: 188, w: 30, h: 30 },
];

// ── item: label + stats efetivos (reusa tabelas de bônus por +level) ────────────
function itemLabel(inst: ItemInstance, name: string) {
  const plus = inst.level > 0 ? ` +${inst.level}` : "";
  const exc = inst.excellent.length ? " (Exc)" : "";
  return `${name}${plus}${exc}`;
}

type StatLine = { label: string; value: string; color?: string };

function describeItem(inst: ItemInstance, def: ItemDefinition): { type: string; stats: StatLine[]; flags: StatLine[]; meta: StatLine[] } {
  const isShield = def.group === ItemGroup.Shields;
  const lvlBonus = isShield ? shieldLevelBonus(inst.level) : def.power.defense != null ? armorLevelBonus(inst.level) : weaponLevelBonus(inst.level);
  const opt = normalOptionBonus(inst.option);
  const p = def.power;
  const stats: StatLine[] = [];
  if (p.minPhys != null && p.maxPhys != null) stats.push({ label: "Dano físico", value: `${p.minPhys + lvlBonus + opt}–${p.maxPhys + lvlBonus + opt}` });
  if (p.minMagic != null && p.maxMagic != null) stats.push({ label: "Dano mágico", value: `${p.minMagic + lvlBonus + opt}–${p.maxMagic + lvlBonus + opt}`, color: "#a06cd5" });
  if (p.defense != null) stats.push({ label: "Defesa", value: String(p.defense + lvlBonus + (p.minPhys == null ? opt : 0)) });
  if (p.defenseRate != null) stats.push({ label: "Taxa de defesa", value: `+${p.defenseRate}` });
  if (p.attackSpeed != null) stats.push({ label: "Velocidade de ataque", value: `+${p.attackSpeed}` });
  const flags: StatLine[] = [];
  if (inst.luck) flags.push({ label: "Luck", value: "+5% crít · +5% jóia", color: "#9ad0ff" });
  if (inst.skill) flags.push({ label: "Skill", value: "concede habilidade", color: "#f2c14e" });
  if (inst.option > 0) flags.push({ label: "Opção", value: `+${opt} adicional`, color: "#6fbf73" });
  if (inst.excellent.length > 0) flags.push({ label: "Excellent", value: `${inst.excellent.length} opção(ões)`, color: "#6fbf73" });
  const meta: StatLine[] = [{ label: "Durabilidade", value: `${inst.durability}/${def.durability}` }];
  if (def.value > 0) meta.push({ label: "Valor", value: String(def.value), color: "#f2c14e" });
  return { type: GROUP_LABEL[def.group] ?? "Item", stats, flags, meta };
}

function TipRow({ label, value, color }: StatLine) {
  return (
    <div className="flex items-center justify-between gap-4 text-[10px]">
      <span className="text-neutral-400">{label}</span>
      <span className="tabular font-semibold" style={{ color: color ?? "#e8e8e8" }}>{value}</span>
    </div>
  );
}

function ItemTooltip({ item, x, y, ctx }: { item: OwnedItem; x: number; y: number; ctx?: CharReqContext }) {
  const { inst, def } = item;
  const color = RARITY_COLOR[instanceRarity(inst)];
  const d = describeItem(inst, def);
  const usable = ctx ? canUseItem(def, ctx) : { ok: true as const };
  const wrongClass = !!ctx && def.classes.length > 0 && !def.classes.includes(ctx.muClass);
  const classes = def.classes.length ? def.classes.map((c) => CLASS_NAME[c] ?? c).join(", ") : "Todas as classes";
  const RED = "#e8674f";
  const reqRows: { label: string; value: string; met: boolean }[] = [];
  const r = def.requirements;
  const push = (label: string, need: number, have?: number) => { if (need > 0) reqRows.push({ label, value: String(need), met: have == null || have >= need }); };
  push("Nível", r.level, ctx?.level); push("Força", r.str, ctx?.str); push("Agilidade", r.agi, ctx?.agi);
  push("Energia", r.ene, ctx?.ene); push("Vitalidade", r.vit, ctx?.vit); push("Comando", r.cmd, ctx?.cmd);
  const left = Math.min(x + 16, (typeof window !== "undefined" ? window.innerWidth : 1200) - 250);
  const top = Math.min(y + 16, (typeof window !== "undefined" ? window.innerHeight : 800) - 280);
  return (
    <div className="pointer-events-none fixed z-[60] w-[230px] rounded-sm border p-2.5" style={{ left, top, borderColor: color, background: "linear-gradient(180deg,#1c1712f5,#0b0906fa)", boxShadow: `0 0 14px ${color}44, 0 8px 24px #000a` }}>
      {/* skin em destaque: o render 128px do modelo REAL do item (nome ↔ skin do catálogo) */}
      <div className="mb-1.5 grid place-items-center rounded-sm py-1.5" style={{ background: `radial-gradient(60% 80% at 50% 55%, ${color}1f, transparent)` }}>
        <img src={`/item-icons/${def.id}.png`} alt="" draggable={false} className="h-20 w-20 object-contain drop-shadow-[0_3px_8px_rgba(0,0,0,0.8)]" />
      </div>
      <div className="font-semibold leading-tight" style={{ color }}>{itemLabel(inst, def.name)}</div>
      <div className="mt-0.5 text-[9px] uppercase tracking-wider text-neutral-500">{d.type}</div>
      {!usable.ok && <div className="mt-1.5 rounded-sm px-1.5 py-1 text-[10px] font-semibold" style={{ background: "#e8674f22", color: RED }}>✖ Não pode equipar — requer {usable.reason}</div>}
      {d.stats.length > 0 && <div className="mt-2 flex flex-col gap-0.5 border-t border-[#3a2f22] pt-1.5">{d.stats.map((s) => <TipRow key={s.label} {...s} />)}</div>}
      {d.flags.length > 0 && <div className="mt-1.5 flex flex-col gap-0.5">{d.flags.map((s) => <TipRow key={s.label} {...s} />)}</div>}
      {reqRows.length > 0 && <div className="mt-2 border-t border-[#3a2f22] pt-1.5"><div className="mb-0.5 text-[9px] uppercase tracking-wider text-neutral-500">Requisitos</div>{reqRows.map((s) => <TipRow key={s.label} label={s.label} value={s.value} color={s.met ? undefined : RED} />)}</div>}
      <div className="mt-2 border-t border-[#3a2f22] pt-1.5">{d.meta.map((s) => <TipRow key={s.label} {...s} />)}<div className="mt-0.5 text-[9px]" style={{ color: wrongClass ? RED : "#8a7a5c" }}>{classes}</div></div>
    </div>
  );
}

// ── SLOT MU (inventário ou equipamento) ─────────────────────────────────────────
function Slot({
  item, w, h, placeholder, onClick, onHover, onLeave,
}: {
  item: OwnedItem | null;
  w: number;
  h: number;
  placeholder?: string; // textura do slot vazio (equip = silhueta MU; bag = slot MU)
  onClick?: () => void;
  onHover?: (it: OwnedItem, e: React.MouseEvent) => void;
  onLeave?: () => void;
}) {
  const [iconOk, setIconOk] = useState(true);
  const color = item ? RARITY_COLOR[instanceRarity(item.inst)] : "transparent";
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      onMouseEnter={(e) => item && onHover?.(item, e)}
      onMouseMove={(e) => item && onHover?.(item, e)}
      onMouseLeave={onLeave}
      className={`group relative ${clickable ? "cursor-pointer hover:brightness-125" : ""}`}
      style={{ width: w, height: h }}
    >
      {/* fundo do slot MU */}
      <img src={item ? `${MU}/slot.png` : placeholder ?? `${MU}/slot.png`} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full" style={{ imageRendering: "pixelated", opacity: item ? 1 : 0.9 }} />
      {item && (
        iconOk ? (
          // skin do item (render 128px do BMD real, SEM pixelate — "da forma que devem").
          // HOVER = zoom in-place (~2×): o ícone cresce sobre os vizinhos, estética 1-item-por-slot.
          <img
            src={`/item-icons/${item.def.id}.png`}
            alt=""
            draggable={false}
            onError={() => setIconOk(false)}
            className="pointer-events-none absolute inset-0 h-full w-full object-contain p-0.5 transition-transform duration-100 ease-out group-hover:z-30 group-hover:scale-[2.1] group-hover:drop-shadow-[0_4px_10px_rgba(0,0,0,0.9)]"
          />
        ) : (
          <span className="absolute inset-0 grid place-items-center px-0.5 text-center text-[8px] font-bold" style={{ color }}>{item.def.name.split(" ").map((wd) => wd[0]).join("").slice(0, 3)}</span>
        )
      )}
      {item && (
        <span className="pointer-events-none absolute inset-0 rounded-[2px]" style={{ boxShadow: `inset 0 0 6px ${color}66` }} />
      )}
      {item && item.inst.level > 0 && <span className="pointer-events-none absolute right-0.5 top-0.5 text-[9px] font-bold text-[#ffd257] drop-shadow-[0_1px_1px_#000]">+{item.inst.level}</span>}
      {item && item.inst.luck && <span className="pointer-events-none absolute left-0.5 top-0.5 text-[8px] text-[#9ad0ff]">✦</span>}
      {item && item.inst.excellent.length > 0 && <span className="pointer-events-none absolute bottom-0.5 left-0.5 text-[7px] font-bold text-[#6fbf73]">EXC</span>}
    </div>
  );
}

// ── ficha MU (atributos com alocação + derivados) ───────────────────────────────
function SheetRow({ label, value, color, onPlus, canPlus }: { label: string; value: string; color?: string; onPlus?: () => void; canPlus?: boolean }) {
  return (
    <div className="flex items-center justify-between py-[3px] text-[11px]">
      <span className="text-neutral-400">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className="tabular font-semibold" style={{ color: color ?? "#e8e8e8" }}>{value}</span>
        {onPlus && <button onClick={onPlus} disabled={!canPlus} className={`grid h-4 w-4 place-items-center rounded-sm border text-[11px] font-bold leading-none ${canPlus ? "border-[#6b5a3a] bg-[#3a2f1a] text-[#ffd257] hover:bg-[#4b3d22]" : "border-[#2a2318] bg-[#1a1510] text-[#4a4030] cursor-default"}`}>+</button>}
      </span>
    </div>
  );
}

function CharacterSheet({ sheet, onAllocate, onAuto }: { sheet: CharSheet; onAllocate: (s: keyof BaseAttrs) => void; onAuto: () => void }) {
  const d = sheet.derived;
  const a = sheet.attrs;
  const pts = sheet.availablePoints;
  const can = pts > 0;
  return (
    <div className="flex w-56 shrink-0 flex-col gap-2">
      <div>
        <div className="font-fantasy text-base text-[#ffd257]">{sheet.name}</div>
        <div className="text-[10px] uppercase tracking-wider text-neutral-400">{CLASS_NAME[sheet.muClass] ?? sheet.muClass} · nível {sheet.level}</div>
      </div>

      {/* atributos + alocação de pontos (estilo MU) */}
      <div className="mu-panel">
        <div className="mu-panel-h">Atributos {can && <span className="ml-auto text-[#ffd257]">{pts} pts</span>}</div>
        <div className="px-2.5 py-1.5">
          <SheetRow label="Força (STR)" value={String(a.str)} color="#e08a5b" onPlus={() => onAllocate("str")} canPlus={can} />
          <SheetRow label="Agilidade (AGI)" value={String(a.agi)} color="#6fbf73" onPlus={() => onAllocate("agi")} canPlus={can} />
          <SheetRow label="Vitalidade (VIT)" value={String(a.vit)} color="#d14b3a" onPlus={() => onAllocate("vit")} canPlus={can} />
          <SheetRow label="Energia (ENE)" value={String(a.ene)} color="#9ad0ff" onPlus={() => onAllocate("ene")} canPlus={can} />
          {a.cmd > 0 && <SheetRow label="Comando (CMD)" value={String(a.cmd)} color="#f2c14e" onPlus={() => onAllocate("cmd")} canPlus={can} />}
          {can && <button onClick={onAuto} className="mt-1.5 w-full rounded-sm border border-[#6b5a3a] bg-[#2a2314] py-1 text-[10px] font-bold uppercase tracking-wider text-[#ffd257] hover:bg-[#3a2f1a]">Auto-distribuir ({pts})</button>}
        </div>
      </div>

      {/* derivados MU */}
      <div className="mu-panel">
        <div className="mu-panel-h">Combate</div>
        <div className="px-2.5 py-1.5">
          <SheetRow label="Vida" value={`${fmt(sheet.hp)} / ${fmt(d.maxHp)}`} color="#d14b3a" />
          <SheetRow label="Mana" value={fmt(d.maxMana)} color="#9ad0ff" />
          <SheetRow label="Dano físico" value={`${d.minPhys}–${d.maxPhys}`} />
          {d.maxMagic > 0 && <SheetRow label="Dano mágico" value={`${d.minMagic}–${d.maxMagic}`} color="#a06cd5" />}
          <SheetRow label="Defesa" value={String(d.defense)} />
          <SheetRow label="Taxa de ataque" value={String(d.attackRate)} />
          <SheetRow label="Taxa de defesa" value={String(d.defenseRate)} />
          <SheetRow label="Crítico" value={`${Math.round(d.critChance * 100)}%`} color="#f2c14e" />
          <SheetRow label="Excellent" value={`${Math.round(d.excellentChance * 100)}%`} color="#6fbf73" />
        </div>
      </div>

      {/* zen (dinheiro) — barra do MU */}
      <div className="relative h-[26px] w-full" style={{ backgroundImage: `url(${MU}/zen.png)`, backgroundSize: "100% 100%", imageRendering: "pixelated" }}>
        <span className="tabular absolute inset-y-0 right-3 flex items-center text-[12px] font-bold text-[#ffe9a8] drop-shadow-[0_1px_1px_#000]">{sheet.gold.toLocaleString("pt-BR")}</span>
      </div>
    </div>
  );
}

// ── paper-doll MU ───────────────────────────────────────────────────────────────
function EquipDoll({ equipment, onUnequip, onHover, onLeave }: { equipment: (OwnedItem | null)[]; onUnequip: (slot: number) => void; onHover: (it: OwnedItem, e: React.MouseEvent) => void; onLeave: () => void }) {
  return (
    <div className="relative mx-auto" style={{ width: 276, height: 236 }}>
      {EQUIP_LAYOUT.map(({ slot, ph, x, y, w, h }) => {
        const it = equipment[slot] ?? null;
        return (
          <div key={slot} className="absolute" style={{ left: x, top: y }}>
            <Slot item={it} w={w} h={h} placeholder={`${MU}/${ph}.png`} onClick={it ? () => onUnequip(slot) : undefined} onHover={onHover} onLeave={onLeave} />
          </div>
        );
      })}
    </div>
  );
}

export function CharacterWindow({
  snap, onClose, onEquip, onUnequip, onAllocate, onAuto,
}: {
  snap: EngineSnapshot;
  onClose: () => void;
  onEquip?: (uid: number) => void;
  onUnequip?: (slot: number) => void;
  onAllocate?: (stat: keyof BaseAttrs) => void;
  onAuto?: () => void;
}) {
  const sheet = snap.sheet;
  const equipment = snap.equipment ?? new Array(12).fill(null);
  const inventory = snap.inventory ?? [];
  const BAG = 64; // 8×8
  const CELL = 40;

  const reqCtx: CharReqContext | undefined = sheet ? { muClass: sheet.muClass, level: sheet.level, ...sheet.attrs } : undefined;
  const [tip, setTip] = useState<{ item: OwnedItem; x: number; y: number } | null>(null);
  const showTip = (item: OwnedItem, e: React.MouseEvent) => setTip({ item, x: e.clientX, y: e.clientY });
  const hideTip = () => setTip(null);

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div className="mu-win flex max-h-[90vh] flex-col" onClick={(e) => e.stopPropagation()}>
        {/* barra de título MU */}
        <div className="mu-titlebar">
          <img src={`${MU}/win-title.png`} alt="" className="mu-title-gem" style={{ imageRendering: "pixelated" }} />
          <span className="font-fantasy text-sm tracking-wider text-[#ffe9a8]">Personagem & Inventário</span>
          <button onClick={onClose} className="ml-auto rounded-sm px-2 py-0.5 text-xs text-neutral-300 hover:bg-white/10 hover:text-white">✕</button>
        </div>

        <div className="flex gap-4 overflow-auto p-4">
          {sheet && onAllocate && onAuto ? (
            <CharacterSheet sheet={sheet} onAllocate={onAllocate} onAuto={onAuto} />
          ) : (
            <div className="w-56 text-sm text-neutral-500">Sem ficha (modo servidor).</div>
          )}

          <div className="flex flex-col gap-3">
            {/* paper-doll */}
            <div className="mu-panel p-2">
              <EquipDoll equipment={equipment} onUnequip={(s) => onUnequip?.(s)} onHover={showTip} onLeave={hideTip} />
            </div>

            {/* mochila 8×8 (slots MU) */}
            <div className="mu-panel p-2">
              <div className="mb-1.5 flex items-center justify-between px-0.5">
                <span className="text-[10px] uppercase tracking-wider text-neutral-400">Mochila</span>
                <span className="tabular text-[10px] text-neutral-500">{inventory.length}/{BAG}</span>
              </div>
              <div className="grid grid-cols-8" style={{ gap: 2 }}>
                {Array.from({ length: BAG }).map((_, i) => {
                  const it = inventory[i] ?? null;
                  const equippable = !!it && it.def.slot != null && (!reqCtx || canUseItem(it.def, reqCtx).ok);
                  return (
                    <Slot key={i} item={it} w={CELL} h={CELL} onClick={equippable ? () => onEquip?.(it!.inst.uid) : undefined} onHover={showTip} onLeave={hideTip} />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {tip && <ItemTooltip item={tip.item} x={tip.x} y={tip.y} ctx={reqCtx} />}
    </div>
  );
}
