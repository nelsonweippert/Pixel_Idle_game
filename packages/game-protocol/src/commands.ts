import { z } from "zod";
import { Rarity } from "./primitives";

/**
 * Comandos do client (client → server). O client envia só INTENÇÕES — zero lógica
 * de jogo. Discriminados por `type`. Cobre o loop de hunt (solo + party), party,
 * social e marketplace.
 */

// ── hunt ──────────────────────────────────────────────────────────────────────
export const StartHuntCommand = z.object({ type: z.literal("startHunt"), regionId: z.string() });
export const LeaveHuntCommand = z.object({ type: z.literal("leaveHunt") });
export const SetRegionCommand = z.object({ type: z.literal("setRegion"), regionId: z.string() });

// ── party ─────────────────────────────────────────────────────────────────────
export const PartyInviteCommand = z.object({ type: z.literal("party.invite"), toAccountId: z.string() });
export const PartyAcceptCommand = z.object({ type: z.literal("party.accept"), partyId: z.string() });
export const PartyLeaveCommand = z.object({ type: z.literal("party.leave") });
export const PartyKickCommand = z.object({ type: z.literal("party.kick"), targetAccountId: z.string() });
export const PartyTransferCommand = z.object({ type: z.literal("party.transfer"), targetAccountId: z.string() });
export const PartyStartHuntCommand = z.object({ type: z.literal("party.startHunt"), regionId: z.string() });

// ── social ────────────────────────────────────────────────────────────────────
export const SocialRequestCommand = z.object({ type: z.literal("social.request"), toAccountId: z.string() });
export const SocialAcceptCommand = z.object({ type: z.literal("social.accept"), fromAccountId: z.string() });
export const SocialDeclineCommand = z.object({ type: z.literal("social.decline"), fromAccountId: z.string() });

// ── marketplace ─────────────────────────────────────────────────────────────
export const MarketListCommand = z.object({
  type: z.literal("market.list"),
  itemName: z.string(),
  rarity: Rarity,
  price: z.number().int().positive(),
});
export const MarketBuyCommand = z.object({ type: z.literal("market.buy"), listingId: z.string() });
export const MarketBrowseCommand = z.object({ type: z.literal("market.browse") });
export const MarketCancelCommand = z.object({ type: z.literal("market.cancel"), listingId: z.string() });

export const ClientCommand = z.discriminatedUnion("type", [
  StartHuntCommand,
  LeaveHuntCommand,
  SetRegionCommand,
  PartyInviteCommand,
  PartyAcceptCommand,
  PartyLeaveCommand,
  PartyKickCommand,
  PartyTransferCommand,
  PartyStartHuntCommand,
  SocialRequestCommand,
  SocialAcceptCommand,
  SocialDeclineCommand,
  MarketListCommand,
  MarketBuyCommand,
  MarketBrowseCommand,
  MarketCancelCommand,
]);
export type ClientCommand = z.infer<typeof ClientCommand>;
