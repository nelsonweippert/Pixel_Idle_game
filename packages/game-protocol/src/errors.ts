import { z } from "zod";

/**
 * Códigos de erro estáveis do servidor. Enum crescente — nunca renomear/remover um
 * código existente (o client trata por código). Fase A usa poucos; a lista cresce
 * com party/social/progressão.
 */
export const ErrorCode = z.enum([
  "VERSION_MISMATCH",
  "BAD_COMMAND",
  "BAD_REGION",
  "NO_ACTIVE_HUNT",
  "ALREADY_HUNTING",
  "NO_STAMINA",
  // party
  "NOT_LEADER",
  "PARTY_FULL",
  "ALREADY_IN_PARTY",
  "NO_INVITE",
  "INVITE_EXPIRED",
  "NO_PARTY",
  "NOT_MEMBER",
  // social
  "ALREADY_FRIENDS",
  "ALREADY_REQUESTED",
  "NO_REQUEST",
  "PENDING_FULL",
  "FRIENDS_FULL",
  // market
  "NO_LISTING",
  "INSUFFICIENT_GOLD",
  "NOT_SELLER",
  "CANNOT_BUY_OWN",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ServerError = z.object({
  type: z.literal("error"),
  code: ErrorCode,
  detail: z.string().optional(),
});
export type ServerError = z.infer<typeof ServerError>;
