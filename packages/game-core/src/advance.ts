/**
 * advance — o loop-mestre. Puro: clona o estado de entrada, anda em passos FIXOS de
 * SIM_STEP_MS e devolve {state, events}. RESUMÍVEL: avançar 12h de uma vez ≡ avançar
 * 12× 1h, porque o passo é sempre 1000ms (só processa passos inteiros; sobra <1s
 * fica pro próximo advance). É esse contrato que faz online (tick 1Hz) e offline
 * (fast-forward) rodarem o MESMO código e produzirem a MESMA timeline.
 */
import type { SimEvent } from "@pixel-idle/game-protocol";
import { SIM_STEP_MS, type SessionState, type SimContext } from "./session";
import { combatStep } from "./combat";
import { RngCursor } from "./rng";
import { detectInterruption, endSession } from "./interruptions";

export interface AdvanceResult {
  state: SessionState;
  events: SimEvent[];
}

export function advance(input: SessionState, ctx: SimContext, targetSimMs: number): AdvanceResult {
  const state = structuredClone(input); // value-semantics: a entrada do caller não muta
  const events: SimEvent[] = [];

  while (state.running && targetSimMs - state.simTimeMs >= SIM_STEP_MS) {
    stepOnce(state, ctx, events);
    const cause = detectInterruption(state);
    if (cause) {
      endSession(state, cause, events);
      break;
    }
  }

  return { state, events };
}

/** um passo fixo de 1000ms: stamina drena 1:1, combate resolve, relógio avança */
function stepOnce(state: SessionState, ctx: SimContext, events: SimEvent[]): void {
  const atSimMs = state.simTimeMs + SIM_STEP_MS;
  state.stamina.currentMs = Math.max(0, state.stamina.currentMs - SIM_STEP_MS);
  const cursor = new RngCursor(state.rng);
  combatStep(state, ctx.content, cursor, SIM_STEP_MS, atSimMs, events);
  state.rng = cursor.state;
  state.simTimeMs = atSimMs;
}
