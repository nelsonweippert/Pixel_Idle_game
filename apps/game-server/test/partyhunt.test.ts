import { describe, it, expect, beforeEach } from "vitest";
import { buildServer, type Conn, type GameServer } from "../src/index";
import { PartyManager } from "../src/services/party";
import type { ServerMessage, VocationId } from "@pixel-idle/game-protocol";

function fakeConn(accountId: string, id: string): Conn & { msgs: ServerMessage[] } {
  const msgs: ServerMessage[] = [];
  return { id, accountId, msgs, send: (m) => msgs.push(m) };
}

describe("Fase C — party hunt (runtime N-participante)", () => {
  let t: number;
  let server: GameServer;
  beforeEach(() => {
    t = 1_000_000;
    server = buildServer({ clock: () => t, autoTick: false });
  });

  it("4 contas viram 1 sessão de 4 participantes; todos recebem eventos e progridem", () => {
    const vocs: VocationId[] = ["knight", "cleric", "sorcerer", "ranger"];
    const players = vocs.map((v, i) => server.auth.issueDevToken({ vocation: v, name: `P${i}` }));
    const conns = players.map((p, i) => fakeConn(p.accountId, `c${i}`));
    conns.forEach((c) => server.runtime.onConnect(c)); // registra as conexões vivas

    // forma a party (líder = P0)
    const pm = new PartyManager(() => t);
    for (let i = 1; i < 4; i++) {
      pm.invite(players[0].accountId, players[i].accountId);
      pm.accept(players[i].accountId, pm.getByAccount(players[0].accountId)!.id);
    }
    const party = pm.getByAccount(players[0].accountId)!;
    expect(party.memberAccountIds).toHaveLength(4);

    // líder inicia a hunt do grupo → 1 sessão N-participante
    server.runtime.startPartyHunt(conns[0], party.memberAccountIds, "greenfields");
    expect(server.runtime.onlineCount()).toBe(1);
    for (const c of conns) {
      const snap = c.msgs.find((m) => m.t === "snapshot");
      expect(snap?.t === "snapshot" && snap.snapshot.heroes.length).toBe(4);
    }

    for (let i = 0; i < 10; i++) {
      t += 1000;
      server.tickAll();
    }
    for (const c of conns) expect(c.msgs.some((m) => m.t === "events")).toBe(true);

    // encerra e credita: cada char do grupo drenou stamina e treinou skill
    server.runtime.abortForChar(players[0].charId);
    for (const p of players) {
      const ch = server.store.getCharacter(p.charId)!;
      expect(ch.staminaCurrentMs).toBeLessThan(ch.staminaMaxMs);
      expect(Object.keys(ch.skills).length).toBeGreaterThan(0);
    }
  });

  it("sair/kickar durante a hunt aborta a sessão para todos", () => {
    const vocs: VocationId[] = ["knight", "cleric"];
    const players = vocs.map((v, i) => server.auth.issueDevToken({ vocation: v, name: `P${i}` }));
    const conns = players.map((p, i) => fakeConn(p.accountId, `c${i}`));
    conns.forEach((c) => server.runtime.onConnect(c));

    server.runtime.startPartyHunt(conns[0], players.map((p) => p.accountId), "greenfields");
    expect(server.runtime.onlineCount()).toBe(1);

    server.runtime.abortForChar(players[1].charId); // membro sai
    expect(server.runtime.onlineCount()).toBe(0);
    for (const c of conns) {
      expect(c.msgs.some((m) => m.t === "ended" && m.cause === "manual")).toBe(true);
    }
  });
});
