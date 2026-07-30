/**
 * Dispatcher — valida o comando (zod) e roteia pro serviço certo. 1:1 com o
 * protocolo; nenhuma regra de jogo aqui. Erros dos serviços (Error(code)) viram
 * {t:"error", code}. Mudanças de party/social são propagadas às contas envolvidas.
 */
import { ClientCommand, type ErrorCode, type PartyView } from "@pixel-idle/game-protocol";
import type { Conn, SessionRuntime } from "../runtime/session-runtime";
import type { PartyManager, Party } from "../services/party";
import type { SocialManager } from "../services/social";
import type { MarketService } from "../services/market";
import type { Store } from "../store/types";

export interface Services {
  runtime: SessionRuntime;
  party: PartyManager;
  social: SocialManager;
  market: MarketService;
  store: Store;
}

const KNOWN_CODES = new Set<string>([
  "NOT_LEADER", "PARTY_FULL", "ALREADY_IN_PARTY", "NO_INVITE", "INVITE_EXPIRED", "NO_PARTY",
  "NOT_MEMBER", "ALREADY_FRIENDS", "ALREADY_REQUESTED", "NO_REQUEST", "PENDING_FULL",
  "FRIENDS_FULL", "NO_LISTING", "INSUFFICIENT_GOLD", "NOT_SELLER", "CANNOT_BUY_OWN",
  "BAD_COMMAND", "ALREADY_HUNTING", "BAD_REGION", "NO_STAMINA", "NO_ACTIVE_HUNT",
]);
const asCode = (e: unknown): ErrorCode =>
  (e instanceof Error && KNOWN_CODES.has(e.message) ? e.message : "BAD_COMMAND") as ErrorCode;

const partyView = (p: Party | undefined): PartyView | null =>
  p ? { id: p.id, leaderAccountId: p.leaderAccountId, memberAccountIds: p.memberAccountIds } : null;

export function dispatch(raw: unknown, conn: Conn, s: Services): void {
  const parsed = ClientCommand.safeParse(raw);
  if (!parsed.success) return conn.send({ t: "error", code: "BAD_COMMAND" });
  const cmd = parsed.data;
  const guard = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      conn.send({ t: "error", code: asCode(e) });
    }
  };
  const charOf = (accountId: string) => s.store.charactersOfAccount(accountId)[0];
  const pushParty = (p: Party | undefined) => {
    if (!p) return;
    for (const acc of p.memberAccountIds) s.runtime.sendToAccount(acc, { t: "party", party: partyView(p) });
  };
  const pushSocial = (accountId: string) =>
    s.runtime.sendToAccount(accountId, {
      t: "social",
      friends: s.social.listFriends(accountId),
      pending: s.social.pendingFor(accountId),
    });

  switch (cmd.type) {
    // ── hunt ────────────────────────────────────────────────────────────────
    case "startHunt":
      s.runtime.startHunt(conn, cmd.regionId);
      break;
    case "leaveHunt":
      s.runtime.leaveHunt(conn);
      break;
    case "setRegion":
      s.runtime.leaveHunt(conn);
      s.runtime.startHunt(conn, cmd.regionId);
      break;

    // ── party ─────────────────────────────────────────────────────────────
    case "party.invite":
      guard(() => {
        const p = s.party.invite(conn.accountId, cmd.toAccountId);
        conn.send({ t: "party", party: partyView(p) });
        s.runtime.sendToAccount(cmd.toAccountId, { t: "ok", detail: `convite:${p.id}` });
      });
      break;
    case "party.accept":
      guard(() => pushParty(s.party.accept(conn.accountId, cmd.partyId)));
      break;
    case "party.leave":
      guard(() => {
        const p = s.party.getByAccount(conn.accountId);
        const c = charOf(conn.accountId);
        if (c) s.runtime.abortForChar(c.id); // sair do grupo aborta a hunt
        s.party.leave(conn.accountId);
        conn.send({ t: "party", party: null });
        pushParty(p ? s.party.getByAccount(p.leaderAccountId) : undefined);
      });
      break;
    case "party.kick":
      guard(() => {
        const target = charOf(cmd.targetAccountId);
        if (target) s.runtime.abortForChar(target.id);
        s.party.kick(conn.accountId, cmd.targetAccountId);
        s.runtime.sendToAccount(cmd.targetAccountId, { t: "party", party: null });
        pushParty(s.party.getByAccount(conn.accountId));
      });
      break;
    case "party.transfer":
      guard(() => {
        s.party.transferLead(conn.accountId, cmd.targetAccountId);
        pushParty(s.party.getByAccount(conn.accountId));
      });
      break;
    case "party.startHunt":
      guard(() => {
        const p = s.party.getByAccount(conn.accountId);
        if (p && p.leaderAccountId !== conn.accountId) throw new Error("NOT_LEADER");
        if (p) s.runtime.startPartyHunt(conn, p.memberAccountIds, cmd.regionId);
        else s.runtime.startHunt(conn, cmd.regionId);
      });
      break;

    // ── social ────────────────────────────────────────────────────────────
    case "social.request":
      guard(() => {
        s.social.sendRequest(conn.accountId, cmd.toAccountId);
        pushSocial(cmd.toAccountId);
        conn.send({ t: "ok", detail: "pedido enviado" });
      });
      break;
    case "social.accept":
      guard(() => {
        s.social.accept(conn.accountId, cmd.fromAccountId);
        pushSocial(conn.accountId);
        pushSocial(cmd.fromAccountId);
      });
      break;
    case "social.decline":
      guard(() => {
        s.social.decline(conn.accountId, cmd.fromAccountId);
        pushSocial(conn.accountId);
      });
      break;

    // ── marketplace ─────────────────────────────────────────────────────────
    case "market.list":
      guard(() => {
        s.market.list(conn.accountId, cmd.itemName, cmd.rarity, cmd.price);
        conn.send({ t: "market", listings: s.market.browse() });
      });
      break;
    case "market.buy":
      guard(() => {
        s.market.buy(conn.accountId, cmd.listingId);
        conn.send({ t: "market", listings: s.market.browse() });
      });
      break;
    case "market.cancel":
      guard(() => {
        s.market.cancel(conn.accountId, cmd.listingId);
        conn.send({ t: "market", listings: s.market.browse() });
      });
      break;
    case "market.browse":
      conn.send({ t: "market", listings: s.market.browse() });
      break;
  }
}
