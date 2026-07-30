/**
 * @pixel-idle/game-core — a simulação de hunt: pura, sem I/O, 100% determinística.
 *
 * Um único código serve online (tick 1Hz) e offline (fast-forward). O caller injeta
 * o ContentBundle via ctx; o core devolve estado + eventos do protocolo. Nenhuma
 * posição de pixel nasce aqui (AD-003) — só alvo e slot lógicos.
 */
export { createSession, SIM_VERSION, SIM_STEP_MS, MAX_MONSTERS } from "./session";
export type {
  SessionState,
  Participant,
  Monster,
  LevelInfo,
  StaminaInfo,
  CreateSessionOpts,
  SimContext,
} from "./session";

export { advance, type AdvanceResult } from "./advance";
export { buildSnapshot } from "./snapshot";
export { detectInterruption, endSession, type InterruptCause } from "./interruptions";
export { xpForLevel } from "./rewards";

export { buildContentBundle, type ContentBundle, type LootTables } from "./content/index";
export { validateContent } from "./content/validate";

export { createRng, nextU32, RngCursor, type RngState } from "./rng";
