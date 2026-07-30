import { describe, it, expect, afterEach } from "vitest";
import { WebSocket } from "ws";
import { PROTOCOL_VERSION } from "@pixel-idle/game-protocol";
import { buildServer, type GameServer } from "../src/index";

let server: GameServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

function once(ws: WebSocket, ev: "open" | "message" | "error"): Promise<unknown> {
  return new Promise((res) => ws.once(ev, res as (...a: unknown[]) => void));
}
async function devToken(port: number, vocation = "knight") {
  const res = await fetch(`http://127.0.0.1:${port}/auth/dev-token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ vocation, name: "Ashen" }),
  });
  return (await res.json()) as { token: string; accountId: string; charId: string };
}

describe("Fase B — gateway WS (e2e in-process)", () => {
  it("handshake HTTP+WS → snapshot → tick → stream de eventos", async () => {
    server = buildServer({ autoTick: false });
    const { port } = await server.listen(0);
    const { token } = await devToken(port);

    const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${token}&v=${PROTOCOL_VERSION}`);
    await once(ws, "open");

    ws.send(JSON.stringify({ type: "startHunt", regionId: "greenfields" }));
    const snap = JSON.parse(String(await once(ws, "message"))) as { t: string; snapshot?: { heroes: unknown[] } };
    expect(snap.t).toBe("snapshot");
    expect(snap.snapshot!.heroes.length).toBeGreaterThan(0);

    const got: { t: string }[] = [];
    ws.on("message", (d) => got.push(JSON.parse(String(d))));
    for (let i = 0; i < 5; i++) {
      server.tickAll();
      await new Promise((r) => setImmediate(r));
    }
    expect(got.some((m) => m.t === "events")).toBe(true);
    ws.close();
  });

  it("rejeita PROTOCOL_VERSION incompatível no upgrade", async () => {
    server = buildServer({ autoTick: false });
    const { port } = await server.listen(0);
    const { token } = await devToken(port);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${token}&v=999`);
    const err = await once(ws, "error");
    expect(err).toBeTruthy(); // upgrade recusado (426)
  });

  it("rejeita token inválido", async () => {
    server = buildServer({ autoTick: false });
    const { port } = await server.listen(0);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=nope&v=${PROTOCOL_VERSION}`);
    const err = await once(ws, "error");
    expect(err).toBeTruthy(); // 401
  });
});
