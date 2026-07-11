"use client";

import { useEffect, useRef } from "react";

/** brasas de atmosfera (canvas) — respeita prefers-reduced-motion */
export function Embers() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let P: { x: number; y: number; r: number; s: number; a: number; d: number }[] = [];
    const size = () => {
      cv.width = cv.offsetWidth;
      cv.height = cv.offsetHeight;
    };
    const seed = () => {
      P = [];
      const n = Math.min(46, Math.floor(cv.width / 26));
      for (let i = 0; i < n; i++)
        P.push({
          x: Math.random() * cv.width,
          y: Math.random() * cv.height,
          r: Math.random() * 1.6 + 0.4,
          s: Math.random() * 0.35 + 0.08,
          a: Math.random() * 0.5 + 0.1,
          d: Math.random() * 0.4 - 0.2,
        });
    };
    const tick = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const p of P) {
        p.y -= p.s;
        p.x += p.d;
        if (p.y < -6) {
          p.y = cv.height + 6;
          p.x = Math.random() * cv.width;
        }
        ctx.beginPath();
        ctx.fillStyle = `rgba(242,193,78,${p.a})`;
        ctx.arc(p.x, p.y, p.r, 0, 6.283);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    size();
    seed();
    tick();
    let to: ReturnType<typeof setTimeout>;
    const onR = () => {
      clearTimeout(to);
      to = setTimeout(() => {
        size();
        seed();
      }, 200);
    };
    window.addEventListener("resize", onR);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onR);
    };
  }, []);
  return <canvas ref={ref} className="lg-embers" aria-hidden="true" />;
}
