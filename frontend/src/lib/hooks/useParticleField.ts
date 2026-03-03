"use client";

import { useEffect, useRef } from "react";

/**
 * Shared particle-field canvas hook.
 * Renders 314 bouncing particles (π tribute) with proximity connections.
 * Used by both the login page and the welcome/boarding page.
 */
export function useParticleField(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  opts?: { opacity?: number; color?: string; connectionDist?: number }
) {
  const pointsRef = useRef<{ x: number; y: number; vx: number; vy: number; r: number }[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const POINT_COUNT = 314;
    const fillColor = opts?.color ?? "#1e293b";
    const maxDist = opts?.connectionDist ?? 89;

    function init() {
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = window.innerWidth * dpr;
      canvas!.height = window.innerHeight * dpr;
      canvas!.style.width = window.innerWidth + "px";
      canvas!.style.height = window.innerHeight + "px";
      ctx!.scale(dpr, dpr);

      const pts: typeof pointsRef.current = [];
      for (let i = 0; i < POINT_COUNT; i++) {
        pts.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          r: Math.random() * 1.2,
        });
      }
      pointsRef.current = pts;
    }

    function draw() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx!.clearRect(0, 0, w, h);
      ctx!.fillStyle = fillColor;
      const pts = pointsRef.current;

      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;

        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fill();

        for (let j = i + 1; j < pts.length; j++) {
          const p2 = pts[j];
          const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
          if (dist < maxDist) {
            ctx!.beginPath();
            ctx!.strokeStyle = `rgba(30, 41, 59, ${0.1 * (1 - dist / maxDist)})`;
            ctx!.lineWidth = 0.5;
            ctx!.moveTo(p.x, p.y);
            ctx!.lineTo(p2.x, p2.y);
            ctx!.stroke();
          }
        }
      }
      animRef.current = requestAnimationFrame(draw);
    }

    init();
    draw();
    const handleResize = () => { init(); };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animRef.current);
    };
  }, [canvasRef, opts?.color, opts?.connectionDist]);
}
