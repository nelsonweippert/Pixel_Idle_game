"use client";

import Link from "next/link";
import { Embers } from "./Embers";

const GEM = ["#c7c7c7", "#6fbf73", "#5b8fd6", "#a06cd5", "#f2a03d"];

export function Landing() {
  return (
    <div className="lg-root">
      <Embers />
      <div className="lg-landing">
        <div className="lg-wrap">
          <p className="lg-eyebrow">MMORPG idle · navegador · pixel art</p>
          <h1 className="lg-wordmark">
            Loots<span className="lg-amp">&amp;</span>Glory
          </h1>
          <p className="lg-tagline">Cace em grupo. Saqueie o mundo. Conquiste a glória.</p>
          <div className="lg-cta">
            <Link href="/play" className="lg-btn">
              ▶ Jogar
            </Link>
            <Link href="/admin" className="lg-btn-ghost">
              ⚙ Admin
            </Link>
          </div>
          <div className="lg-gems" aria-hidden="true">
            {GEM.map((c, i) => (
              <span
                key={c}
                className="lg-gem"
                style={{ color: c, background: c, width: 11 + i * 3, height: 11 + i * 3 }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
