/**
 * Cliente da Pixellab API v2 — nossa lógica, fundada no que TESTAMOS (não na doc):
 * - char 8d PRO é ASSÍNCRONO (job + poll), custa ~20 gen, ignora image_size
 *   (entrega ~1.5-1.75× maior), imagens em last_response.images (array) com
 *   ordem em last_response.uploaded_directions.
 * - a rede tem timeouts transientes → todo fetch tem retry.
 */

const API = "https://api.pixellab.ai/v2";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function key(): string {
  const k = process.env.PIXELLAB_API_KEY;
  if (!k) throw new Error("PIXELLAB_API_KEY ausente no ambiente");
  return k;
}

async function plFetch(
  method: string,
  path: string,
  body?: unknown,
  tries = 6,
): Promise<{ status: number; json: any }> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(API + path, {
        method,
        headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        json = { _raw: text.slice(0, 400) };
      }
      return { status: res.status, json };
    } catch (e) {
      lastErr = e;
      await sleep(5000);
    }
  }
  throw new Error(`rede falhou após ${tries} tentativas: ${(lastErr as Error)?.message}`);
}

export async function balance(): Promise<any> {
  return (await plFetch("GET", "/balance")).json;
}

export async function createCharacter8dPro(o: {
  description: string;
  size: number;
  view?: string;
}): Promise<{ jobId: string; characterId?: string }> {
  const r = await plFetch("POST", "/create-character-with-8-directions", {
    description: o.description,
    image_size: { width: o.size, height: o.size },
    mode: "pro",
    view: o.view ?? "low top-down",
  });
  if (r.status >= 400 || !r.json.background_job_id)
    throw new Error(`create-8d falhou (${r.status}): ${JSON.stringify(r.json).slice(0, 300)}`);
  return { jobId: r.json.background_job_id, characterId: r.json.character_id };
}

export async function animateV3(o: {
  firstFrameB64: string;
  action: string;
  frameCount: number;
}): Promise<{ jobId: string }> {
  const r = await plFetch("POST", "/animate-with-text-v3", {
    first_frame: { base64: o.firstFrameB64 },
    action: o.action,
    frame_count: o.frameCount,
  });
  if (r.status >= 400 || !r.json.background_job_id)
    throw new Error(`animate-v3 falhou (${r.status}): ${JSON.stringify(r.json).slice(0, 300)}`);
  return { jobId: r.json.background_job_id };
}

export async function pollJob(
  jobId: string,
  o: { intervalMs?: number; maxTries?: number } = {},
): Promise<any> {
  const interval = o.intervalMs ?? 8000;
  const max = o.maxTries ?? 90;
  for (let i = 0; i < max; i++) {
    const r = await plFetch("GET", `/background-jobs/${jobId}`);
    const st = r.json.status;
    if (st === "completed") return r.json;
    if (st === "failed")
      throw new Error(`job ${jobId} falhou: ${JSON.stringify(r.json.last_response ?? r.json).slice(0, 300)}`);
    await sleep(interval);
  }
  throw new Error(`job ${jobId} não completou em ${max} polls`);
}

export interface PlImage {
  dir: string;
  b64: string;
  width: number;
  height: number;
}

/** extrai as imagens de um job completo (char 8d: mapeadas por uploaded_directions;
 *  animação: frames em ordem). */
export function extractImages(job: any): PlImage[] {
  const lr = job.last_response ?? job;
  const imgs = lr.images;
  const dirs = lr.uploaded_directions;
  if (!Array.isArray(imgs)) throw new Error("job sem last_response.images (array)");
  return imgs.map((im: any, i: number) => ({
    dir: Array.isArray(dirs) ? dirs[i] : String(i),
    b64: im.base64,
    width: im.width,
    height: im.height,
  }));
}
