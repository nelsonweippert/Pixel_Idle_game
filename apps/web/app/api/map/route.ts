import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * API dos MAPAS do editor (Montador de Cenário Tiled). Dois estágios por mapa em
 * public/tilesets/<slug>/:
 *   • draft.json → RASCUNHO interno do admin (só o editor enxerga; NÃO vai pro jogo)
 *   • map.json   → PUBLICADO/no ar (o seletor CENÁRIOS do /play carrega por
 *                  `/tilesets/<slug>/map.json` e o TiledMap renderiza)
 *
 *   POST {name, doc, mode:"draft"|"publish"}
 *     - "draft"   → grava só draft.json (Salvar interno)
 *     - "publish" → grava map.json E sincroniza draft.json (Subir pra produção)
 *   GET               → lista SÓ os publicados [{slug,name}] (consumido pelo jogo)
 *   GET ?scope=admin  → lista tudo com status [{slug,name,published,dirty}] (editor)
 */
const TILESETS = path.resolve(process.cwd(), "public/tilesets");

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "mapa";

async function readJson(p: string): Promise<Record<string, unknown> | null> {
  try { return JSON.parse(await fs.readFile(p, "utf8")); } catch { return null; }
}

export async function GET(req: Request) {
  const admin = new URL(req.url).searchParams.get("scope") === "admin";
  let dirs: import("node:fs").Dirent[] = [];
  try { dirs = await fs.readdir(TILESETS, { withFileTypes: true }); } catch { /* pasta pode não existir */ }

  const maps: { slug: string; name: string; published?: boolean; dirty?: boolean }[] = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const live = await readJson(path.join(TILESETS, d.name, "map.json"));
    const draft = admin ? await readJson(path.join(TILESETS, d.name, "draft.json")) : null;

    if (admin) {
      // editor: mostra qualquer mapa que tenha rascunho OU publicado
      if (!live && !draft) continue;
      const src = draft ?? live!;
      // dirty = há rascunho ainda não publicado (sem live, ou diferente do live)
      const dirty = !!draft && (!live || JSON.stringify(draft) !== JSON.stringify(live));
      maps.push({ slug: d.name, name: (src.name as string) ?? d.name, published: !!live, dirty });
    } else {
      // jogo: só os publicados (map.json). Cenas baked/tmx antigas sem map.json ficam de fora.
      if (!live) continue;
      maps.push({ slug: d.name, name: (live.name as string) ?? d.name });
    }
  }
  return Response.json({ maps });
}

export async function POST(req: Request) {
  let body: { name?: string; doc?: Record<string, unknown>; mode?: string };
  try { body = await req.json(); } catch { return new Response("json inválido", { status: 400 }); }
  const name = (body.name ?? (body.doc?.name as string) ?? "").trim();
  if (!name || !body.doc) return new Response("faltou name/doc", { status: 400 });

  const publish = body.mode === "publish";
  const slug = slugify(name);
  const dir = path.join(TILESETS, slug);
  await fs.mkdir(dir, { recursive: true });
  const payload = JSON.stringify({ ...body.doc, name }, null, 2);

  // rascunho sempre acompanha o último estado salvo; publicar também escreve o arquivo no ar
  await fs.writeFile(path.join(dir, "draft.json"), payload);
  if (publish) await fs.writeFile(path.join(dir, "map.json"), payload);

  return Response.json({ ok: true, slug, mode: publish ? "publish" : "draft", url: `/tilesets/${slug}/map.json` });
}
