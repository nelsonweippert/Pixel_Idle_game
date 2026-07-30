"use client";

import { useEffect, useRef } from "react";
import { REGION_BY_ID } from "@pixel-idle/shared";
import type { HuntEngine } from "@/game/NetClient";
import type { HuntScene } from "@/game/HuntScene";

export function CanvasStage({
  engine,
  regionId,
  sceneUrl,
}: {
  engine: HuntEngine;
  regionId: string;
  sceneUrl?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HuntScene | null>(null);

  // monta a cena Pixi + game loop (uma vez)
  useEffect(() => {
    let raf = 0;
    let disposed = false;
    let unsub: (() => void) | undefined;

    (async () => {
      const host = hostRef.current;
      if (!host) return;
      const { HuntScene } = await import("@/game/HuntScene");
      const scene = new HuntScene();
      await scene.init(host, engine.region);
      if (disposed) {
        scene.destroy();
        return;
      }
      sceneRef.current = scene;
      // aplica a cena inicial (a montagem é async → o efeito de sceneUrl já rodou vazio
      // antes de sceneRef existir; sem isto, ficaria na cena default do loadTileset).
      if (sceneUrl) scene.setScene(sceneUrl);
      unsub = engine.on((ev) => scene.handleEvent(ev));

      let last = performance.now();
      let lastPiecesKey = "";
      const loop = (t: number) => {
        const dt = t - last;
        last = t;
        engine.tick(dt);
        scene.sync(engine.heroes, engine.monsters);
        // veste o herói conforme as PEÇAS equipadas (só quando o combo muda) — cada
        // peça de armadura aparece no personagem (paper-doll em camadas)
        const pieces = engine.heroPieces?.() ?? null;
        const key = pieces ? JSON.stringify(pieces) : "none";
        if (key !== lastPiecesKey) {
          lastPiecesKey = key;
          void scene.setHeroPieces(pieces);
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      unsub?.();
      sceneRef.current?.destroy();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  // troca de bioma → redesenha o piso
  useEffect(() => {
    const region = REGION_BY_ID[regionId];
    if (region) sceneRef.current?.setRegion(region);
  }, [regionId]);

  // troca de CENÁRIO (seletor do HUD) → carrega a cena escolhida ao vivo
  useEffect(() => {
    if (sceneUrl) sceneRef.current?.setScene(sceneUrl);
  }, [sceneUrl]);

  return <div ref={hostRef} className="pixel-canvas h-full w-full" />;
}
