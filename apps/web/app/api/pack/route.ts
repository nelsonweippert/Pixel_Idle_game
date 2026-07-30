import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lista os PNGs úteis de UM pack, pro usuário abrir o pack e escolher o sprite/tile
 * exato que quer colocar na cena. Filtra lixo: orig(_big).png (dup 4×), __MACOSX,
 * .DS_Store, e pastas de fonte (PSD/ASEPRITE/EPS/SCML). Teto de 400 arquivos.
 */
const ASSETS_ROOT = path.resolve(process.cwd(), "../../assets");
const IMG = new Set([".png", ".gif"]);
const SKIP_DIR = new Set(["__MACOSX", "PSD", "ASEPRITE", "EPS", "SCML", ".git"]);
const SKIP_FILE = /^(orig|orig_big)\.png$/i;
const CAP = 400;

async function walk(dir: string, base: string, out: { path: string; name: string; rel: string }[]) {
  if (out.length >= CAP) return;
  let ents;
  try {
    ents = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of ents) {
    if (out.length >= CAP) return;
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue;
      await walk(full, base, out);
    } else if (IMG.has(path.extname(e.name).toLowerCase()) && !SKIP_FILE.test(e.name)) {
      const rel = path.relative(ASSETS_ROOT, full).split(path.sep).join("/");
      out.push({ path: rel, name: e.name, rel: path.relative(base, full).split(path.sep).join("/") });
    }
  }
}

export async function GET(req: Request) {
  const dirRel = new URL(req.url).searchParams.get("dir");
  if (!dirRel) return Response.json({ error: "faltou ?dir=" }, { status: 400 });

  const abs = path.resolve(ASSETS_ROOT, dirRel);
  if (abs !== ASSETS_ROOT && !abs.startsWith(ASSETS_ROOT + path.sep)) {
    return Response.json({ error: "path fora de assets/" }, { status: 403 });
  }

  const files: { path: string; name: string; rel: string }[] = [];
  await walk(abs, abs, files);
  files.sort((a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true }));
  return Response.json({ dir: dirRel, count: files.length, capped: files.length >= CAP, files });
}
