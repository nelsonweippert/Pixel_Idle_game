"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminDashboard } from "./AdminDashboard";

/**
 * ⚠️ Fase 0: gate de senha CLIENT-SIDE — esconde o admin no dia a dia, mas NÃO é
 * segurança real (a senha está no bundle). Na Fase 3, com contas + servidor,
 * isto vira auth de verdade (sessão server-side + role de admin).
 */
const PASSWORD = "123admin";
const KEY = "lg_admin";

export function AdminGate() {
  const [authed, setAuthed] = useState(false);
  const [val, setVal] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (sessionStorage.getItem(KEY) === "1") setAuthed(true);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (val === PASSWORD) {
      sessionStorage.setItem(KEY, "1");
      setAuthed(true);
    } else {
      setErr("Senha incorreta.");
      setVal("");
    }
  };

  const logout = () => {
    sessionStorage.removeItem(KEY);
    setAuthed(false);
    setVal("");
  };

  if (authed) return <AdminDashboard onLogout={logout} />;

  return (
    <div className="lg-root">
      <div className="lg-gate">
        <form className="lg-gatebox" onSubmit={submit}>
          <div className="lg-lock">🔒</div>
          <h2>Área ADMIN</h2>
          <p>Acesso à estrutura completa do jogo.</p>
          <input
            className="lg-input"
            type="password"
            value={val}
            onChange={(e) => {
              setVal(e.target.value);
              setErr("");
            }}
            placeholder="senha"
            autoFocus
            aria-label="senha de admin"
          />
          <p className="lg-err">{err}</p>
          <button className="lg-btn" style={{ width: "100%", marginTop: 4 }} type="submit">
            Entrar
          </button>
          <div style={{ marginTop: 16 }}>
            <Link href="/" className="lg-btn-ghost" style={{ display: "inline-block" }}>
              ← Voltar
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
