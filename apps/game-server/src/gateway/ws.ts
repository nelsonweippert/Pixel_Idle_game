/**
 * Gateway: Fastify (HTTP) + ws (upgrade autenticado). Handshake: resolve token →
 * accountId, checa PROTOCOL_VERSION, então snapshot + stream. Toda mensagem do client
 * passa pelo dispatcher (zod). O client teatral fala só isto.
 */
import Fastify, { type FastifyInstance } from "fastify";
import { WebSocketServer, WebSocket } from "ws";
import { PROTOCOL_VERSION, type VocationId } from "@pixel-idle/game-protocol";
import type { AuthProvider } from "../auth/index";
import type { Conn } from "../runtime/session-runtime";
import { dispatch, type Services } from "./dispatch";

export function buildGateway(deps: {
  auth: AuthProvider;
  services: Services;
}): FastifyInstance {
  const runtime = deps.services.runtime;
  const app = Fastify();

  // CORS aberto (dev): o client Next em outra porta faz POST /auth/dev-token.
  // O WebSocket não usa CORS. Em prod, restringir a origem.
  app.addHook("onRequest", (req, reply, done) => {
    reply.header("access-control-allow-origin", "*");
    reply.header("access-control-allow-methods", "GET,POST,OPTIONS");
    reply.header("access-control-allow-headers", "content-type");
    if (req.method === "OPTIONS") {
      reply.code(204).send();
      return;
    }
    done();
  });

  app.get("/health", async () => ({ ok: true, protocol: PROTOCOL_VERSION }));

  // DEV: emite token de sessão (cria conta + personagem)
  app.post("/auth/dev-token", async (req) => {
    const body = (req.body ?? {}) as { vocation?: VocationId; name?: string };
    return deps.auth.issueDevToken({
      vocation: body.vocation ?? "knight",
      name: body.name ?? "Hero",
    });
  });

  const wss = new WebSocketServer({ noServer: true });
  let connSeq = 0;

  app.server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "", "http://localhost");
    const token = url.searchParams.get("token") ?? "";
    const version = Number(url.searchParams.get("v") ?? "0");
    const session = deps.auth.resolve(token);
    if (!session) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    if (version !== PROTOCOL_VERSION) {
      socket.write("HTTP/1.1 426 Upgrade Required\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request, session.accountId);
    });
  });

  wss.on("connection", (ws: WebSocket, _req: unknown, accountId: string) => {
    const conn: Conn = {
      id: `conn_${++connSeq}`,
      accountId,
      send: (m) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
      },
    };
    runtime.onConnect(conn);
    ws.on("message", (data) => {
      try {
        dispatch(JSON.parse(String(data)), conn, deps.services);
      } catch {
        conn.send({ t: "error", code: "BAD_COMMAND" });
      }
    });
    ws.on("close", () => runtime.onDisconnect(conn));
  });

  return app;
}
