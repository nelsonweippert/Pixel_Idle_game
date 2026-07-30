import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serve o catálogo da Forja (assets/_packs/catalog.json) para o Montador de Cenário.
 * O catálogo vive FORA de /public — só o admin o consome, via esta rota.
 * Entradas são enxugadas ao que a UI precisa (thumb + facets), não o catálogo bruto.
 */
const CATALOG = path.resolve(process.cwd(), "../../assets/_packs/catalog.json");

type RawEntry = {
  slug: string;
  title: string;
  dir: string;
  sourceCategory?: string;
  kind: string;
  theme: string;
  perspective: string;
  style: string;
  animated: boolean;
  usable: boolean;
  tags?: string[];
  pngCount?: number;
  animFolders?: number;
  sample?: { path: string; w: number; h: number; colors: number };
};

export async function GET() {
  let raw: string;
  try {
    raw = await fs.readFile(CATALOG, "utf8");
  } catch {
    return Response.json(
      { error: "catálogo não encontrado — rode `npm run forge -- packs catalog`", entries: [] },
      { status: 404 },
    );
  }
  const cat = JSON.parse(raw) as {
    count: number;
    usableCount: number;
    animatedCount: number;
    byKind: Record<string, string[] | number>;
    byTheme: Record<string, string[] | number>;
    byPerspective: Record<string, string[] | number>;
    byStyle: Record<string, string[] | number>;
    entries: RawEntry[];
  };

  // os facets do catálogo mapeiam faceta → lista de slugs; a UI só quer contagem
  const counts = (m: Record<string, string[] | number>): Record<string, number> =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Array.isArray(v) ? v.length : v]));

  const entries = cat.entries.map((e) => ({
    slug: e.slug,
    title: e.title,
    dir: e.dir,
    kind: e.kind,
    theme: e.theme,
    perspective: e.perspective,
    style: e.style,
    animated: e.animated,
    usable: e.usable,
    tags: e.tags ?? [],
    pngCount: e.pngCount ?? 0,
    sample: e.sample ?? null,
  }));

  return Response.json({
    count: cat.count,
    usableCount: cat.usableCount,
    animatedCount: cat.animatedCount,
    facets: {
      kind: counts(cat.byKind),
      theme: counts(cat.byTheme),
      perspective: counts(cat.byPerspective),
      style: counts(cat.byStyle),
    },
    entries,
  });
}
