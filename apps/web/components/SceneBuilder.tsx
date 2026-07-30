"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Montador de Cenário — EDITOR DE MAPA estilo Tiled (decisão do Nelson 2026-07-12).
 *
 * Divisão de trabalho: o CLAUDE classificou os assets (public/mapkit/catalog.json),
 * o Nelson DESENHA os mapas aqui, o jogo renderiza fiel (TiledMap.renderMapkit).
 *
 * Camadas: piso WANG (terreno dual-grid auto-fundido, pincel lower/upper) + PROPS
 * (âncora no pé, y-sort) + ÁREA DE BATALHA (retângulo onde as entidades lutam).
 * Salva em public/tilesets/<slug>/map.json (via /api/map) → aparece no seletor
 * CENÁRIOS do /play. Formato = o `MapDoc` que o TiledMap lê.
 */

// ── catálogo (minha classificação) ───────────────────────────────────────────────
type WangMeta = { tileW: number; tileH: number; lower: string; upper: string; tiles: { key: string; x: number; y: number; w: number; h: number }[] };
type Pack = {
  id: string; name: string; category: "wang" | "tile" | "prop"; theme: string;
  themeLabel?: string; tags?: string[]; desc?: string;
  anchor: "feet" | "topleft"; tileW?: number; tileH?: number; wang?: WangMeta;
  files: { path: string; w: number; h: number }[];
};
type Catalog = { counts: Record<string, number>; themes: string[]; themeLabels?: Record<string, string>; packs: Pack[] };

// ── documento do mapa (== MapDoc do TiledMap) ─────────────────────────────────────
/** wang: cantos (H+1)×(W+1) de 0=lower/1=upper (dual-grid) + máscara `erased` de CÉLULAS
 *  H×W (1=buraco, célula não desenhada → borracha apaga terreno; repintar restaura). */
type WangLayer = { pack: string; png: string; tiles: WangMeta["tiles"]; corners: number[][]; erased?: number[][] };
type MapObject = { path: string; x: number; y: number; scale: number };
/** tile individual estampado: recorte (src+sub-rect) numa posição do mapa (px, canto sup-esq) */
type PlacedTile = { src: string; sx: number; sy: number; sw: number; sh: number; x: number; y: number };
type MapDoc = {
  format: "mapkit"; name: string; tileW: 16; tileH: 16; width: number; height: number;
  wang: WangLayer | null; tiles: PlacedTile[]; objects: MapObject[]; battle: { x: number; y: number; w: number; h: number };
};
/** tile escolhido na paleta pra estampar (sub-rect de um atlas/frame) */
type ActiveTile = { src: string; sx: number; sy: number; sw: number; sh: number; natW: number; natH: number };

type Tool = "wang0" | "wang1" | "tile" | "prop" | "battle" | "select" | "erase";
const T = 16;

const newCorners = (w: number, h: number, fill = 0) =>
  Array.from({ length: h + 1 }, () => Array.from({ length: w + 1 }, () => fill));
const newCells = (w: number, h: number, fill = 0) =>
  Array.from({ length: h }, () => Array.from({ length: w }, () => fill));
const freshMap = (w = 40, h = 26): MapDoc => ({
  format: "mapkit", name: "", tileW: 16, tileH: 16, width: w, height: h,
  wang: null, tiles: [], objects: [], battle: { x: Math.round(w / 2 - 6), y: Math.round(h / 2 - 4), w: 12, h: 8 },
});

// cache de imagens (módulo) — redesenha quando uma carrega
const imgCache = new Map<string, HTMLImageElement>();

/** miniatura de um tile individual: recorta um sub-rect do atlas (bg-position) e amplia
 *  nítido (pixelated). Serve tanto pra tile 32px inteiro quanto pra sub-tile wang. */
