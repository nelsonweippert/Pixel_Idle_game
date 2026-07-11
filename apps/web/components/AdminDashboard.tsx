"use client";

import { useState } from "react";
import Link from "next/link";
import { REGIONS, VOCATION_LIST } from "@pixel-idle/shared";

const RES = [
  "#2e222f", "#3e3546", "#625565", "#966c6c", "#ab947a", "#694f62", "#7f708a", "#9babb2",
  "#c7dcd0", "#ffffff", "#6e2727", "#b33831", "#ea4f36", "#f57d4a", "#ae2334", "#e83b3b",
  "#fb6b1d", "#f79617", "#f9c22b", "#7a3045", "#9e4539", "#cd683d", "#e6904e", "#fbb954",
  "#4c3e24", "#676633", "#a2a947", "#d5e04b", "#fbff86", "#165a4c", "#239063", "#1ebc73",
  "#91db69", "#cddf6c", "#313638", "#374e4a", "#547e64", "#92a984", "#b2ba90", "#0b5e65",
  "#0b8a8f", "#0eaf9b", "#30e1b9", "#8ff8e2", "#323353", "#484a77", "#4d65b4", "#4d9be6",
  "#8fd3ff", "#45293f", "#6b3e75", "#905ea9", "#a884f3", "#eaaded", "#753c54", "#a24b6f",
  "#cf657f", "#ed8099", "#831c5d", "#c32454", "#f04f78", "#f68181", "#fca790", "#fdcbb0",
];

const TABS = [
  ["overview", "Visão geral"],
  ["forja", "A Forja"],
  ["classes", "Classes"],
  ["mundo", "Mundo"],
  ["combate", "Combate"],
  ["arte", "Bíblia de Arte"],
  ["arq", "Arquitetura"],
  ["economia", "Economia"],
] as const;

type Tab = (typeof TABS)[number][0];

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="lg-root">
      <div className="lg-top">
        <span className="lg-brand" style={{ fontSize: 18 }}>
          <span>⚔️</span>
          <span className="lg-name">
            Loots<span className="lg-amp"> &amp; </span>Glory
          </span>
        </span>
        <span className="lg-muted" style={{ fontFamily: "var(--lg-mono)", fontSize: 11, letterSpacing: "0.1em" }}>
          · ADMIN
        </span>
        <span className="lg-spacer" />
        <Link href="/play" className="lg-btn-ghost">
          ▶ Jogar
        </Link>
        <button className="lg-btn-ghost" onClick={onLogout}>
          Sair
        </button>
      </div>

      <div className="lg-tabbar-shell">
        <nav className="lg-wrap lg-tabbar" role="tablist">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              className="lg-tab"
              data-on={tab === id ? "1" : "0"}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="lg-wrap">
        {tab === "overview" && <Overview />}
        {tab === "forja" && <Forja />}
        {tab === "classes" && <Classes />}
        {tab === "mundo" && <Mundo />}
        {tab === "combate" && <Combate />}
        {tab === "arte" && <Arte />}
        {tab === "arq" && <Arq />}
        {tab === "economia" && <Economia />}
      </div>
    </div>
  );
}

function Overview() {
  return (
    <section className="lg-panel">
      <p className="lg-eb">A tese</p>
      <h2 className="lg-h2">Fricção zero, profundidade alta</h2>
      <p className="lg-lead">
        Loots &amp; Glory pega a fórmula amada de um MMORPG clássico — caçar, dropar, evoluir,
        negociar — e a destila num jogo que você entende em segundos e joga por meses. A
        profundidade vem do conteúdo, não de tutorial.
      </p>
      <div className="lg-grid lg-g4">
        {[
          ["Pilar 01", "Fricção zero", "Abre no navegador e joga. Sem download, sem launcher."],
          ["Pilar 02", "Idle que respeita", "AFK rende; sentar rende mais. Ninguém fica pra trás."],
          ["Pilar 03", "Anti pay-to-win", "Premium vende conveniência e cosmético. Poder se conquista."],
          ["Pilar 04", "O mundo é a atração", "Profundidade de lugares, criaturas e cidades. Lore leve."],
        ].map(([k, h, p]) => (
          <div className="lg-card" key={h}>
            <p className="lg-kick">{k}</p>
            <h4>{h}</h4>
            <p>{p}</p>
          </div>
        ))}
      </div>
      <div className="lg-callout">
        <p className="lg-k">Estado atual · Fase 0</p>
        <p style={{ margin: "8px 0 0" }} className="lg-muted">
          O cliente visual roda (HUD + cena Pixi) e a Forja está pronta e testada. As abas
          acima detalham cada sistema que estamos construindo.
        </p>
      </div>
    </section>
  );
}

