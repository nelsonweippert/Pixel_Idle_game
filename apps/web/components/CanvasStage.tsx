"use client";

import { useEffect, useRef } from "react";
import { REGION_BY_ID } from "@pixel-idle/shared";
import type { MockEngine } from "@/game/MockEngine";
import type { HuntScene } from "@/game/HuntScene";

export function CanvasStage({
  engine,
  regionId,
}: {
  engine: MockEngine;
  regionId: string;
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
      unsub = engine.on((ev) => scene.handleEvent(ev));

      let last = performance.now();
      const loop = (t: number) => {
        const dt = t - last;
        last = t;
        engine.tick(dt);
        scene.sync(engine.heroes, engine.monsters);
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

  return <div ref={hostRef} className="pixel-canvas h-full w-full" />;
}
