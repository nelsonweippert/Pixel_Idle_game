import { redirect } from "next/navigation";

export default function Home() {
  // Fase 0: cai direto na tela de jogo.
  redirect("/play");
}
