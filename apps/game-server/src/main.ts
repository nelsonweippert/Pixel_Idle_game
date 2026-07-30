/**
 * Entry point de produção/dev: sobe o servidor com tick real 1Hz.
 *   npm run dev -w @pixel-idle/game-server
 */
import { buildServer } from "./index";

const PORT = Number(process.env.PORT ?? 4000);

const server = buildServer({ autoTick: true });
server
  .listen(PORT)
  .then(({ port, host }) => {
    // eslint-disable-next-line no-console
    console.log(`[game-server] ouvindo em http://${host}:${port} (WS no mesmo host)`);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[game-server] falha ao subir:", err);
    process.exit(1);
  });
