"use client";

import { useEffect, useRef, useState } from "react";
import type { VocationId } from "@pixel-idle/shared";
import { NetClient, type EngineSnapshot, type HuntEngine } from "@/game/NetClient";
import { NetClientWs } from "@/game/NetClientWs";
import { CanvasStage } from "@/components/CanvasStage";

// NEXT_PUBLIC_USE_WS=1 → dirige a cena pelo servidor autoritativo (game-server);
// senão, simulação local (NetClient/game-core). Mesmo render nos dois casos.
const USE_WS = process.env.NEXT_PUBLIC_USE_WS === "1";
import { TopBar, PartyPanel, HuntPanel } from "@/components/hud";
import { CharacterWindow } from "@/components/character";
import { MuStatusBar } from "@/components/mu-hud";

export function GameClient() {
  // no MMO real, o jogador É uma classe. Na Fase 0 renderizamos o party inteiro
  // (mock) e destacamos a sua.
  const you: VocationId = "knight";

  // abre direto na visão MU real: caçada de Lorência (Bull Fighter + Budge Dragon)
  const engineRef = useRef<HuntEngine | null>(null);
  if (!engineRef.current) engineRef.current = USE_WS ? new NetClientWs(8) : new NetClient(8, "lorencia-north");
  const engine = engineRef.current;
  // dev: expõe o engine no console (ex.: __engine.debugGrantSet(1) veste o set Dragon)
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
    (window as unknown as { __engine: HuntEngine }).__engine = engine;
  }

  const [snap, setSnap] = useState<EngineSnapshot>(() => engine.snapshot());
  const [regionId, setRegionId] = useState(engine.region.id);
  const [charOpen, setCharOpen] = useState(false);
  // a CENA SEGUE A REGIÃO: cada caçada de Lorência usa seu terreno REAL bakeado
  // (public/tilesets/lorencia-<zona>/ — extraído do explorer). Sem seletor de cenário.
  const sceneUrl = `/tilesets/${regionId}/scene.json`;

  useEffect(() => {
    engine.start();
    const id = setInterval(() => setSnap(engine.snapshot()), 120);
    return () => {
      clearInterval(id);
      engine.stop();
    };
  }, [engine]);

  // atalho: C abre/fecha a ficha de personagem
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "c" || e.key === "C") setCharOpen((v) => !v);
      if (e.key === "Escape") setCharOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleRun = () => {
    if (engine.running) engine.stop();
    else engine.start();
    setSnap(engine.snapshot());
  };
  const selectRegion = (id: string) => {
    engine.setRegion(id);
    setRegionId(id);
    setSnap(engine.snapshot());
  };

  const range = `${snap.region.levelRange[0]}–${
    snap.region.levelRange[1] > 900 ? "∞" : snap.region.levelRange[1]
  }`;

  return (
    // ARQUITETURA: cena PixiJS ocupa a tela inteira (camada de baixo); o HUD (React)
    // FLUTUA por cima em painéis de vidro. pointer-events-none no container do overlay,
    // -auto só nos painéis → os cliques passam pra cena nos vãos, e o código fica limpo
    // (render no Pixi, UI no React, sem um encaixotar o outro).
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      {/* camada 1 — cena fullscreen */}
      <div className="absolute inset-0 z-0">
        <CanvasStage engine={engine} regionId={regionId} sceneUrl={sceneUrl} />
      </div>

      {/* camada 2 — vinheta (legibilidade do HUD sobre a cena) */}
      <div className="hud-vignette pointer-events-none absolute inset-0 z-10" />

      {/* camada 3 — HUD */}
      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col">
        <TopBar snap={snap} you={you} />

        {/* etiqueta de região + status, flutuando no topo-centro */}
        <div className="pointer-events-none mt-2 flex flex-col items-center text-center">
          <div className="font-fantasy text-base text-[var(--hud-gold)] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
            {snap.region.name}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-neutral-200/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            <span>{snap.region.biome} · nv {range}</span>
            <span className="mx-1 h-1 w-1 rounded-full bg-neutral-500" />
            <span
              className={`h-1.5 w-1.5 rounded-full ${snap.running ? "animate-pulse bg-[#6fbf73]" : "bg-neutral-600"}`}
            />
            <span>{snap.running ? "caçando" : "parado"}</span>
          </div>
        </div>

        {/* colunas: esquerda (grupo+skills) · centro livre (combate) · direita (caçada) */}
        <div className="flex min-h-0 flex-1 items-start justify-between gap-3 p-3">
          <aside className="pointer-events-auto flex w-60 shrink-0 flex-col gap-2">
            <button
              onClick={() => setCharOpen(true)}
              className="panel panel-header flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider text-[var(--hud-gold)] transition hover:bg-white/5"
            >
              🛡️ Personagem & Inventário <span className="text-[9px] text-neutral-500">(C)</span>
            </button>
            <PartyPanel snap={snap} you={you} />
          </aside>

          <aside className="pointer-events-auto flex max-h-full w-72 shrink-0 flex-col gap-2">
            <HuntPanel snap={snap} onToggleRun={toggleRun} onSelectRegion={selectRegion} />
          </aside>
        </div>

      </div>

      {/* barra de status estilo MU (globos HP/Mana + skills) — base da tela */}
      <MuStatusBar snap={snap} you={you} onOpenChar={() => setCharOpen(true)} />

      {/* janela de personagem/inventário (overlay) */}
      {charOpen && (
        <CharacterWindow
          snap={snap}
          onClose={() => setCharOpen(false)}
          onEquip={(uid) => { engine.equip?.(uid); setSnap(engine.snapshot()); }}
          onUnequip={(slot) => { engine.unequip?.(slot); setSnap(engine.snapshot()); }}
          onAllocate={(stat) => { engine.allocate?.(stat); setSnap(engine.snapshot()); }}
          onAuto={() => { engine.autoPoints?.(); setSnap(engine.snapshot()); }}
        />
      )}
    </div>
  );
}
