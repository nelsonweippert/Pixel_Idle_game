import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streama um PNG/GIF de assets/ (fora do /public) pro Montador.
 * `p` é relativo à pasta assets/ (ex.: "_packs/top-down-sprites/.../foo.png"),
 * exatamente como o catálogo grava em `dir`/`sample.path`.
 * Trava travessia de path: o arquivo resolvido TEM que ficar dentro de assets/.
 */
const ASSETS_ROOT = path.resolve(process.cwd(), "../../assets");
const OK_EXT = new Set([".png", ".gif", ".jpg", ".jpeg", ".webp"]);
const MIME: Record<string, string> = {
  ".png": "image/png",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export async function GET(req: Request) {
  const rel = new URL(req.url).searchParams.get("p");
  if (!rel) return new Response("faltou ?p=", { status: 400 });

  const ext = path.extname(rel).toLowerCase();
  if (!OK_EXT.has(ext)) return new Response("extensão não permitida", { status: 400 });

  const abs = path.resolve(ASSETS_ROOT, rel);
  if (abs !== ASSETS_ROOT && !abs.startsWith(ASSETS_ROOT + path.sep)) {
    return new Response("path fora de assets/", { status: 403 });
  }

  try {
    const buf = await fs.readFile(abs);
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": MIME[ext] ?? "application/octet-stream",
        "cache-control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return new Response("não encontrado", { status: 404 });
  }
}
