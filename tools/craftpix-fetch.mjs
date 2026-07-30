/**
 * craftpix-fetch — baixa packs da CraftPix com a SUA assinatura (membership).
 *
 * Legal: você tem licença comercial dos assets (membership). Isto automatiza os
 * SEUS downloads autenticados. Educado com o servidor: throttle + resumível.
 * NÃO redistribui os arquivos-fonte (proibido pela licença) — fica só no seu repo,
 * gitignorado (assets/_packs/).
 *
 * Fases:
 *   node tools/craftpix-fetch.mjs login      # VOCÊ: abre navegador, loga, salva sessão
 *   node tools/craftpix-fetch.mjs collect    # dry: varre categorias → craftpix-list.json
 *   node tools/craftpix-fetch.mjs download   # baixa ZIPs + descompacta + proveniência
 *
 * Princípio: baixa LARGO pro pool (assets/_packs/); a Forja classifica; a gente
 * compõe o JOGO de uma fatia coerente depois.
 */

import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const require = createRequire("C:/Users/Storming/Desktop/GItHubs/stonegy-automator/");
const { chromium } = require("playwright");

const ROOT = "C:/Users/Storming/Desktop/GItHubs/Pixel_Idle_game";
const AUTH = path.join(ROOT, "tools/.craftpix-auth.json");
const LIST = path.join(ROOT, "tools/craftpix-list.json");
const PACKS = path.join(ROOT, "assets/_packs");
const ZIPS = path.join(PACKS, "_zips");
const PROV = path.join(PACKS, "PROVENANCE.json");
const BASE = "https://craftpix.net";

// Categorias-alvo (top-down + pixel dark-fantasy + suporte). label = pasta de destino.
// Ajustável: é aqui que a curadoria de ENTRADA acontece (não baixar side-view/vetor).
const CATEGORIES = [
  { label: "top-down-sprites", url: "/categorys/top-down-sprites/" },
  { label: "top-down-tilesets", url: "/categorys/top-down-tilesets/" },
  { label: "icons", url: "/categorys/game-icons/" },
  { label: "gui", url: "/categorys/game-gui/" },
];
const MAX_PAGES = 40; // trava de segurança por categoria
const THROTTLE_MS = 2500; // educado entre downloads

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);
const nowIso = () => new Date().toISOString();

async function haveAuth() {
  return !!(await fs.stat(AUTH).catch(() => null));
}

// ── LOGIN: headed, você autentica; detecto o cookie de sessão e salvo sozinho ─
async function cmdLogin() {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  // WooCommerce/WordPress: página de conta/login
  await page.goto(BASE + "/my-account/", { waitUntil: "domcontentloaded" }).catch(() => {});
  console.log("\n  >>> Uma janela do Chrome abriu. FAÇA LOGIN na sua conta CraftPix (membership).");
  console.log("  >>> Assim que logar, EU detecto sozinho e salvo a sessão. Pode deixar rolando.\n");
  // CraftPix roda WordPress → cookie `wordpress_logged_in_*` aparece ao logar.
  const DEADLINE = Date.now() + 8 * 60 * 1000; // 8 min pra você logar
  let saved = false;
  while (Date.now() < DEADLINE) {
    const cookies = await ctx.cookies().catch(() => []);
    if (cookies.some((c) => /wordpress_logged_in/i.test(c.name))) {
      await ctx.storageState({ path: AUTH });
      console.log(`\n  ✔ login detectado — sessão salva em ${path.relative(ROOT, AUTH)} (gitignorado).`);
      saved = true;
      break;
    }
    await sleep(2500);
  }
  if (!saved) console.log("\n  ⚠ não detectei login em 8min. Rode de novo e logue na janela.");
  await sleep(1500);
  await browser.close();
}

async function newCtx(browser, headless = true) {
  if (!(await haveAuth())) throw new Error("sem sessão — rode `login` primeiro.");
  return browser.newContext({ storageState: AUTH, acceptDownloads: true });
}

