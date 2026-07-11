/**
 * O VALIDADOR — o portão. Checa um asset contra o ART_SPEC + regras de QUALIDADE
 * de pixel art (anti-aliasing, upscale). Só regras OBJETIVAS.
 *
 * Spritesheet: grade frames(colunas) × direções(linhas), célula = tamanho válido.
 * Tipos com vários tamanhos (creature) exigem --size p/ matar a ambiguidade.
 */

import { QUALITY, specFor, type AssetType } from "./spec";
import {
  contentBounds,
  countColors,
  cornersTransparent,
  detectPixelScale,
  hasAnyTransparency,
  loadImage,
  partialAlphaRatio,
  type Bounds,
} from "./image";

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
    pixelScale: number;
    partialAlpha: number;
    bounds: Bounds | null;
    frameW?: number;
    frameH?: number;
    frames?: number;
    directions?: number;
  };
  violations: Violation[];
}

export async function validate(
  path: string,
  opts: { type: AssetType; anim?: string; frameSize?: number },
): Promise<ValidateResult> {
  const spec = specFor(opts.type);
  const img = await loadImage(path);
  const v: Violation[] = [];
  const info: ValidateResult["info"] = {
    width: img.width,
    height: img.height,
    colors: countColors(img),
    pixelScale: detectPixelScale(img),
    partialAlpha: partialAlphaRatio(img, QUALITY.alphaEdgeTolerance),
    bounds: contentBounds(img),
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
      const candidates = spec.sizes.filter(
        (s) => img.width % s.w === 0 && img.height % s.h === 0,
      );
      let size = undefined as (typeof spec.sizes)[number] | undefined;
      if (opts.frameSize) {
        size = candidates.find((s) => s.w === opts.frameSize && s.h === opts.frameSize);
        if (!size) {
          v.push({
            rule: "anim.size",
            detail: `--size ${opts.frameSize} não encaixa em ${img.width}×${img.height} (candidatos: ${
              candidates.map((s) => s.w).join(", ") || "nenhum"
            })`,
          });
        }
      } else if (candidates.length === 0) {
        v.push({
          rule: "anim.grid",
          detail: `${img.width}×${img.height} não é grade inteira de nenhum tamanho (${spec.sizes
            .map((s) => `${s.w}×${s.h}`)
            .join(", ")})`,
        });
      } else if (candidates.length > 1) {
        v.push({
          rule: "anim.ambiguous",
          detail: `${img.width}×${img.height} casa com ${candidates
            .map((s) => s.w)
            .join(", ")} — passe --size <px> pra desambiguar`,
        });
      } else {
        size = candidates[0];
      }

      if (size && anim) {
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
    v.push({ rule: "colors", detail: `${info.colors} cores; teto é ${spec.maxColors}` });
  }

  // ── transparência ───────────────────────────────────────────────────────
  if (spec.requireTransparency) {
    if (!hasAnyTransparency(img)) {
      v.push({ rule: "transparency", detail: "fundo não é transparente (nenhum pixel alfa)" });
    } else if (!cornersTransparent(img)) {
      v.push({
        rule: "transparency.corners",
        detail: "cantos não vazios (sprite deve ser ancorado com cantos transparentes)",
      });
    }
  }

  // ── QUALIDADE de pixel art ────────────────────────────────────────────────
  if (info.partialAlpha > QUALITY.maxPartialAlphaRatio) {
    v.push({
      rule: "antialiasing",
      detail: `${(info.partialAlpha * 100).toFixed(1)}% de pixels com alpha parcial (AA); máx ${(
        QUALITY.maxPartialAlphaRatio * 100
      ).toFixed(1)}% — rode ingest com --clean`,
    });
  }
  if (QUALITY.requireUnitPixelScale && info.pixelScale > 1) {
    v.push({
      rule: "upscaled",
      detail: `imagem é upscale ${info.pixelScale}× (resolução real ${img.width / info.pixelScale}×${
        img.height / info.pixelScale
      }); gere no tamanho nativo`,
    });
  }

  return { ok: v.length === 0, type: opts.type, anim: opts.anim, info, violations: v };
}
