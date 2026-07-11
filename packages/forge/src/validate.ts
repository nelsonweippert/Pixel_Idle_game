/**
 * O VALIDADOR — o coração do portão. Checa um asset contra o ART_SPEC.
 * Só regras OBJETIVAS (dimensão, frames, cor, transparência). O "ficou bonito"
 * é humano; isto é o que a máquina garante.
 *
 * Convenção de spritesheet: grade de frames (colunas) × direções (linhas),
 * cada célula = um tamanho válido do tipo. Ex: character walk 48×48, 4 frames,
 * 4 direções → folha 192×192.
 */

import { specFor, type AssetType } from "./spec";
import { countColors, cornersTransparent, hasAnyTransparency, loadImage } from "./image";

export interface Violation {
  rule: string;
  detail: string;
}

export interface ValidateResult {
  ok: boolean;
  type: AssetType;
  anim?: string;
  info: {
    width: number;
    height: number;
    colors: number;
    frameW?: number;
    frameH?: number;
    frames?: number;
    directions?: number;
  };
  violations: Violation[];
}

export async function validate(
  path: string,
  opts: { type: AssetType; anim?: string },
): Promise<ValidateResult> {
  const spec = specFor(opts.type);
  const img = await loadImage(path);
  const v: Violation[] = [];
  const info: ValidateResult["info"] = {
    width: img.width,
    height: img.height,
    colors: countColors(img),
  };

  // ── geometria: estático vs animação ──────────────────────────────────────
  if (opts.anim) {
    const anim = spec.animations.find((a) => a.name === opts.anim);
    if (!anim) {
      v.push({
        rule: "anim.unknown",
        detail: `'${opts.anim}' não existe em ${opts.type} (tem: ${
          spec.animations.map((a) => a.name).join(", ") || "nenhuma"
        })`,
      });
    } else {
      const size = spec.sizes.find((s) => img.width % s.w === 0 && img.height % s.h === 0);
      if (!size) {
        v.push({
          rule: "anim.grid",
          detail: `${img.width}×${img.height} não é grade inteira de nenhum tamanho válido (${spec.sizes
            .map((s) => `${s.w}×${s.h}`)
            .join(", ")})`,
        });
      } else {
        const frames = img.width / size.w;
        const dirs = img.height / size.h;
        info.frameW = size.w;
        info.frameH = size.h;
        info.frames = frames;
        info.directions = dirs;
        if (frames < anim.minFrames || frames > anim.maxFrames) {
          v.push({
            rule: "anim.frames",
            detail: `${frames} frames; '${anim.name}' exige ${anim.minFrames}–${anim.maxFrames}`,
          });
        }
        if (dirs !== anim.directions) {
          v.push({
            rule: "anim.directions",
            detail: `${dirs} direção(ões); '${anim.name}' exige ${anim.directions}`,
          });
        }
      }
    }
  } else {
    const okSize = spec.sizes.some((s) => s.w === img.width && s.h === img.height);
    if (!okSize) {
      v.push({
        rule: "size",
        detail: `${img.width}×${img.height} não permitido; use ${spec.sizes
          .map((s) => `${s.w}×${s.h}`)
          .join(", ")}`,
      });
    }
  }

  // ── cores ─────────────────────────────────────────────────────────────────
  if (info.colors > spec.maxColors) {
    v.push({
      rule: "colors",
      detail: `${info.colors} cores; teto é ${spec.maxColors}`,
    });
  }

  // ── transparência ───────────────────────────────────────────────────────
  if (spec.requireTransparency) {
    if (!hasAnyTransparency(img)) {
      v.push({ rule: "transparency", detail: "fundo não é transparente (nenhum pixel alfa)" });
    } else if (!cornersTransparent(img)) {
      v.push({
        rule: "transparency.corners",
        detail: "cantos não estão vazios (sprite deve ser ancorado com cantos transparentes)",
      });
    }
  }

  return { ok: v.length === 0, type: opts.type, anim: opts.anim, info, violations: v };
}