// ── COLLECT: varre categorias, junta URLs de produto (dry, não baixa) ────────
async function cmdCollect() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await newCtx(browser);
  const page = await ctx.newPage();
  const all = [];
  const seen = new Set();

  for (const cat of CATEGORIES) {
    console.log(`\n=== categoria ${cat.label} ===`);
    for (let pg = 1; pg <= MAX_PAGES; pg++) {
      const url = `${BASE}${cat.url}${pg > 1 ? `page/${pg}/` : ""}`;
      await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
      await sleep(400);
      // links de produto na listagem
      const links = await page.$$eval("a[href*='/product/']", (as) =>
        as.map((a) => ({ href: a.href, title: (a.getAttribute("title") || a.textContent || "").trim() })),
      ).catch(() => []);
      const fresh = links.filter((l) => l.href.includes("/product/") && !seen.has(l.href));
      for (const l of fresh) {
        seen.add(l.href);
        const slug = slugify(l.href.replace(/.*\/product\//, "").replace(/\/$/, ""));
        all.push({ category: cat.label, productUrl: l.href.split("?")[0], slug, title: l.title || slug });
      }
      console.log(`  page ${pg}: +${fresh.length} produtos (total ${all.length})`);
      if (fresh.length === 0) break; // fim da categoria
      await sleep(THROTTLE_MS / 2);
    }
  }
  // dedup por slug
  const bySlug = new Map(all.map((p) => [p.slug, p]));
  const list = [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  await fs.writeFile(LIST, JSON.stringify({ collectedAt: nowIso(), count: list.length, categories: CATEGORIES.map((c) => c.label), packs: list }, null, 2));
  console.log(`\n  ✔ ${list.length} packs únicos → ${path.relative(ROOT, LIST)}`);
  console.log("  revise a lista; depois rode `download`.");
  await browser.close();
}

// ── DOWNLOAD: por produto, dispara o download do ZIP + descompacta ──────────
async function extractZip(zip, dest) {
  await fs.mkdir(dest, { recursive: true });
  // extrai; remove lixo macOS (__MACOSX/.DS_Store); apaga o zip (economiza disco)
  const ps = [
    `Expand-Archive -Path '${zip}' -DestinationPath '${dest}' -Force`,
    `Get-ChildItem -Path '${dest}' -Recurse -Force -Directory -Filter '__MACOSX' | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue`,
    `Get-ChildItem -Path '${dest}' -Recurse -Force -Filter '.DS_Store' | Remove-Item -Force -ErrorAction SilentlyContinue`,
    `Remove-Item -Path '${zip}' -Force -ErrorAction SilentlyContinue`,
  ].join("; ");
  const r = spawnSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" });
  return r.status === 0;
}

async function readProv() {
  try { return JSON.parse(await fs.readFile(PROV, "utf8")); } catch { return { updatedAt: "", entries: {} }; }
}

async function loadPacks() {
  const listRaw = await fs.readFile(LIST, "utf8").catch(() => null);
  if (!listRaw) throw new Error("sem craftpix-list.json — rode `collect` primeiro.");
  const limit = Number(process.argv[3]) || Infinity; // `download 3` = só os 3 primeiros (teste)
  return { packs: JSON.parse(listRaw).packs.slice(0, limit), limit };
}

/** baixa 1 pack. retorna "ok" | "skip" | "fail". nunca lança (tolerante a falha). */
async function downloadOne(page, prov, p, idx, total) {
  if (prov.entries[p.slug]?.done) return "skip"; // resumível
  const destDir = path.join(PACKS, p.category, p.slug);
  console.log(`[${idx}/${total}] ${p.slug} (${p.category})`);
  try {
    await page.goto(p.productUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await sleep(500);
    const dlSel = "a[href*='/download/'], a.download-button, .download-button a, a:has-text('Download')";
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 45000 }),
      page.click(dlSel, { timeout: 15000 }).catch(async () => {
        const href = await page.$eval("a[href*='/download/']", (a) => a.href).catch(() => null);
        if (href) await page.goto(href).catch(() => {});
      }),
    ]);
    const zipPath = path.join(ZIPS, `${p.slug}.zip`);
    await download.saveAs(zipPath);
    const extracted = await extractZip(zipPath, destDir);
    const files = extracted ? (await fs.readdir(destDir).catch(() => [])).length : 0;
    prov.entries[p.slug] = { title: p.title, productUrl: p.productUrl, category: p.category, done: extracted, files, at: nowIso(), license: "CraftPix membership (comercial; NÃO redistribuir fonte; NÃO treinar IA)" };
    prov.updatedAt = nowIso();
    await fs.writeFile(PROV, JSON.stringify(prov, null, 2));
    if (extracted) { console.log(`  ✔ (${files} itens)`); return "ok"; }
    console.log("  ⚠ baixou mas extração falhou"); return "fail";
  } catch (e) {
    console.log(`  ✘ ${String(e.message).slice(0, 80)}`);
    return "fail";
  }
}

