/**
 * MemoryStore — impl in-memory da Store. Roda em qualquer lugar (sem Docker), com
 * ids sequenciais determinísticos. Alvo de produção: Drizzle/Postgres atrás da mesma
 * interface. A garantia "1 hunt ativa por conta" (AD-006) é checada aqui.
 */
import type {
  Account,
  Character,
  HuntRecord,
  LedgerEntry,
  OfflineReportRecord,
  Store,
} from "./types";
import type { VocationId } from "@pixel-idle/game-protocol";

export class MemoryStore implements Store {
  private accounts = new Map<string, Account>();
  private characters = new Map<string, Character>();
  private hunts = new Map<string, HuntRecord>();
  private ledger: LedgerEntry[] = [];
  private ledgerRefs = new Set<string>();
  private offlineReports: OfflineReportRecord[] = [];
  private counters = new Map<string, number>();

  nextId(prefix: string): string {
    const n = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, n);
    return `${prefix}_${n}`;
  }

  createAccount(): Account {
    const acc: Account = { id: this.nextId("acc") };
    this.accounts.set(acc.id, acc);
    return acc;
  }
  getAccount(id: string) {
    return this.accounts.get(id);
  }

  createCharacter(accountId: string, vocation: VocationId, name: string): Character {
    const c: Character = {
      id: this.nextId("char"),
      accountId,
      vocation,
      name,
      level: 8,
      xp: 0,
      gold: 12500,
      staminaCurrentMs: 12 * 60 * 60 * 1000,
      staminaMaxMs: 12 * 60 * 60 * 1000,
      skills: {},
    };
    this.characters.set(c.id, c);
    return c;
  }
  getCharacter(id: string) {
    return this.characters.get(id);
  }
  charactersOfAccount(accountId: string) {
    return [...this.characters.values()].filter((c) => c.accountId === accountId);
  }
  saveCharacter(c: Character) {
    this.characters.set(c.id, { ...c });
  }

  createHunt(rec: HuntRecord) {
    if (this.activeHuntForAccount(rec.accountId)) {
      throw new Error("ALREADY_HUNTING"); // AD-006: 1 hunt ativa por conta
    }
    this.hunts.set(rec.id, rec);
  }
  getHunt(id: string) {
    return this.hunts.get(id);
  }
  activeHuntForAccount(accountId: string) {
    return [...this.hunts.values()].find((h) => h.running && h.accountId === accountId);
  }
  activeHuntForChar(charId: string) {
    return [...this.hunts.values()].find((h) => h.running && h.charIds.includes(charId));
  }
  saveHunt(rec: HuntRecord) {
    this.hunts.set(rec.id, rec);
  }
  listActiveHunts() {
    return [...this.hunts.values()].filter((h) => h.running);
  }

  ledgerHasRef(ref: string) {
    return this.ledgerRefs.has(ref);
  }
  appendLedger(e: LedgerEntry) {
    this.ledger.push(e);
    this.ledgerRefs.add(e.ref);
  }

  addOfflineReport(r: OfflineReportRecord) {
    this.offlineReports.push(r);
  }
  offlineReportsForChar(charId: string) {
    return this.offlineReports.filter((r) => r.charId === charId);
  }
}
