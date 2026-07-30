/**
 * SessionRuntime — orquestra o ciclo de vida das hunts:
 *  · tick 1Hz das sessões com conexão (advance +1s → broadcast de eventos);
 *  · connect: se há hunt offline, roda o fast-forward do gap e entrega snapshot +
 *    relatório offline; se online, só re-anexa a conexão;
 *  · disconnect: destaca do tick, a sessão continua válida (offline);
 *  · leave/fim: materializa e encerra.
 * O render nunca é refém disso — só recebe snapshot + stream (AD-003).
 */
import { advance, buildSnapshot, endSession, type ContentBundle } from "@pixel-idle/game-core";
import type { ServerMessage, SimEvent } from "@pixel-idle/game-protocol";
import type { Character, HuntRecord, Store } from "../store/types";
import { createHuntRecord } from "../services/hunt";
import { materializeToChars, runOfflineGap } from "./materialize";

export interface Conn {
  id: string;
  accountId: string;
  send(msg: ServerMessage): void;
}

export class SessionRuntime {
  private online = new Map<string, HuntRecord>(); // huntId → record em tick
  private conns = new Map<string, Set<Conn>>(); // huntId → conexões assistindo
  private connHunt = new Map<string, string>(); // connId → huntId
  private connsByAccount = new Map<string, Set<Conn>>(); // accountId → conexões vivas
  private seedCounter = 0;

  constructor(
    private store: Store,
    private content: ContentBundle,
    private clock: () => number,
  ) {}

  // ── comandos ───────────────────────────────────────────────────────────────
  startHunt(conn: Conn, regionId: string): void {
    const char = this.store.charactersOfAccount(conn.accountId)[0];
    if (!char) return conn.send({ t: "error", code: "BAD_COMMAND", detail: "sem personagem" });
    if (this.store.activeHuntForChar(char.id)) {
      return conn.send({ t: "error", code: "ALREADY_HUNTING" });
    }
    if (char.staminaCurrentMs <= 0) return conn.send({ t: "error", code: "NO_STAMINA" });

    const huntId = this.store.nextId("hunt");
    let rec: HuntRecord;
    try {
      rec = createHuntRecord({
        store: this.store,
        content: this.content,
        huntId,
        charIds: [char.id],
        leaderCharId: char.id,
        regionId,
        seed: ++this.seedCounter,
        now: this.clock(),
      });
    } catch {
      return conn.send({ t: "error", code: "BAD_REGION" });
    }
    try {
      this.store.createHunt(rec);
    } catch {
      return conn.send({ t: "error", code: "ALREADY_HUNTING" });
    }
    this.attach(conn, rec);
    conn.send({ t: "snapshot", snapshot: buildSnapshot(rec.state) });
  }

  leaveHunt(conn: Conn): void {
    const huntId = this.connHunt.get(conn.id) ?? this.store.activeHuntForAccount(conn.accountId)?.id;
    const rec = huntId ? this.store.getHunt(huntId) : undefined;
    if (!rec || !rec.running) return conn.send({ t: "error", code: "NO_ACTIVE_HUNT" });
    const events: SimEvent[] = [];
    endSession(rec.state, "manual", events);
    rec.running = false;
    rec.endCause = "manual";
    materializeToChars(this.store, this.content, rec);
    this.store.saveHunt(rec);
    this.broadcast(rec.id, { t: "ended", cause: "manual", atSimMs: rec.state.simTimeMs });
    this.detachAll(rec.id);
  }

  // ── conexão ──────────────────────────────────────────────────────────────
  onConnect(conn: Conn): void {
    this.register(conn);
    const char = this.store.charactersOfAccount(conn.accountId)[0];
    const rec = char ? this.store.activeHuntForChar(char.id) : undefined;
    if (!rec) return; // sem hunt ativa — o client vai mandar startHunt

    const live = this.online.get(rec.id);
    if (live) {
      // já rodando: só anexa e manda o snapshot atual
      this.addConn(rec.id, conn);
      conn.send({ t: "snapshot", snapshot: buildSnapshot(live.state) });
      return;
    }

    // offline: roda o fast-forward do gap, credita e reporta
    const report = runOfflineGap(this.store, this.content, rec, this.clock());
    this.store.saveHunt(rec);
    conn.send({ t: "snapshot", snapshot: buildSnapshot(rec.state) });
    if (report.realElapsedMs > 0) conn.send({ t: "offlineReport", report });

    if (rec.running) {
      this.attach(conn, rec);
    } else {
      conn.send({ t: "ended", cause: rec.endCause ?? "stamina", atSimMs: rec.state.simTimeMs });
    }
  }

  onDisconnect(conn: Conn): void {
    this.unregister(conn);
    const huntId = this.connHunt.get(conn.id);
    this.connHunt.delete(conn.id);
    if (!huntId) return;
    const set = this.conns.get(huntId);
    set?.delete(conn);
    if (set && set.size === 0) {
      // sem observadores: destaca do tick; a sessão segue válida offline
      const rec = this.online.get(huntId);
      if (rec) {
        rec.lastSeenRealMs = this.clock();
        this.store.saveHunt(rec);
        this.online.delete(huntId);
      }
      this.conns.delete(huntId);
    }
  }