async function downloadPass(page, packs, prov) {
  let ok = 0, skip = 0, fail = 0;
  for (let i = 0; i < packs.length; i++) {
    const r = await downloadOne(page, prov, packs[i], i + 1, packs.length);
    if (r === "ok") ok++; else if (r === "skip") skip++; else fail++;
    if (r !== "skip") await sleep(THROTTLE_MS);
  }
  return { ok, skip, fail };
}

async function cmdDownload() {
  const { packs, limit } = await loadPacks();
  console.log(`  alvo: ${packs.length} pack(s)${limit !== Infinity ? " (LIMITE DE TESTE)" : ""}`);
  await fs.mkdir(ZIPS, { recursive: true });
  const prov = await readProv();
  const browser = await chromium.launch({ headless: true });
  const ctx = await newCtx(browser);
  const page = await ctx.newPage();
  const r = await downloadPass(page, packs, prov);
  console.log(`\n  === FIM: ${r.ok} baixados · ${r.skip} já tinham · ${r.fail} falharam ===`);
  await browser.close();
}

/**
 * AUTO — orquestrador autônomo (roda destacado a noite toda):
 * várias passadas com retry (auto-cura falhas transientes) → classifica (forge
 * packs catalog) → resumo. Cada passada reabre o browser (resiliente a crash de
 * página). Nunca aborta por 1 pack ruim.
 */
async function cmdAuto() {
  const { packs } = await loadPacks();
  await fs.mkdir(ZIPS, { recursive: true });
  const MAX_PASSES = 10;
  console.log(`\n=== AUTO: ${packs.length} packs · até ${MAX_PASSES} passadas com retry, depois classifica ===`);
  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    const prov = await readProv();
    const remaining = packs.filter((p) => !prov.entries[p.slug]?.done).length;
    console.log(`\n──── passada ${pass}/${MAX_PASSES} · ${remaining} restantes · ${nowIso()} ────`);
    if (remaining === 0) { console.log("  tudo baixado."); break; }
    const browser = await chromium.launch({ headless: true });
    try {
      const ctx = await newCtx(browser);
      const page = await ctx.newPage();
      await downloadPass(page, packs, prov);
    } catch (e) {
      console.log(`  passada abortou no alto nível: ${String(e.message).slice(0, 90)}`);
    } finally {
      await browser.close().catch(() => {});
    }
    const after = await readProv();
    if (packs.filter((p) => !after.entries[p.slug]?.done).length === 0) break;
    await sleep(45000); // respiro entre passadas (educado + deixa transientes limparem)
  }
  // ── classificação automática ──
  console.log(`\n=== CLASSIFICANDO (forge packs catalog) · ${nowIso()} ===`);
  const r = spawnSync("npm", ["run", "forge", "--", "packs", "catalog"], { cwd: ROOT, encoding: "utf8", shell: true });
  if (r.stdout) console.log(r.stdout.slice(-1800));
  if (r.stderr) console.log("stderr:", String(r.stderr).slice(-600));
  // ── resumo final ──
  const prov = await readProv();
  const done = Object.values(prov.entries).filter((e) => e.done).length;
  const failed = packs.filter((p) => !prov.entries[p.slug]?.done).map((p) => p.slug);
  const summary = { finishedAt: nowIso(), baixados: done, totalAlvo: packs.length, faltaram: failed.length, faltantes: failed.slice(0, 50), catalogo: "assets/_packs/catalog.json" };
  await fs.writeFile(path.join(PACKS, "AUTO-SUMMARY.json"), JSON.stringify(summary, null, 2));
  console.log(`\n=== AUTO CONCLUÍDO · ${done}/${packs.length} baixados + catalogados · ${failed.length} faltaram ===`);
  console.log(`  resumo: assets/_packs/AUTO-SUMMARY.json · catálogo: assets/_packs/catalog.json`);
}

const cmd = process.argv[2];
const fn = { login: cmdLogin, collect: cmdCollect, download: cmdDownload, auto: cmdAuto }[cmd];
if (!fn) {
  console.log("uso: node tools/craftpix-fetch.mjs <login|collect|download>");
  process.exit(2);
}
fn().catch((e) => { console.error("erro:", e.message); process.exit(1); });
