"use client";

import { useEffect, useRef, useState } from "react";
import type { VocationId } from "@pixel-idle/shared";
import { MockEngine, type EngineSnapshot } from "@/game/MockEngine";
import { CanvasStage } from "@/components/CanvasStage";
import { TopBar, PartyPanel, SkillBar, HuntPanel, ChatBox } from "@/components/hud";

export function GameClient() {
  // no MMO real, o jogador É uma classe. Na Fase 0 renderizamos o party inteiro
  // (mock) e destacamos a sua.
  const you: VocationId = "knight";

  const engineRef = useRef<MockEngine | null>(null);
  if (!engineRef.current) engineRef.current = new MockEngine(8);
  const engine = engineRef.current;

  const [snap, setSnap] = useState<EngineSnapshot>(() => engine.snapshot());
  const [regionId, setRegionId] = useState(engine.region.id);

  useEffect(() => {
    engine.start();
    const id = setInterval(() => setSnap(engine.snapshot()), 120);
    return () => {
      clearInterval(id);
      engine.stop();
    };
  }, [engine]);

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
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar snap={snap} you={you} />

      <div className="flex min-h-0 flex-1 gap-2 p-2">
        {/* esquerda: grupo + skills */}
        <aside className="flex w-60 shrink-0 flex-col gap-2">
          <PartyPanel snap={snap} you={you} />
          <SkillBar you={you} />
        </aside>

        {/* centro: cena de combate */}
        <main className="panel relative min-h-0 flex-1 overflow-hidden p-1">
          <CanvasStage engine={engine} regionId={regionId} />
          <div className="pointer-events-none absolute left-3 top-2 leading-tight">
            <div className="font-fantasy text-sm text-[var(--hud-gold)] drop-shadow">
              {snap.region.name}
            </div>
            <div className="text-[10px] text-neutral-300/80">
              {snap.region.biome} · nv {range}
            </div>
          </div>
          <div className="pointer-events-none absolute right-3 top-2 flex items-center gap-1.5 text-[10px]">
            <span
              className={`h-2 w-2 rounded-full ${snap.running ? "animate-pulse bg-[#6fbf73]" : "bg-neutral-600"}`}
            />
            <span className="text-neutral-300">{snap.running ? "caçando" : "parado"}</span>
          </div>
        </main>

        {/* direita: caçada + loot */}
        <aside className="flex w-72 shrink-0 flex-col gap-2">
          <HuntPanel snap={snap} onToggleRun={toggleRun} onSelectRegion={selectRegion} />
        </aside>
      </div>

      {/* rodapé: chat */}
      <div className="h-36 shrink-0 px-2 pb-2">
        <ChatBox />
      </div>
    </div>
  );
}