function Forja() {
  return (
    <section className="lg-panel">
      <p className="lg-eb">Sistema · pipeline de arte</p>
      <h2 className="lg-h2">A Forja — o guardião de arte</h2>
      <p className="lg-lead">
        Nenhum asset entra no jogo sem passar: validado, limpo, normalizado e registrado. É a
        garantia — em código — de que tudo na tela obedece ao mesmo padrão.
      </p>
      <div className="lg-pipe">
        <div className="lg-step">
          <div className="lg-l">Criação</div>
          <strong>Pixellab / Aseprite</strong>
          <p>gera o sprite bruto</p>
        </div>
        <div className="lg-step lg-gate2">
          <div className="lg-l">O portão</div>
          <strong>Forja</strong>
          <p>valida · limpa · snap · registra</p>
        </div>
        <div className="lg-step">
          <div className="lg-l">Saída</div>
          <strong>Spritesheet Pixi</strong>
          <p>frames + anchor + animações</p>
        </div>
        <div className="lg-step">
          <div className="lg-l">Consumo</div>
          <strong>O jogo</strong>
          <p>Assets.load() direto</p>
        </div>
      </div>

      <h3 className="lg-h3">Quatro peças</h3>
      <div className="lg-grid lg-g4">
        {[
          ["spec.ts", "A Bíblia", "O ART_SPEC como código — a fonte de verdade das regras."],
          ["validate.ts", "O Validador", "Dimensão, grade de frames, cor, transparência e qualidade."],
          ["normalize.ts", "O Normalizador", "Binariza alpha (mata AA), resize nearest, snap via image-q."],
          ["manifest.json", "O Registro", "O portão. O jogo só carrega o que está registrado."],
        ].map(([k, h, p]) => (
          <div className="lg-card" key={h}>
            <p className="lg-kick">{k}</p>
            <h4>{h}</h4>
            <p>{p}</p>
          </div>
        ))}
      </div>

      <h3 className="lg-h3">O que ela reprova</h3>
      <ul className="lg-rejects">
        {[
          ["Anti-aliasing", "bordas com alpha parcial acima de 2%."],
          ["Upscale disfarçado", "sprite pequeno escalado em blocos N×N."],
          ["Dimensão fora do padrão", "tamanho de canvas não permitido pro tipo."],
          ["Excesso de cores", "acima do teto por sprite (24, ou 16 em ícones)."],
          ["Fundo não transparente", "ou cantos não vazios num sprite ancorado."],
          ["Grade ambígua", "folha que casa com vários tamanhos exige --size."],
        ].map(([b, s]) => (
          <li key={b}>
            <span className="lg-x">✘</span>
            <span>
              <b>{b}</b> — {s}
            </span>
          </li>
        ))}
      </ul>

      <h3 className="lg-h3">Pronto pro PixiJS, saindo da Forja</h3>
      <div className="lg-term">
        <div className="lg-bar">
          <i style={{ background: "#d14b3a" }} />
          <i style={{ background: "#f2c14e" }} />
          <i style={{ background: "#6fbf73" }} />
          <span className="lg-t">forge — cli</span>
        </div>
        <pre>
          <span className="lg-c"># ingerir (valida → limpa → re-valida → registra)</span>
          {"\n"}
          <span className="lg-p">$</span> npm run forge -- ingest hero.png --type character --id knight --anim walk --size 48
          {"\n"}
          <span className="lg-ok">✔ ingerido e registrado</span> · sheet: sprites/knight.walk.json
        </pre>
      </div>
      <div className="lg-metrics">
        {[
          ["11/11", "testes passando"],
          ["6", "tipos de asset"],
          ["≤24", "cores por sprite"],
          ["1×", "escala obrigatória"],
        ].map(([v, l]) => (
          <div className="lg-metric" key={l}>
            <div className="lg-v">{v}</div>
            <div className="lg-ml">{l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Classes() {
  const rowPt = (r: string) => (r === "front" ? "frente" : "trás");
  return (
    <section className="lg-panel">
      <p className="lg-eb">Sistema · combate</p>
      <h2 className="lg-h2">Quatro papéis, uma party</h2>
      <p className="lg-lead">
        A trindade clássica mais um DPS à distância. Você é uma classe; a força tática vem de
        configurar — posição, skills e gear — não de apertar botão.
      </p>
      <div className="lg-grid lg-g4">
        {VOCATION_LIST.map((v) => (
          <div className="lg-card" key={v.id} style={{ borderTop: `3px solid ${v.accent}` }}>
            <div className="lg-crest" style={{ background: v.accent }}>
              {v.name[0]}
            </div>
            <div className="lg-role" style={{ color: v.accent }}>
              {cap(v.role)} · {rowPt(v.row)}
            </div>
            <div className="lg-cname">{v.name}</div>
            <p className="lg-muted" style={{ fontSize: 12, margin: 0 }}>
              {v.tagline}
            </p>
            <div className="lg-skills">
              {v.skills.map((s) => (
                <span className="lg-skill" key={s}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="lg-callout">
        <p className="lg-k">Formação</p>
        <p style={{ margin: "8px 0 0" }} className="lg-muted">
          Tank na frente segurando os monstros; healer, mago e arqueiro atrás. A posição na
          grade é parte da profundidade tática do idle.
        </p>
      </div>
    </section>
  );
}

function Mundo() {
  return (
    <section className="lg-panel">
      <p className="lg-eb">Sistema · progressão</p>
      <h2 className="lg-h2">Uma escada de sete biomas</h2>
      <p className="lg-lead">
        Região → cidade-hub + hunt maps gated por nível. Sobe de nível, destrava a próxima
        região. A profundidade vem do conteúdo, e é infinitamente expansível.
      </p>
      <div className="lg-tablewrap">
        <table className="lg-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Região</th>
              <th>Cidade</th>
              <th>Bioma</th>
              <th>Nível</th>
              <th>Criaturas</th>
            </tr>
          </thead>
          <tbody>
            {REGIONS.map((r) => (
              <tr key={r.id}>
                <td className="lg-idx">{r.index}</td>
                <td>{r.name}</td>
                <td>{r.city}</td>
                <td className="lg-muted">{r.biome}</td>
                <td className="lg-num">
                  {r.levelRange[0]}–{r.levelRange[1] > 900 ? "∞" : r.levelRange[1]}
                </td>
                <td className="lg-muted">{r.creatures.map((c) => c.name).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="lg-muted" style={{ marginTop: 16 }}>
        Cada região tem um <strong>boss</strong> e o <strong>boosted creature diário</strong>{" "}
        (+15% XP). Matar criaturas alimenta o <strong>bestiário</strong>.
      </p>
    </section>
  );
}

function Combate() {
  return (
    <section className="lg-panel">
      <p className="lg-eb">Sistema · cliente visual</p>
      <h2 className="lg-h2">Render desacoplado da simulação</h2>
      <p className="lg-lead">
        A decisão que faz o visual evoluir: o que desenha (PixiJS) é separado do que simula.
        Hoje a simulação roda no cliente; na Fase 3 vira servidor autoritativo — e a cena não
        muda uma linha.
      </p>
      <div className="lg-grid lg-g3">
        {[
          ["HuntScene · Pixi", "A cena", "Piso em tiles, heróis em formação, monstros, HP. Render puro por eventos."],
          ["MockEngine → servidor", "A simulação", "A fonte de verdade. Trocável por WebSocket do servidor sem tocar no render."],
          ["React", "A HUD", "Party, skills, caçada, loot feed, chat. 90% do jogo é DOM comum."],
        ].map(([k, h, p]) => (
          <div className="lg-card" key={h}>
            <p className="lg-kick">{k}</p>
            <h4>{h}</h4>
            <p>{p}</p>
          </div>
        ))}
      </div>
      <h3 className="lg-h3">A "vida" vem do código, não do frame</h3>
      <p className="lg-muted">
        Animação nível Tibia (idle + walk + attack curtos). A sensação de combate vem da camada
        de engine, barata e reutilizável:
      </p>
      <div className="lg-pills">
        {["lunge no ataque", "projéteis", "hit-flash", "damage numbers", "crits", "✦ de morte"].map(
          (p) => (
            <span className="lg-pill" key={p}>
              {p}
            </span>
          ),
        )}
      </div>
    </section>
  );
}

function Arte() {
  return (
    <section className="lg-panel">
      <p className="lg-eb">Sistema · direção de arte</p>
      <h2 className="lg-h2">Regras que a Forja faz valer</h2>
      <p className="lg-lead">
        32px base, top-down quatro direções, animação nível Tibia e uma paleta-mestra. Legível,
        sólido, sem exagero de detalhe.
      </p>
      <div className="lg-grid lg-g2">
        <div>
          <h3 className="lg-h3" style={{ marginTop: 0 }}>
            Dimensões
          </h3>
          <div className="lg-tablewrap">
            <table className="lg-table" style={{ minWidth: 0 }}>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Canvas</th>
                  <th>Cores</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["tile", "32×32", "≤24"],
                  ["character", "48×48", "≤24"],
                  ["creature", "32 → 128", "≤24"],
                  ["icon", "32×32", "≤16"],
                  ["effect", "32 · 48 · 64", "≤24"],
                ].map(([t, c, k]) => (
                  <tr key={t}>
                    <td>{t}</td>
                    <td className="lg-num">{c}</td>
                    <td className="lg-num">{k}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h3 className="lg-h3" style={{ marginTop: 0 }}>
            Animação — nível Tibia
          </h3>
          <div className="lg-tablewrap">
            <table className="lg-table" style={{ minWidth: 0 }}>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>idle</th>
                  <th>walk</th>
                  <th>attack</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>character</td>
                  <td className="lg-num">1–2f</td>
                  <td className="lg-num">3–4f</td>
                  <td className="lg-num">2–3f</td>
                </tr>
                <tr>
                  <td>creature</td>
                  <td className="lg-num">1–3f</td>
                  <td className="lg-num">2–4f</td>
                  <td className="lg-num">1–3f</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="lg-muted" style={{ fontSize: "0.88rem", marginTop: 10 }}>
            Quatro direções: <code className="lg-inl">south → north → east → west</code>.
          </p>
        </div>
      </div>
      <h3 className="lg-h3">Paleta-mestra — Resurrect 64</h3>
      <div className="lg-swatches">
        {RES.map((h) => (
          <div key={h} style={{ background: h }} title={h} />
        ))}
      </div>
    </section>
  );
}

function Arq() {
  const phases: [string, string, string, "done" | "next" | "todo", string][] = [
    ["0", "Núcleo visual", "Shell + cena Pixi + loop de combate. A Forja pronta.", "done", "Concluído"],
    ["1", "Progressão", "Loot real, inventário, gear, equipar e vender.", "next", "Próximo"],
    ["2", "Idle real", "Simulação offline + stamina.", "todo", "Planejado"],
    ["3", "Social", "Servidor autoritativo + party de 4 jogadores.", "todo", "Planejado"],
    ["4", "Economia", "Marketplace P2P.", "todo", "Planejado"],
    ["5", "Retenção", "Tasks, boosted creature, daily, bestiário.", "todo", "Planejado"],
  ];
  return (
    <section className="lg-panel">
      <p className="lg-eb">Sistema · tecnologia</p>
      <h2 className="lg-h2">Stack &amp; roadmap</h2>
      <p className="lg-lead">
        Nada de game engine monolítica. React faz o shell; PixiJS renderiza só a cena; um
        servidor autoritativo simula a caçada para que o idle offline seja real.
      </p>
      <div className="lg-grid lg-g2">
        <div>
          <h3 className="lg-h3" style={{ marginTop: 0 }}>
            Camadas
          </h3>
          <div className="lg-tablewrap">
            <table className="lg-table" style={{ minWidth: 0 }}>
              <tbody>
                {[
                  ["UI / shell", "Next.js 16 + React 19"],
                  ["Cena de combate", "PixiJS 8 (WebGL)"],
                  ["Forja / assets", "Node + sharp + image-q"],
                  ["Servidor de jogo", "Node + Colyseus · Fase 3"],
                  ["Persistência", "Postgres + Prisma"],
                  ["Pagamento", "Pix"],
                ].map(([a, b]) => (
                  <tr key={a}>
                    <td>{a}</td>
                    <td className="lg-muted">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h3 className="lg-h3" style={{ marginTop: 0 }}>
            Monorepo
          </h3>
          <div className="lg-term">
            <pre>
              {`apps/
  web/        Next + PixiJS (roda hoje)
  server/     Colyseus (Fase 3)
packages/
  shared/     classes, mundo, protocolo
  forge/      o guardião de arte
assets/
  manifest.json  `}
              <span className="lg-p">← o portão</span>
            </pre>
          </div>
        </div>
      </div>
      <h3 className="lg-h3">Roadmap</h3>
      <div className="lg-phases">
        {phases.map(([n, h, p, cls, label]) => (
          <div className="lg-phase" key={n}>
            <span className="lg-n">{n}</span>
            <div>
              <h4>{h}</h4>
              <p>{p}</p>
            </div>
            <span className={`lg-badge ${cls}`}>{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Economia() {
  const rar: [string, string][] = [
    ["Common", "#c7c7c7"],
    ["Uncommon", "#6fbf73"],
    ["Rare", "#5b8fd6"],
    ["Epic", "#a06cd5"],
  ];
  return (
    <section className="lg-panel">
      <p className="lg-eb">Sistema · economia &amp; monetização</p>
      <h2 className="lg-h2">Loot, mercado e a linha anti-P2W</h2>
      <p className="lg-lead">
        O loot move o jogo; o marketplace move a economia. O premium vende conveniência e
        cosmético — nunca poder. É o modelo Stonegy refinado pra ser mais justo.
      </p>
      <h3 className="lg-h3" style={{ marginTop: 0 }}>
        Raridades de loot
      </h3>
      <div className="lg-grid lg-g4" style={{ gap: 10 }}>
        {rar.map(([n, c]) => (
          <div className="lg-card" key={n} style={{ borderTop: `3px solid ${c}` }}>
            <span className="lg-chip">
              <i style={{ background: c }} />
              {n}
            </span>
          </div>
        ))}
      </div>
      <div
        className="lg-card"
        style={{ borderTop: "3px solid #f2a03d", marginTop: 10, textAlign: "center" }}
      >
        <span className="lg-chip" style={{ fontSize: 13 }}>
          <i style={{ background: "#f2a03d" }} />
          Legendary — o chase raro
        </span>
      </div>
      <div className="lg-grid lg-g3" style={{ marginTop: 28 }}>
        {[
          ["sink + social", "Marketplace P2P", "Trade assíncrono com taxas — dreno de gold e coluna social."],
          ["justo", "Anti pay-to-win", "Premium = fast-travel, mercado offline, cosmético. Poder = jogar."],
          ["atrito zero", "Pix", "Monetização nativa pro público BR — instantâneo, sem fricção."],
        ].map(([k, h, p]) => (
          <div className="lg-card" key={h}>
            <p className="lg-kick">{k}</p>
            <h4>{h}</h4>
            <p>{p}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
