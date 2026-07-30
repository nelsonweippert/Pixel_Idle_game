import { describe, it, expect, beforeEach } from "vitest";
import { buildServer, dispatch, type Conn, type GameServer, type Services } from "../src/index";
import type { ServerMessage, VocationId } from "@pixel-idle/game-protocol";

function fakeConn(accountId: string, id = "c"): Conn & { msgs: ServerMessage[] } {
  const msgs: ServerMessage[] = [];
  return { id, accountId, msgs, send: (m) => msgs.push(m) };
}
const lastParty = (msgs: ServerMessage[]) =>
  [...msgs].reverse().find((m) => m.t === "party") as Extract<ServerMessage, { t: "party" }> | undefined;
const firstMarket = (msgs: ServerMessage[]) =>
  msgs.find((m) => m.t === "market") as Extract<ServerMessage, { t: "market" }> | undefined;

describe("Fase C — comandos party/social/market (dispatch)", () => {
  let t: number;
  let server: GameServer;
  let services: Services;
  beforeEach(() => {
    t = 1_000_000;
    server = buildServer({ clock: () => t, autoTick: false });
    services = {
      runtime: server.runtime,
      party: server.party,
      social: server.social,
      market: server.market,
      store: server.store,
    };
  });
  const player = (v: VocationId = "knight", n = "P") => server.auth.issueDevToken({ vocation: v, name: n });

  it("party: invite → accept propaga a party view aos dois membros", () => {
    const a = player("knight", "A");
    const b = player("cleric", "B");
    const ca = fakeConn(a.accountId, "ca");
    const cb = fakeConn(b.accountId, "cb");
    server.runtime.onConnect(ca);
    server.runtime.onConnect(cb);

    dispatch({ type: "party.invite", toAccountId: b.accountId }, ca, services);
    const pid = lastParty(ca.msgs)!.party!.id;
    dispatch({ type: "party.accept", partyId: pid }, cb, services);

    expect(lastParty(ca.msgs)!.party!.memberAccountIds).toHaveLength(2);
    expect(lastParty(cb.msgs)!.party!.memberAccountIds).toHaveLength(2);
  });

  it("party.startHunt do líder = 1 sessão de 2 participantes; ambos recebem snapshot", () => {
    const a = player("knight", "A");
    const b = player("cleric", "B");
    const ca = fakeConn(a.accountId, "ca");
    const cb = fakeConn(b.accountId, "cb");
    server.runtime.onConnect(ca);
    server.runtime.onConnect(cb);
    dispatch({ type: "party.invite", toAccountId: b.accountId }, ca, services);
    dispatch({ type: "party.accept", partyId: lastParty(ca.msgs)!.party!.id }, cb, services);

    dispatch({ type: "party.startHunt", regionId: "greenfields" }, ca, services);
    expect(server.runtime.onlineCount()).toBe(1);
    expect(cb.msgs.some((m) => m.t === "snapshot" && m.snapshot.heroes.length === 2)).toBe(true);
  });

  it("social: request → accept vira amizade recíproca", () => {
    const a = player("knight", "A");
    const b = player("cleric", "B");
    const ca = fakeConn(a.accountId, "ca");
    const cb = fakeConn(b.accountId, "cb");
    server.runtime.onConnect(ca);
    server.runtime.onConnect(cb);

    dispatch({ type: "social.request", toAccountId: b.accountId }, ca, services);
    expect(cb.msgs.some((m) => m.t === "social" && m.pending.includes(a.accountId))).toBe(true);
    dispatch({ type: "social.accept", fromAccountId: a.accountId }, cb, services);
    expect(server.social.areFriends(a.accountId, b.accountId)).toBe(true);
  });

  it("market: list → outro compra; ouro move com taxa 5% (sink)", () => {
    const a = player("knight", "A");
    const b = player("cleric", "B");
    const ca = fakeConn(a.accountId, "ca");
    const cb = fakeConn(b.accountId, "cb");
    server.runtime.onConnect(ca);
    server.runtime.onConnect(cb);

    dispatch({ type: "market.list", itemName: "Silver Amulet", rarity: "rare", price: 1000 }, ca, services);
    const id = firstMarket(ca.msgs)!.listings[0].id;
    const sg0 = server.store.getCharacter(a.charId)!.gold;
    const bg0 = server.store.getCharacter(b.charId)!.gold;

    dispatch({ type: "market.buy", listingId: id }, cb, services);
    expect(server.store.getCharacter(b.charId)!.gold).toBe(bg0 - 1000);
    expect(server.store.getCharacter(a.charId)!.gold).toBe(sg0 + 950); // 1000 - 5%
  });

  it("market: não compra o próprio anúncio", () => {
    const a = player("knight", "A");
    const ca = fakeConn(a.accountId, "ca");
    server.runtime.onConnect(ca);
    dispatch({ type: "market.list", itemName: "X", rarity: "common", price: 100 }, ca, services);
    const id = firstMarket(ca.msgs)!.listings[0].id;
    dispatch({ type: "market.buy", listingId: id }, ca, services);
    expect(ca.msgs.some((m) => m.t === "error" && m.code === "CANNOT_BUY_OWN")).toBe(true);
  });

  it("comando inválido → error BAD_COMMAND", () => {
    const a = player();
    const ca = fakeConn(a.accountId, "ca");
    dispatch({ type: "cast.fireball" }, ca, services);
    expect(ca.msgs.some((m) => m.t === "error" && m.code === "BAD_COMMAND")).toBe(true);
  });
});
