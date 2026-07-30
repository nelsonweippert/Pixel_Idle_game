/**
 * Auth abstraído. Impl DEV: emite um token opaco → conta + personagem (sem email).
 * Alvo de produção: better-auth (magic link + OAuth), atrás desta mesma interface —
 * a resolução de sessão no upgrade do WS não muda.
 */
import type { VocationId } from "@pixel-idle/game-protocol";
import type { Store } from "../store/types";

export interface AuthProvider {
  /** DEV: cria conta + personagem e devolve um token de sessão */
  issueDevToken(o: { vocation: VocationId; name: string }): {
    token: string;
    accountId: string;
    charId: string;
  };
  resolve(token: string): { accountId: string } | null;
}

export class DevAuth implements AuthProvider {
  private tokens = new Map<string, string>(); // token → accountId
  constructor(private store: Store) {}

  issueDevToken(o: { vocation: VocationId; name: string }) {
    const acc = this.store.createAccount();
    const char = this.store.createCharacter(acc.id, o.vocation, o.name);
    const token = this.store.nextId("tok");
    this.tokens.set(token, acc.id);
    return { token, accountId: acc.id, charId: char.id };
  }

  resolve(token: string) {
    const accountId = this.tokens.get(token);
    return accountId ? { accountId } : null;
  }
}
