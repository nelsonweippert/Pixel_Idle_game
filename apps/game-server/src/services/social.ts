/**
 * SocialManager — amizades entre CONTAS (par não-ordenado, sem duplicata). Pedidos
 * pendentes persistem até resposta (aqui in-memory; Postgres em prod, AD-019). Caps
 * de amigos/pendentes por conta.
 */
export const MAX_FRIENDS = 100;
export const MAX_PENDING = 20;

export class SocialManager {
  private friends = new Map<string, Set<string>>();
  private incoming = new Map<string, Set<string>>(); // to → {from} (pendentes)
  private outgoing = new Map<string, Set<string>>(); // from → {to}

  private slot(m: Map<string, Set<string>>, k: string): Set<string> {
    let s = m.get(k);
    if (!s) m.set(k, (s = new Set()));
    return s;
  }

  sendRequest(from: string, to: string): void {
    if (from === to) throw new Error("BAD_COMMAND");
    if (this.areFriends(from, to)) throw new Error("ALREADY_FRIENDS");
    if (this.slot(this.outgoing, from).has(to)) throw new Error("ALREADY_REQUESTED");
    if (this.slot(this.incoming, to).size >= MAX_PENDING) throw new Error("PENDING_FULL");
    this.slot(this.incoming, to).add(from);
    this.slot(this.outgoing, from).add(to);
  }

  accept(to: string, from: string): void {
    if (!this.incoming.get(to)?.has(from)) throw new Error("NO_REQUEST");
    if (this.listFriends(to).length >= MAX_FRIENDS || this.listFriends(from).length >= MAX_FRIENDS) {
      throw new Error("FRIENDS_FULL");
    }
    this.incoming.get(to)?.delete(from);
    this.outgoing.get(from)?.delete(to);
    this.slot(this.friends, to).add(from);
    this.slot(this.friends, from).add(to);
  }

  decline(to: string, from: string): void {
    this.incoming.get(to)?.delete(from);
    this.outgoing.get(from)?.delete(to);
  }

  remove(a: string, b: string): void {
    this.friends.get(a)?.delete(b);
    this.friends.get(b)?.delete(a);
  }

  listFriends(accountId: string): string[] {
    return [...(this.friends.get(accountId) ?? [])];
  }
  pendingFor(accountId: string): string[] {
    return [...(this.incoming.get(accountId) ?? [])];
  }
  areFriends(a: string, b: string): boolean {
    return this.friends.get(a)?.has(b) ?? false;
  }
}
