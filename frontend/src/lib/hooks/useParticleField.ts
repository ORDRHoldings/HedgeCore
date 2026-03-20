"use client";

import { useEffect, useRef } from "react";

/**
 * Shared particle-field canvas hook.
 * Renders 314 drifting particles with proximity connections.
 * Opts are read via ref — changing opts never re-initialises particles,
 * so there are no jumps on parent re-renders.
 */

interface ParticleFieldOpts {
  opacity?: number;
  color?: string;
  connectionDist?: number;
  lineOpacity?: number;
  colorful?: boolean;
  hues?: number[];
  saturation?: number;
  lightness?: number;
  speed?: number;
  hueSpeedMultiplier?: number;
}

const DEFAULT_HUES = [190, 215, 250, 170, 340, 155];

interface Particle {
  x: number; y: number; vx: number; vy: number; r: number;
  hueIdx: number; huePhase: number; hueSpeed: number;
}

export function useParticleField(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  opts?: ParticleFieldOpts,
) {
  // Always-current opts reference — updating it never triggers re-init
  const optsRef = useRef<ParticleFieldOpts | undefined>(opts);
  optsRef.current = opts;

  const pointsRef = useRef<Particle[]>([]);
  const animRef   = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function readOpts() {
      const o = optsRef.current ?? {};
      return {
        fillColor:   o.color        ?? "#ffffff",
        maxDist:     o.connectionDist ?? 120,
        lineAlpha:   o.lineOpacity  ?? 0.10,
        colorful:    o.colorful     ?? false,
        hues:        o.hues         ?? DEFAULT_HUES,
        sat:         o.saturation   ?? 40,
        lit:         o.lightness    ?? 88,
        speed:       o.speed        ?? 1.0,
        hueSpeedMult: o.hueSpeedMultiplier ?? 1.0,
      };
    }

    function init() {
      const dpr = window.devicePixelRatio || 1;
      canvas!.width  = window.innerWidth  * dpr;
      canvas!.height = window.innerHeight * dpr;
      canvas!.style.width  = window.innerWidth  + "px";
      canvas!.style.height = window.innerHeight + "px";
      ctx!.scale(dpr, dpr);

      const { speed, hueSpeedMult, hues } = readOpts();
      const POINT_COUNT = 280;
      const pts: Particle[] = [];
      for (let i = 0; i < POINT_COUNT; i++) {
        pts.push({
          x:  Math.random() * window.innerWidth,
          y:  Math.random() * window.innerHeight,
          vx: (Math.random() - 0.5) * 0.4 * speed,
          vy: (Math.random() - 0.5) * 0.4 * speed,
          r:  0.6 + Math.random() * 1.6,
          hueIdx:   Math.floor(Math.random() * hues.length),
          huePhase: Math.random() * Math.PI * 2,
          hueSpeed: (0.002 + Math.random() * 0.006) * hueSpeedMult,
        });
      }
      pointsRef.current = pts;
    }

    function getParticleColor(p: Particle, alpha: number): string {
      const { hues, sat, lit } = readOpts();
      const blend = (Math.sin(p.huePhase) + 1) / 2;
      const h = hues[p.hueIdx % hues.length];
      const s = blend * sat;
      const l = 95 - blend * (95 - lit);
      return `hsla(${h}, ${s}%, ${l}%, ${alpha})`;
    }

    function draw() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx!.clearRect(0, 0, w, h);

      const { fillColor, maxDist, lineAlpha, colorful, hues, sat, lit } = readOpts();
      const pts = pointsRef.current;

      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];

        // Drift — no mouse influence, pure autonomous motion
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;

        if (colorful) {
          p.huePhase += p.hueSpeed;
          if (Math.random() < 0.0002) {
            p.hueIdx = (p.hueIdx + 1 + Math.floor(Math.random() * (hues.length - 1))) % hues.length;
          }
          ctx!.fillStyle = getParticleColor(p, 0.85);
        } else {
          ctx!.fillStyle = fillColor;
        }

        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fill();

        // Draw connections only to forward particles (avoid double-drawing)
        for (let j = i + 1; j < pts.length; j++) {
          const p2 = pts[j];
          const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
          if (dist < maxDist) {
            const alpha = lineAlpha * (1 - dist / maxDist);

            if (colorful) {
              const b1 = (Math.sin(p.huePhase)  + 1) / 2;
              const b2 = (Math.sin(p2.huePhase) + 1) / 2;
              const avgB = (b1 + b2) / 2;
              const avgH = (hues[p.hueIdx % hues.length] + hues[p2.hueIdx % hues.length]) / 2;
              const s = avgB * (sat * 0.5);
              const l = 95 - avgB * (95 - lit);
              ctx!.strokeStyle = `hsla(${avgH}, ${s}%, ${l}%, ${alpha})`;
            } else {
              // Parse hex fillColor once for lines
              let r = 255, g = 255, b = 255;
              if (fillColor.startsWith("#") && fillColor.length === 7) {
                r = parseInt(fillColor.slice(1, 3), 16);
                g = parseInt(fillColor.slice(3, 5), 16);
                b = parseInt(fillColor.slice(5, 7), 16);
              }
              ctx!.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
            }

            ctx!.beginPath();
            ctx!.lineWidth = 0.6;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef]); // intentionally excludes opts — opts are read via ref, no re-init on change
}