  // ── tick 1Hz ─────────────────────────────────────────────────────────────
  tickAll(): void {
    for (const rec of [...this.online.values()]) {
      const { state, events } = advance(rec.state, { content: this.content }, rec.state.simTimeMs + 1000);
      rec.state = state;
      rec.lastSeenRealMs = this.clock();
      this.store.saveHunt(rec);
      if (events.length) this.broadcast(rec.id, { t: "events", events });
      if (!state.running) {
        materializeToChars(this.store, this.content, rec);
        this.store.saveHunt(rec);
        this.broadcast(rec.id, { t: "ended", cause: state.endCause ?? "stamina", atSimMs: state.simTimeMs });
        this.detachAll(rec.id);
      }
    }
  }

  // ── helpers ──────────────────────────────────────────────────────────────
  private attach(conn: Conn, rec: HuntRecord): void {
    this.online.set(rec.id, rec);
    this.addConn(rec.id, conn);
  }
  private addConn(huntId: string, conn: Conn): void {
    let set = this.conns.get(huntId);
    if (!set) this.conns.set(huntId, (set = new Set()));
    set.add(conn);
    this.connHunt.set(conn.id, huntId);
  }
  private detachAll(huntId: string): void {
    this.online.delete(huntId);
    const set = this.conns.get(huntId);
    if (set) for (const c of set) this.connHunt.delete(c.id);
    this.conns.delete(huntId);
  }
  private broadcast(huntId: string, msg: ServerMessage): void {
    const set = this.conns.get(huntId);
    if (set) for (const c of set) c.send(msg);
  }
  private register(conn: Conn): void {
    let s = this.connsByAccount.get(conn.accountId);
    if (!s) this.connsByAccount.set(conn.accountId, (s = new Set()));
    s.add(conn);
  }
  private unregister(conn: Conn): void {
    const s = this.connsByAccount.get(conn.accountId);
    s?.delete(conn);
    if (s && s.size === 0) this.connsByAccount.delete(conn.accountId);
  }

  // ── party hunt (Fase C): 1 sessão N-participante entre contas ──────────────
  startPartyHunt(leaderConn: Conn, memberAccountIds: string[], regionId: string): void {
    const members: { acc: string; char: Character }[] = [];
    for (const acc of memberAccountIds) {
      const char = this.store.charactersOfAccount(acc)[0];
      if (!char) return leaderConn.send({ t: "error", code: "BAD_COMMAND", detail: `conta ${acc} sem personagem` });
      members.push({ acc, char });
    }
    if (members.some((m) => this.store.activeHuntForChar(m.char.id))) {
      return leaderConn.send({ t: "error", code: "ALREADY_HUNTING" });
    }
    const leaderChar = this.store.charactersOfAccount(leaderConn.accountId)[0];
    if (!leaderChar) return leaderConn.send({ t: "error", code: "BAD_COMMAND" });

    const huntId = this.store.nextId("hunt");
    let rec: HuntRecord;
    try {
      rec = createHuntRecord({
        store: this.store,
        content: this.content,
        huntId,
        charIds: members.map((m) => m.char.id),
        leaderCharId: leaderChar.id,
        regionId,
        seed: ++this.seedCounter,
        now: this.clock(),
      });
    } catch {
      return leaderConn.send({ t: "error", code: "BAD_REGION" });
    }
    try {
      this.store.createHunt(rec);
    } catch {
      return leaderConn.send({ t: "error", code: "ALREADY_HUNTING" });
    }

    this.online.set(rec.id, rec);
    const snap: ServerMessage = { t: "snapshot", snapshot: buildSnapshot(rec.state) };
    for (const m of members) {
      const set = this.connsByAccount.get(m.acc);
      if (set) for (const c of set) {
        this.addConn(rec.id, c);
        c.send(snap);
      }
    }
  }

  /** aborta a hunt em que o char está (sair/kickar do grupo durante a caçada) */
  abortForChar(charId: string): void {
    const rec = this.store.activeHuntForChar(charId);
    if (!rec || !rec.running) return;
    const events: SimEvent[] = [];
    endSession(rec.state, "manual", events);
    rec.running = false;
    rec.endCause = "manual";
    materializeToChars(this.store, this.content, rec);
    this.store.saveHunt(rec);
    this.broadcast(rec.id, { t: "ended", cause: "manual", atSimMs: rec.state.simTimeMs });
    this.detachAll(rec.id);
  }

  /** empurra uma mensagem pra todas as conexões vivas de uma conta */
  sendToAccount(accountId: string, msg: ServerMessage): void {
    const set = this.connsByAccount.get(accountId);
    if (set) for (const c of set) c.send(msg);
  }

  /** nº de sessões em tick (introspecção pra testes) */
  onlineCount(): number {
    return this.online.size;
  }
}
