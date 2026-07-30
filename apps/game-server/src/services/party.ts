/**
 * PartyManager — grupos entre CONTAS (cada conta = 1 classe). Cap 4, convites com
 * TTL, dissolução automática com <2 membros, transferência de liderança. Persistência
 * seria Postgres em prod (AD-019); aqui in-memory. O ABORTO da sessão ao sair/kickar
 * durante a hunt é responsabilidade do runtime (abortForChar).
 */
export interface Party {
  id: string;
  leaderAccountId: string;
  memberAccountIds: string[];
}
interface Invite {
  partyId: string;
  expiresAtMs: number;
}

export const PARTY_MAX = 4;
export const INVITE_TTL_MS = 120_000;

export class PartyManager {
  private parties = new Map<string, Party>();
  private byAccount = new Map<string, string>();
  private invites = new Map<string, Invite>();
  private seq = 0;

  constructor(private clock: () => number) {}

  getByAccount(accountId: string): Party | undefined {
    const pid = this.byAccount.get(accountId);
    return pid ? this.parties.get(pid) : undefined;
  }

  private ensureParty(leaderAccountId: string): Party {
    const existing = this.getByAccount(leaderAccountId);
    if (existing) return existing;
    const p: Party = { id: `party_${++this.seq}`, leaderAccountId, memberAccountIds: [leaderAccountId] };
    this.parties.set(p.id, p);
    this.byAccount.set(leaderAccountId, p.id);
    return p;
  }

  invite(leaderAccountId: string, toAccountId: string): Party {
    if (leaderAccountId === toAccountId) throw new Error("BAD_COMMAND");
    const p = this.ensureParty(leaderAccountId);
    if (p.leaderAccountId !== leaderAccountId) throw new Error("NOT_LEADER");
    if (p.memberAccountIds.length >= PARTY_MAX) throw new Error("PARTY_FULL");
    if (this.byAccount.get(toAccountId)) throw new Error("ALREADY_IN_PARTY");
    this.invites.set(`${p.id}:${toAccountId}`, { partyId: p.id, expiresAtMs: this.clock() + INVITE_TTL_MS });
    return p;
  }

  accept(toAccountId: string, partyId: string): Party {
    const key = `${partyId}:${toAccountId}`;
    const inv = this.invites.get(key);
    if (!inv) throw new Error("NO_INVITE");
    if (this.clock() > inv.expiresAtMs) {
      this.invites.delete(key);
      throw new Error("INVITE_EXPIRED");
    }
    const p = this.parties.get(partyId);
    if (!p) throw new Error("NO_PARTY");
    if (p.memberAccountIds.length >= PARTY_MAX) throw new Error("PARTY_FULL");
    if (this.byAccount.get(toAccountId)) throw new Error("ALREADY_IN_PARTY");
    p.memberAccountIds.push(toAccountId);
    this.byAccount.set(toAccountId, p.id);
    this.invites.delete(key);
    return p;
  }

  leave(accountId: string): void {
    const p = this.getByAccount(accountId);
    if (!p) return;
    p.memberAccountIds = p.memberAccountIds.filter((a) => a !== accountId);
    this.byAccount.delete(accountId);
    if (p.leaderAccountId === accountId) p.leaderAccountId = p.memberAccountIds[0] ?? "";
    if (p.memberAccountIds.length < 2) this.disband(p);
  }

  kick(leaderAccountId: string, targetAccountId: string): void {
    const p = this.getByAccount(leaderAccountId);
    if (!p || p.leaderAccountId !== leaderAccountId) throw new Error("NOT_LEADER");
    if (targetAccountId === leaderAccountId) throw new Error("BAD_COMMAND");
    if (!p.memberAccountIds.includes(targetAccountId)) throw new Error("NOT_MEMBER");
    this.leave(targetAccountId);
  }

  transferLead(leaderAccountId: string, targetAccountId: string): void {
    const p = this.getByAccount(leaderAccountId);
    if (!p || p.leaderAccountId !== leaderAccountId) throw new Error("NOT_LEADER");
    if (!p.memberAccountIds.includes(targetAccountId)) throw new Error("NOT_MEMBER");
    p.leaderAccountId = targetAccountId;
  }

  private disband(p: Party): void {
    for (const a of p.memberAccountIds) this.byAccount.delete(a);
    this.parties.delete(p.id);
  }
}
