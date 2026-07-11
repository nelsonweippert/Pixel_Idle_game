/**
 * Gera o SPRITESHEET JSON no formato PixiJS — o que sai da Forja pronto pro
 * `Assets.load()`. A folha normalizada (grade frames×direções) É o atlas; este
 * JSON só descreve os frames + as animações nomeadas + anchor + fps.
 *
 * Convenção de linhas (top→bottom) p/ 4 direções: DIRECTION_ORDER.
 */

import { DIRECTION_ORDER } from "./spec";

export interface PixiFrame {
  frame: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  anchor: { x: number; y: number };
}

export interface PixiSheet {
  frames: Record<string, PixiFrame>;
  animations: Record<string, string[]>;
  meta: {
    image: string;
    format: "RGBA8888";
    size: { w: number; h: number };
    scale: number;
    // extensão nossa (Pixi ignora, nós usamos p/ o AnimatedSprite):
    fps: number;
  };
}

export function buildPixiSheet(args: {
  image: string; // basename do PNG (sibling do JSON)
  anim: string;
  frameW: number;
  frameH: number;
  frames: number;
  directions: number;
  anchor: { x: number; y: number };
  fps: number;
}): PixiSheet {
  const { image, anim, frameW, frameH, frames, directions, anchor, fps } = args;
  const sheet: PixiSheet = {
    frames: {},
    animations: {},
    meta: {
      image,
      format: "RGBA8888",
      size: { w: frames * frameW, h: directions * frameH },
      scale: 1,
      fps,
    },
  };

  // uma linha por direção (ou linha única p/ effect de 1 direção)
  const dirNames: (string | null)[] =
    directions === 1 ? [null] : DIRECTION_ORDER.slice(0, directions);

  for (let d = 0; d < dirNames.length; d++) {
    const dir = dirNames[d];
    const animKey = dir ?? anim;
    const keys: string[] = [];
    for (let f = 0; f < frames; f++) {
      const key = dir ? `${anim}.${dir}.${f}` : `${anim}.${f}`;
      sheet.frames[key] = {
        frame: { x: f * frameW, y: d * frameH, w: frameW, h: frameH },
        sourceSize: { w: frameW, h: frameH },
        spriteSourceSize: { x: 0, y: 0, w: frameW, h: frameH },
        anchor,
      };
      keys.push(key);
    }
    sheet.animations[animKey] = keys;
  }
  return sheet;
}