function TileThumb({ src, sx, sy, sw, sh, atlasW, atlasH, size }: {
  src: string; sx: number; sy: number; sw: number; sh: number; atlasW: number; atlasH: number; size: number;
}) {
  const k = size / Math.max(sw, sh);
  return (
    <span style={{
      display: "block", width: sw * k, height: sh * k, imageRendering: "pixelated",
      backgroundImage: `url(${src})`, backgroundRepeat: "no-repeat",
      backgroundPosition: `-${sx * k}px -${sy * k}px`, backgroundSize: `${atlasW * k}px ${atlasH * k}px`,
    }} />
  );
}

export function SceneBuilder() {
  const [cat, setCat] = useState<Catalog | null>(null);
  const [err, setErr] = useState("");
  const [map, setMap] = useState<MapDoc>(() => freshMap());
  const [tool, setTool] = useState<Tool>("wang1");
  const [brush, setBrush] = useState(2);
  const [zoom, setZoom] = useState(2);
  const [showGrid, setShowGrid] = useState(true);
  const [tab, setTab] = useState<"wang" | "tile" | "prop">("wang");
  const [theme, setTheme] = useState("");
  const [q, setQ] = useState("");
  const [openPack, setOpenPack] = useState<Pack | null>(null);
  const [selProp, setSelProp] = useState<string | null>(null);
  const [activeTile, setActiveTile] = useState<ActiveTile | null>(null);
  const [selObj, setSelObj] = useState<number | null>(null);
  const [saved, setSaved] = useState<{ slug: string; name: string; published?: boolean; dirty?: boolean }[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bump = useRef(0);
  const [, force] = useState(0);
  const redraw = useCallback(() => force((n) => n + 1), []);

  // carrega catálogo + lista de mapas salvos
  useEffect(() => {
    fetch("/mapkit/catalog.json").then((r) => r.json()).then(setCat).catch((e) => setErr("catálogo: " + e));
    refreshSaved();
  }, []);
  const refreshSaved = () => fetch("/api/map?scope=admin").then((r) => r.json()).then((d) => setSaved(d.maps ?? [])).catch(() => {});

  // imagem com cache; dispara redraw ao carregar
  const getImg = useCallback((src: string): HTMLImageElement | null => {
    let im = imgCache.get(src);
    if (im) return im.complete && im.naturalWidth ? im : null;
    im = new Image();
    im.onload = () => { bump.current++; redraw(); };
    im.src = src;
    imgCache.set(src, im);
    return null;
  }, [redraw]);

  // ── DESENHO ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const W = map.width * T * zoom, H = map.height * T * zoom;
    cv.width = W; cv.height = H;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#0b0a07"; ctx.fillRect(0, 0, W, H);

    // piso wang (resolve cada célula pelos 4 cantos)
    if (map.wang) {
      const wimg = getImg(map.wang.png);
      if (wimg) {
        const lut = new Map(map.wang.tiles.map((t) => [t.key, t]));
        const cg = map.wang.corners;
        const er = map.wang.erased;
        const terra = (n: number) => (n ? "upper" : "lower");
        for (let r = 0; r < map.height; r++) for (let c = 0; c < map.width; c++) {
          if (er?.[r]?.[c]) continue; // célula apagada pela borracha (buraco)
          const bb = lut.get(`${terra(cg[r][c + 1])}_${terra(cg[r][c])}_${terra(cg[r + 1][c + 1])}_${terra(cg[r + 1][c])}`);
          if (!bb) continue;
          ctx.drawImage(wimg, bb.x, bb.y, bb.w, bb.h, c * T * zoom, r * T * zoom, T * zoom, T * zoom);
        }
      }
    }

    // tiles individuais estampados (sobre o piso wang, sob os props)
    for (const t of map.tiles) {
      const im = getImg(t.src); if (!im) continue;
      ctx.drawImage(im, t.sx, t.sy, t.sw, t.sh, t.x * zoom, t.y * zoom, t.sw * zoom, t.sh * zoom);
    }

    // props (y-sort)
    [...map.objects].map((o, i) => ({ o, i })).sort((a, b) => a.o.y - b.o.y).forEach(({ o, i }) => {
      const im = getImg(o.path); if (!im) return;
      const w = im.naturalWidth * o.scale * zoom, h = im.naturalHeight * o.scale * zoom;
      ctx.drawImage(im, o.x * zoom - w / 2, o.y * zoom - h, w, h);
      if (i === selObj) { ctx.strokeStyle = "#f2c14e"; ctx.lineWidth = 1.5; ctx.strokeRect(o.x * zoom - w / 2, o.y * zoom - h, w, h); }
    });

    // grade
    if (showGrid) {
      ctx.strokeStyle = "rgba(242,193,78,0.12)"; ctx.lineWidth = 1;
      for (let c = 0; c <= map.width; c++) { ctx.beginPath(); ctx.moveTo(c * T * zoom, 0); ctx.lineTo(c * T * zoom, H); ctx.stroke(); }
      for (let r = 0; r <= map.height; r++) { ctx.beginPath(); ctx.moveTo(0, r * T * zoom); ctx.lineTo(W, r * T * zoom); ctx.stroke(); }
    }

    // área de batalha
    const b = map.battle;
    ctx.fillStyle = "rgba(242,193,78,0.14)";
    ctx.fillRect(b.x * T * zoom, b.y * T * zoom, b.w * T * zoom, b.h * T * zoom);
    ctx.strokeStyle = "#f2c14e"; ctx.setLineDash([6, 4]); ctx.lineWidth = 2;
    ctx.strokeRect(b.x * T * zoom, b.y * T * zoom, b.w * T * zoom, b.h * T * zoom);
    ctx.setLineDash([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, zoom, showGrid, selObj, getImg, bump.current]);

  // ── seleção de terreno wang (inicializa a camada) ─────────────────────────────
  const pickWang = (p: Pack) => {
    if (!p.wang) return;
    setMap((m) => ({
      ...m,
      wang: {
        pack: p.id, png: p.files[0].path, tiles: p.wang!.tiles,
        corners: m.wang && m.wang.corners.length === m.height + 1 ? m.wang.corners : newCorners(m.width, m.height),
        erased: m.wang?.erased && m.wang.erased.length === m.height ? m.wang.erased : newCells(m.width, m.height),
      },
    }));
    setTool("wang1");
  };

  // ── interação no canvas ────────────────────────────────────────────────────────
  const evtToMap = (e: React.PointerEvent) => {
    const cv = canvasRef.current!; const rect = cv.getBoundingClientRect();
    const px = (e.clientX - rect.left) / zoom, py = (e.clientY - rect.top) / zoom;
    return { px, py, cx: px / T, cy: py / T };
  };

  const paintWang = (cx: number, cy: number, terrain: number) => {
    setMap((m) => {
      if (!m.wang) return m;
      const cg = m.wang.corners.map((r) => r.slice());
      const vx = Math.round(cx), vy = Math.round(cy);
      const rad = brush;
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
        if (dx * dx + dy * dy > rad * rad) continue;
        const x = vx + dx, y = vy + dy;
        if (y >= 0 && y < cg.length && x >= 0 && x < cg[0].length) cg[y][x] = terrain;
      }
      // repintar terreno RESTAURA os buracos da borracha nas células sob o pincel
      let er = m.wang.erased;
      if (er) {
        er = er.map((r) => r.slice());
        const ccx = Math.floor(cx), ccy = Math.floor(cy);
        for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
          if (dx * dx + dy * dy > rad * rad) continue;
          const x = ccx + dx, y = ccy + dy;
          if (y >= 0 && y < m.height && x >= 0 && x < m.width) er[y][x] = 0;
        }
      }
      return { ...m, wang: { ...m.wang, corners: cg, erased: er } };
    });
  };

  // estampa o tile ativo, encaixado na grade do próprio tile (16 ou 32); 1 por célula
  const stampTile = (px: number, py: number) => {
    if (!activeTile) return;
    const g = Math.max(T, Math.round(activeTile.sw));
    const x = Math.floor(px / g) * g, y = Math.floor(py / g) * g;
    setMap((m) => ({
      ...m,
      tiles: [...m.tiles.filter((t) => !(t.x === x && t.y === y && t.sw === activeTile.sw)),
        { src: activeTile.src, sx: activeTile.sx, sy: activeTile.sy, sw: activeTile.sw, sh: activeTile.sh, x, y }],
    }));
  };

  // borracha: apaga o que estiver sob o cursor — prop no topo primeiro, senão o tile que cobre o ponto
  const eraseAt = (px: number, py: number) => {
    setMap((m) => {
      const pIdx = [...m.objects].map((o, i) => ({ o, i })).sort((a, b) => b.o.y - a.o.y).find(({ o }) => {
        const im = imgCache.get(o.path); if (!im?.naturalWidth) return false;
        const w = im.naturalWidth * o.scale, h = im.naturalHeight * o.scale;
        return px >= o.x - w / 2 && px <= o.x + w / 2 && py >= o.y - h && py <= o.y;
      })?.i;
      if (pIdx !== undefined) { if (pIdx === selObj) setSelObj(null); return { ...m, objects: m.objects.filter((_, i) => i !== pIdx) }; }
      const tIdx = [...m.tiles].map((t, i) => ({ t, i })).reverse().find(({ t }) => px >= t.x && px < t.x + t.sw && py >= t.y && py < t.y + t.sh)?.i;
      if (tIdx !== undefined) return { ...m, tiles: m.tiles.filter((_, i) => i !== tIdx) };
      // por último, o TERRENO wang: fura a(s) célula(s) sob o cursor (raio do pincel)
      if (m.wang) {
        const rad = brush;
        const ccx = Math.floor(px / T), ccy = Math.floor(py / T);
        const er = (m.wang.erased ?? newCells(m.width, m.height)).map((r) => r.slice());
        let changed = false;
        for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
          if (dx * dx + dy * dy > rad * rad) continue;
          const x = ccx + dx, y = ccy + dy;
          if (y >= 0 && y < m.height && x >= 0 && x < m.width && !er[y][x]) { er[y][x] = 1; changed = true; }
        }
        if (changed) return { ...m, wang: { ...m.wang, erased: er } };
      }
      return m;
    });
  };

  const dragRef = useRef<{ mode: string; startX: number; startY: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const { px, py, cx, cy } = evtToMap(e);
    if (tool === "wang0" || tool === "wang1") { paintWang(cx, cy, tool === "wang1" ? 1 : 0); dragRef.current = { mode: tool, startX: 0, startY: 0 }; return; }
    if (tool === "tile" && activeTile) { stampTile(px, py); dragRef.current = { mode: "tile", startX: 0, startY: 0 }; return; }
    if (tool === "prop" && selProp) {
      setMap((m) => ({ ...m, objects: [...m.objects, { path: selProp, x: Math.round(px), y: Math.round(py), scale: 1 }] }));
      setSelObj(map.objects.length); return;
    }
    if (tool === "battle") { dragRef.current = { mode: "battle", startX: Math.floor(cx), startY: Math.floor(cy) }; return; }
    if (tool === "select") {
      // pega o objeto (topo por y) cujo bbox contém o ponto
      let hit: number | null = null;
      [...map.objects].map((o, i) => ({ o, i })).sort((a, b) => b.o.y - a.o.y).some(({ o, i }) => {
        const im = imgCache.get(o.path); if (!im?.naturalWidth) return false;
        const w = im.naturalWidth * o.scale, h = im.naturalHeight * o.scale;
        if (px >= o.x - w / 2 && px <= o.x + w / 2 && py >= o.y - h && py <= o.y) { hit = i; return true; }
        return false;
      });
      setSelObj(hit);
      if (hit !== null) dragRef.current = { mode: "move", startX: px - map.objects[hit].x, startY: py - map.objects[hit].y };
      return;
    }
    if (tool === "erase") { eraseAt(px, py); dragRef.current = { mode: "erase", startX: 0, startY: 0 }; return; }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const { px, py, cx, cy } = evtToMap(e);
    const d = dragRef.current;
    if (d.mode === "wang0" || d.mode === "wang1") paintWang(cx, cy, d.mode === "wang1" ? 1 : 0);
    else if (d.mode === "tile") stampTile(px, py);
    else if (d.mode === "erase") eraseAt(px, py);
    else if (d.mode === "battle") {
      const x0 = d.startX, y0 = d.startY, x1 = Math.floor(cx), y1 = Math.floor(cy);
      setMap((m) => ({ ...m, battle: { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0) + 1, h: Math.abs(y1 - y0) + 1 } }));
    } else if (d.mode === "move" && selObj !== null) {
      setMap((m) => ({ ...m, objects: m.objects.map((o, i) => (i === selObj ? { ...o, x: Math.round(px - d.startX), y: Math.round(py - d.startY) } : o)) }));
    }
  };
  const onUp = () => { dragRef.current = null; };

  // apagar prop selecionado com Delete/Backspace (ignora quando digitando num campo)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selObj !== null) {
        e.preventDefault();
        setMap((m) => ({ ...m, objects: m.objects.filter((_, i) => i !== selObj) }));
        setSelObj(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selObj]);

  // ── salvar / carregar / exportar ──────────────────────────────────────────────
  // persiste o mapa: "draft" = rascunho interno (só o editor vê) · "publish" = no ar (vai pro jogo)
  const persist = async (mode: "draft" | "publish") => {
    const nm = (name || map.name).trim();
    if (!nm) { setBusy("dê um nome ao mapa"); return; }
    setBusy(mode === "publish" ? "subindo pra produção…" : "salvando rascunho…");
    try {
      const r = await fetch("/api/map", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: nm, doc: { ...map, name: nm }, mode }),
      });
      const d = await r.json();
      setBusy(!d.ok ? "falhou: " + (d.error ?? r.status)
        : mode === "publish" ? `🚀 no ar → aparece no jogo (recarregue o /play)` : `💾 rascunho salvo (interno)`);
      setMap((m) => ({ ...m, name: nm })); refreshSaved();
    } catch (e) { setBusy("erro: " + e); }
  };
  const load = async (slug: string) => {
    setBusy("carregando…");
    try {
      // prefere o rascunho (última edição do admin); cai no publicado se não houver
      const doc = await fetch(`/tilesets/${slug}/draft.json`).then((r) => r.ok ? r.json() : null)
        .catch(() => null) ?? await fetch(`/tilesets/${slug}/map.json`).then((r) => r.json());
      // normaliza mapas antigos (sem a camada de tiles individuais)
      setMap({ ...doc, tiles: doc.tiles ?? [], objects: doc.objects ?? [] });
      setName(doc.name ?? slug); setSelObj(null); setBusy(`carregado: ${doc.name ?? slug}`);
    } catch (e) { setBusy("erro: " + e); }
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ ...map, name: name || map.name || "mapa" }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = (name || "mapa") + ".json"; a.click(); URL.revokeObjectURL(a.href);
  };

  // ── paleta filtrada ────────────────────────────────────────────────────────────
  const packs = useMemo(() => {
    if (!cat) return [];
    const needle = q.trim().toLowerCase();
    // TILE tab expõe tanto os packs de tile 32px quanto os atlas wang (fatiados em 16)
    const catOk = (p: Pack) => tab === "wang" ? p.category === "wang" : tab === "prop" ? p.category === "prop" : (p.category === "tile" || p.category === "wang");
    const match = (p: Pack) => !needle || p.name.toLowerCase().includes(needle) || p.id.toLowerCase().includes(needle)
      || (p.themeLabel ?? "").toLowerCase().includes(needle) || (p.tags ?? []).some((t) => t.toLowerCase().includes(needle));
    return cat.packs.filter((p) => catOk(p) && (!theme || p.theme === theme) && match(p));
  }, [cat, tab, theme, q]);

  const sel = selObj !== null ? map.objects[selObj] : null;

  // status de publicação do mapa atual (casado pelo slug do nome) — pro painel Publicação
  const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  const curSlug = slugify((name || map.name).trim());
  const curStatus = saved.find((s) => s.slug === curSlug);

  // redimensiona o mapa preservando o que couber (corners + battle re-encaixados)
  const setSize = (w: number, h: number) => setMap((m) => {
    w = Math.max(8, Math.min(120, w || m.width)); h = Math.max(8, Math.min(120, h || m.height));
    let wang = m.wang;
    if (wang) {
      const cg = newCorners(w, h, 0);
      for (let y = 0; y <= Math.min(h, m.height); y++) for (let x = 0; x <= Math.min(w, m.width); x++) cg[y][x] = wang.corners[y]?.[x] ?? 0;
      const er = newCells(w, h, 0);
      for (let y = 0; y < Math.min(h, m.height); y++) for (let x = 0; x < Math.min(w, m.width); x++) er[y][x] = wang.erased?.[y]?.[x] ?? 0;
      wang = { ...wang, corners: cg, erased: er };
    }
    const b = m.battle;
    const battle = { x: Math.min(b.x, w - 1), y: Math.min(b.y, h - 1), w: Math.min(b.w, w), h: Math.min(b.h, h) };
    return { ...m, width: w, height: h, wang, battle };
  });

  const TOOLS: [Tool, string, boolean][] = [
    ["wang1", "▚ Terreno A", false], ["wang0", "▞ Terreno B", false], ["tile", "▦ Tile", !activeTile],
    ["prop", "🌲 Prop", !selProp], ["battle", "⚔ Batalha", false], ["select", "➤ Selecionar", false], ["erase", "✕ Apagar", false],
  ];
  const hint = tool.startsWith("wang")
    ? (map.wang ? "Pinte o terreno — as bordas se fundem sozinhas." : "Escolha um terreno na paleta pra começar.")
    : tool === "tile" ? (activeTile ? "Clique/arraste pra estampar o tile, célula a célula." : "Abra a aba Tiles e escolha um tile.")
    : tool === "prop" ? (selProp ? "Clique no mapa pra largar o prop." : "Abra um pack e escolha um prop.")
    : tool === "battle" ? "Arraste no mapa pra marcar a área de batalha."
    : tool === "erase" ? "Clique ou arraste pra apagar: props/tiles primeiro, depois fura o terreno (tamanho = pincel). Repinte com Terreno A/B pra restaurar."
    : "Clique num prop pra selecioná-lo — arraste pra mover, Delete pra excluir.";

  return (
    <div className="mb">
      {/* ── TOOLBAR ── */}
      <div className="mb-toolbar">
        <div className="mb-group">
          {TOOLS.map(([t, lbl, dis]) => (
            <button key={t} className="mb-tool" data-on={tool === t ? "1" : "0"}
              disabled={dis} onClick={() => setTool(t)}>{lbl}</button>
          ))}
        </div>
        <span className="mb-sep" />
        <label className="mb-slider">pincel <input type="range" min={0} max={6} value={brush} onChange={(e) => setBrush(Number(e.target.value))} /> {brush}</label>
        <label className="mb-slider">zoom <input type="range" min={1} max={4} step={0.5} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /> {zoom}×</label>
        <label className="mb-slider"><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> grade</label>
        <span style={{ flex: 1 }} />
        <select className="mb-input" value="" onChange={(e) => e.target.value && load(e.target.value)}>
          <option value="">carregar…</option>
          {saved.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.published ? (s.dirty ? "● " : "✓ ") : "◌ "}{s.name}
            </option>
          ))}
        </select>
        <input className="mb-input" style={{ width: 150 }} placeholder="nome do mapa" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="mb-tool" onClick={() => persist("draft")} title="Salvar rascunho interno (não vai pro jogo)">💾 Salvar</button>
        <button className="mb-tool" data-on="1" onClick={() => persist("publish")} title="Subir pra produção — aparece no jogo">🚀 Subir</button>
        <button className="mb-tool" onClick={exportJson}>↓ JSON</button>
        <button className="mb-tool" onClick={() => { setMap(freshMap()); setName(""); setSelObj(null); }}>＋ Novo</button>
      </div>
      {(busy || err) && <div className="mb-status">{err ? "⚠ " + err : busy}</div>}

      <div className="mb-body">
        {/* ── PALETA ── */}
        <div className="mb-pal">
          <div className="mb-palhead">
            <button className="mb-pilltab" data-on={tab === "wang" ? "1" : "0"} onClick={() => { setTab("wang"); setOpenPack(null); }}>Terreno</button>
            <button className="mb-pilltab" data-on={tab === "tile" ? "1" : "0"} onClick={() => { setTab("tile"); setOpenPack(null); }}>Tiles</button>
            <button className="mb-pilltab" data-on={tab === "prop" ? "1" : "0"} onClick={() => { setTab("prop"); setOpenPack(null); }}>Props</button>
          </div>
          <div className="mb-palfilters">
            <select className="mb-input" value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="">todos os temas</option>
              {cat?.themes.map((t) => <option key={t} value={t}>{cat.themeLabels?.[t] ?? t}</option>)}
            </select>
            <input className="mb-input" placeholder="buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="mb-palscroll">
            {!openPack ? (
              <>
                <div className="mb-count">{cat ? `${packs.length} ${tab === "wang" ? "terrenos" : tab === "tile" ? "conjuntos" : "packs"}` : "carregando…"}</div>
                <div className="mb-cards">
                  {packs.map((p) => (
                    <button key={p.id} className="mb-card" data-on={tab === "wang" && map.wang?.pack === p.id ? "1" : "0"}
                      onClick={() => (tab === "wang" ? pickWang(p) : setOpenPack(p))} title={p.desc || (p.wang ? `${p.wang.lower} → ${p.wang.upper}` : p.name)}>
                      <div className="mb-thumb"><img src={p.files[0].path} alt="" loading="lazy" style={p.category === "wang" ? { width: 44 } : undefined} /></div>
                      <div className="mb-cn">{p.name}</div>
                      <div className="mb-ct">{p.themeLabel ?? p.theme}{tab === "prop" ? ` · ${p.files.length}` : tab === "tile" ? ` · ${p.category === "wang" ? (p.wang?.tiles.length ?? 0) : p.files.length} tiles` : ""}</div>
                    </button>
                  ))}
                </div>
              </>
            ) : tab === "prop" ? (
              <>
                <button className="mb-back" onClick={() => setOpenPack(null)}>← todos os packs</button>
                <div className="mb-count">{openPack.name} · {openPack.files.length} sprites</div>
                <div className="mb-files">
                  {openPack.files.map((f) => (
                    <button key={f.path} className="mb-file" data-on={selProp === f.path ? "1" : "0"}
                      onClick={() => { setSelProp(f.path); setTool("prop"); }} title={`${f.w}×${f.h}`}>
                      <img src={f.path} alt="" loading="lazy" />
                    </button>
                  ))}
                </div>
              </>
            ) : (
              // TILES: fatia o conjunto em tiles individuais e deixa escolher um pra estampar
              <>
                <button className="mb-back" onClick={() => setOpenPack(null)}>← todos os conjuntos</button>
                {(() => {
                  const atlas = openPack.files[0];
                  const frames = openPack.category === "wang" && openPack.wang
                    ? openPack.wang.tiles.map((t) => ({ id: t.key, src: atlas.path, sx: t.x, sy: t.y, sw: t.w, sh: t.h, aw: atlas.w, ah: atlas.h }))
                    : openPack.files.map((f) => ({ id: f.path, src: f.path, sx: 0, sy: 0, sw: f.w, sh: f.h, aw: f.w, ah: f.h }));
                  return (
                    <>
                      <div className="mb-count">{openPack.name} · {frames.length} tiles</div>
                      <div className="mb-files">
                        {frames.map((fr) => {
                          const on = !!activeTile && activeTile.src === fr.src && activeTile.sx === fr.sx && activeTile.sy === fr.sy;
                          return (
                            <button key={fr.id} className="mb-file" data-on={on ? "1" : "0"}
                              onClick={() => { setActiveTile({ src: fr.src, sx: fr.sx, sy: fr.sy, sw: fr.sw, sh: fr.sh, natW: fr.aw, natH: fr.ah }); setTool("tile"); }}
                              title={`${fr.sw}×${fr.sh}`}>
                              <TileThumb src={fr.src} sx={fr.sx} sy={fr.sy} sw={fr.sw} sh={fr.sh} atlasW={fr.aw} atlasH={fr.ah} size={40} />
                            </button>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </>
            )}
          </div>
        </div>

        {/* ── PALCO ── */}
        <div className="mb-stage">
          <canvas ref={canvasRef} style={{ cursor: tool === "select" ? "move" : "crosshair", touchAction: "none" }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} />
        </div>

        {/* ── INSPETOR ── */}
        <div className="mb-side">
          <div className="mb-sec">
            <h4>Camadas</h4>
            <div className="mb-layer" data-on={map.wang ? "1" : "0"}>▚ Terreno <span className="mb-lmuted">{map.wang ? map.wang.pack.replace("wang/", "") : "—"}</span></div>
            <div className="mb-layer" data-on={map.tiles.length ? "1" : "0"}>▦ Tiles <span className="mb-lmuted">{map.tiles.length}</span></div>
            <div className="mb-layer">🌲 Props <span className="mb-lmuted">{map.objects.length}</span></div>
            <div className="mb-layer">⚔ Batalha <span className="mb-lmuted">{map.battle.w}×{map.battle.h}</span></div>
          </div>
          <div className="mb-sec">
            <h4>Mapa</h4>
            <div className="mb-row">largura <input className="mb-num" type="number" min={8} max={120} value={map.width} onChange={(e) => setSize(Number(e.target.value), map.height)} /> tiles</div>
            <div className="mb-row">altura <input className="mb-num" type="number" min={8} max={120} value={map.height} onChange={(e) => setSize(map.width, Number(e.target.value))} /> tiles</div>
          </div>
          <div className="mb-sec">
            <h4>Inspetor</h4>
            {sel ? (
              <>
                <div className="mb-row mb-lmuted" style={{ fontSize: 11, wordBreak: "break-all" }}>{sel.path.split("/").pop()}</div>
                <div className="mb-row">escala {sel.scale.toFixed(2)}×</div>
                <input style={{ width: "100%", accentColor: "var(--lg-gold-deep)" }} type="range" min={0.25} max={4} step={0.25} value={sel.scale}
                  onChange={(e) => setMap((m) => ({ ...m, objects: m.objects.map((o, i) => (i === selObj ? { ...o, scale: Number(e.target.value) } : o)) }))} />
                <button className="mb-tool" style={{ marginTop: 8, width: "100%", color: "#ed8099", borderColor: "#7a3045", background: "rgba(122,48,69,0.18)" }}
                  onClick={() => { setMap((m) => ({ ...m, objects: m.objects.filter((_, i) => i !== selObj) })); setSelObj(null); }}>✕ Excluir prop <span style={{ opacity: 0.6 }}>(Del)</span></button>
              </>
            ) : (
              <div className="mb-hint">{hint}</div>
            )}
          </div>
          <div className="mb-sec">
            <h4>Publicação</h4>
            <div className="mb-layer" data-on={curStatus?.published ? "1" : "0"}>
              Estado <span className="mb-lmuted">{
                !curStatus ? "novo (não salvo)"
                : curStatus.published ? (curStatus.dirty ? "● no ar + rascunho novo" : "✓ publicado")
                : "◌ só rascunho"
              }</span>
            </div>
            <div className="mb-hint" style={{ marginTop: 6 }}>
              <b>💾 Salvar</b> guarda um rascunho interno — só aparece aqui no Montador.<br />
              <b>🚀 Subir</b> envia pra produção — o mapa entra no seletor CENÁRIOS do jogo.
            </div>
          </div>
          {cat && <div className="mb-sec"><h4>Biblioteca</h4><div className="mb-hint">{cat.counts.wang} terrenos · {cat.counts.tile} tiles · {cat.counts.prop} packs de prop · {cat.counts.files} assets classificados.</div></div>}
        </div>
      </div>
    </div>
  );
}
