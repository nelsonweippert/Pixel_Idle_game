/**
 * @pixel-idle/game-server — composição do runtime autoritativo.
 *
 * buildServer monta store + auth + runtime + gateway. `clock` e `autoTick` são
 * injetáveis pra os testes controlarem tempo e tick (sem sleeps, sem flakiness).
 * Store in-memory e DevAuth são o default; Postgres/Drizzle + better-auth entram
 * atrás das mesmas interfaces em produção.
 */
import { buildContentBundle, validateContent, type ContentBundle } from "@pixel-idle/game-core";
import { MemoryStore } from "./store/memory";
import type { Store } from "./store/types";
import { DevAuth, type AuthProvider } from "./auth/index";
import { SessionRuntime } from "./runtime/session-runtime";
import { buildGateway } from "./gateway/ws";
import { PartyManager } from "./services/party";
import { SocialManager } from "./services/social";
import { MarketService } from "./services/market";

export interface BuildOpts {
  clock?: () => number;
  /** inicia o setInterval de tick 1Hz ao dar listen (default true). Testes: false */
  autoTick?: boolean;
  store?: Store;
}

export interface GameServer {
  store: Store;
  auth: AuthProvider;
  runtime: SessionRuntime;
  party: PartyManager;
  social: SocialManager;
  market: MarketService;
  content: ContentBundle;
  /** avança 1s todas as sessões online (o setInterval chama isto em prod) */
  tickAll(): void;
  listen(port?: number): Promise<{ port: number; host: string }>;
  close(): Promise<void>;
}

export function buildServer(opts: BuildOpts = {}): GameServer {
  const store = opts.store ?? new MemoryStore();
  const content = buildContentBundle();
  validateContent(content); // ITEM-04: não sobe com content quebrado
  const clock = opts.clock ?? (() => Date.now());
  const auth = new DevAuth(store);
  const runtime = new SessionRuntime(store, content, clock);
  const party = new PartyManager(clock);
  const social = new SocialManager();
  const market = new MarketService(store);
  const app = buildGateway({ auth, services: { runtime, party, social, market, store } });

  let timer: ReturnType<typeof setInterval> | undefined;

  return {
    store,
    auth,
    runtime,
    party,
    social,
    market,
    content,
    tickAll: () => runtime.tickAll(),
    async listen(port = 0) {
      await app.listen({ port, host: "127.0.0.1" });
      if (opts.autoTick ?? true) timer = setInterval(() => runtime.tickAll(), 1000);
      const addr = app.server.address();
      const resolved = typeof addr === "object" && addr ? addr.port : port;
      return { port: resolved, host: "127.0.0.1" };
    },
    async close() {
      if (timer) clearInterval(timer);
      await app.close();
    },
  };
}

export { MemoryStore } from "./store/memory";
export type { Store, Character, HuntRecord } from "./store/types";
export { SessionRuntime, type Conn } from "./runtime/session-runtime";

// Fase C — party / social / cidade / progressão
export { PartyManager, PARTY_MAX, type Party } from "./services/party";
export { SocialManager, MAX_FRIENDS, MAX_PENDING } from "./services/social";
export { CityManager, CITY_CAP, type CityInstance } from "./runtime/city";
export { skillLevelFor, skillSummary, trainFromHunt } from "./services/progression";
export { MarketService, MARKET_FEE } from "./services/market";
export { dispatch, type Services } from "./gateway/dispatch";
