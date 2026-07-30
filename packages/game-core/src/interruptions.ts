/**
 * Interrupções que encerram a sessão. Prioridade: morte > stamina (Fase A só stamina
 * dispara — "party não wipe" mantém hp>=1). Encerrar é idempotente no advance: uma
 * vez `running=false`, o loop não anda mais.
 */
import type { SimEvent } from "@pixel-idle/game-protocol";
import type { SessionState } from "./session";

export type InterruptCause = "stamina" | "death";

export function detectInterruption(state: SessionState): InterruptCause | null {
  if (state.stamina.currentMs <= 0) return "stamina";
  // Fase A: sem death (party não wipe). Reservado pra quando houver risco real.
  return null;
}

export function endSession(
  state: SessionState,
  cause: InterruptCause | "manual",
  events: SimEvent[],
): void {
  state.running = false;
  state.endCause = cause;
  events.push({ type: "sessionEnd", atSimMs: state.simTimeMs, cause });
}
