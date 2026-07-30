import { z } from "zod";
import { ItemDrop, Rarity } from "./primitives";
import { SimEvent } from "./events";
import { Snapshot } from "./snapshot";
import { ErrorCode } from "./errors";

/**
 * Envelope server → client no transporte WS. Tudo que o servidor manda é um
 * ServerMessage discriminado por `t`. O client teatral só precisa deste pacote.
 */

/** relatório do que aconteceu enquanto o jogador estava offline (fast-forward) */
export const OfflineReport = z.object({
  huntId: z.string(),
  fromSimMs: z.number().nonnegative(),
  toSimMs: z.number().nonnegative(),
  realElapsedMs: z.number().nonnegative(),
  kills: z.number().int().nonnegative(),
  drops: z.array(ItemDrop),
  xpGained: z.number().nonnegative(),
  goldGained: z.number().nonnegative(),
  ended: z.boolean(),
  cause: z.enum(["stamina", "death", "manual"]).optional(),
});
export type OfflineReport = z.infer<typeof OfflineReport>;

/** visão de um grupo (party) entregue ao client */
export const PartyView = z.object({
  id: z.string(),
  leaderAccountId: z.string(),
  memberAccountIds: z.array(z.string()),
});
export type PartyView = z.infer<typeof PartyView>;

/** um anúncio no marketplace */
export const MarketListing = z.object({
  id: z.string(),
  sellerAccountId: z.string(),
  itemName: z.string(),
  rarity: Rarity,
  price: z.number().int().positive(),
});
export type MarketListing = z.infer<typeof MarketListing>;

export const ServerMessage = z.discriminatedUnion("t", [
  z.object({ t: z.literal("snapshot"), snapshot: Snapshot }),
  z.object({ t: z.literal("events"), events: z.array(SimEvent) }),
  z.object({ t: z.literal("offlineReport"), report: OfflineReport }),
  z.object({ t: z.literal("ended"), cause: z.enum(["stamina", "death", "manual"]), atSimMs: z.number() }),
  z.object({ t: z.literal("party"), party: PartyView.nullable() }),
  z.object({ t: z.literal("social"), friends: z.array(z.string()), pending: z.array(z.string()) }),
  z.object({ t: z.literal("market"), listings: z.array(MarketListing) }),
  z.object({ t: z.literal("ok"), detail: z.string().optional() }),
  z.object({ t: z.literal("error"), code: ErrorCode, detail: z.string().optional() }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;
