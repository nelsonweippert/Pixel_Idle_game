/**
 * @pixel-idle/game-protocol — o contrato entre client e (futuro) servidor.
 *
 * Todo o tráfego é validado por zod dos dois lados. Este é o ÚNICO pacote que o
 * client teatral (cena PixiJS) importa; nenhuma lógica de jogo vive aqui — só o
 * formato das intenções (comandos) e do estado (eventos + snapshot).
 */
export * from "./primitives";
export * from "./events";
export * from "./commands";
export * from "./snapshot";
export * from "./errors";
export * from "./server-messages";
