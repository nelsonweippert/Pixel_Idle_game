/**
 * Domínio persistido + a interface Store. A impl in-memory (memory.ts) roda em
 * qualquer lugar; a impl Postgres/Drizzle é o alvo de produção — mesmo contrato,
 * troca mecânica. O runtime/serviços dependem SÓ desta interface (DATA-*).
 */
import type { VocationId } from "@pixel-idle/game-protocol";
import type { OfflineReport } from "@pixel-idle/game-protocol";
import type { SessionState } from "@pixel-idle/game-core";

export interface Account {
  id: string;
}

export interface Character {
  id: string;
  accountId: string;
  vocation: VocationId;
  name: string;
  level: number;
  xp: number;
  gold: number;
  staminaCurrentMs: number;
  staminaMaxMs: number;
  /** progressão Tibia-linear: skills sobem com uso (skill → pontos) */
  skills: Record<string, number>;
}

export interface HuntRecord {
  id: string;
  accountId: string;
  charIds: string[];
  leaderCharId: string;
  regionId: string;
  running: boolean;
  endCause?: "stamina" | "death" | "manual";
  /** estado serializável da sim (game-core) */
  state: SessionState;
  /** wall-clock do último checkpoint/atividade — base do gap offline */
  lastSeenRealMs: number;
  createdRealMs: number;
  /** baselines já creditados aos personagens (materialização incremental idempotente) */
  creditedXpAbs: number;
  creditedGold: number;
  creditedSimMs: number;
}

export interface LedgerEntry {
  id: string;
  accountId: string;
  ref: string;
  amount: number;
  reason: string;
}

export interface OfflineReportRecord {
  id: string;
  charId: string;
  report: OfflineReport;
}

export interface Store {
  // contas & personagens
  createAccount(): Account;
  getAccount(id: string): Account | undefined;
  createCharacter(accountId: string, vocation: VocationId, name: string): Character;
  getCharacter(id: string): Character | undefined;
  charactersOfAccount(accountId: string): Character[];
  saveCharacter(c: Character): void;

  // hunts (garantia 1 ativa por conta — AD-006)
  createHunt(rec: HuntRecord): void;
  getHunt(id: string): HuntRecord | undefined;
  activeHuntForAccount(accountId: string): HuntRecord | undefined;
  activeHuntForChar(charId: string): HuntRecord | undefined;
  saveHunt(rec: HuntRecord): void;
  listActiveHunts(): HuntRecord[];

  // ledger append-only (DATA-03): débito idempotente por ref
  ledgerHasRef(ref: string): boolean;
  appendLedger(e: LedgerEntry): void;

  // relatórios offline
  addOfflineReport(r: OfflineReportRecord): void;
  offlineReportsForChar(charId: string): OfflineReportRecord[];

  // ids sequenciais (determinísticos — bons pra teste)
  nextId(prefix: string): string;
}
