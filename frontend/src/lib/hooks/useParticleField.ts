"use client";

import { useEffect, useRef } from "react";

/**
 * Shared particle-field canvas hook.
 * Renders 314 bouncing particles (pi tribute) with proximity connections.
 * Supports colorful mode where nodes shift between white and subtle accent colors.
 */

interface ParticleFieldOpts {
  opacity?: number;
  color?: string;
  connectionDist?: number;
  lineOpacity?: number;
  /** Enable colorful mode — nodes shift between white and subtle accent hues */
  colorful?: boolean;
  /** Palette for colorful mode (HSL hue values). Defaults to treasury pastels. */
  hues?: number[];
  /** How saturated the color shifts are (0–100). Default 40. */
  saturation?: number;
  /** Base lightness for nodes (50–100). Default 88. */
  lightness?: number;
  /** Particle movement speed multiplier. Default 1.0 (base velocity 0.5). */
  speed?: number;
  /** How fast hue phases advance. Default 1.0. Higher = faster color cycling. */
  hueSpeedMultiplier?: number;
}

// Soft treasury-inspired hues: cyan, blue, lavender, teal, soft rose, mint
const DEFAULT_HUES = [190, 215, 250, 170, 340, 155];

export function useParticleField(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  opts?: ParticleFieldOpts,
) {
  const pointsRef = useRef<{
    x: number; y: number; vx: number; vy: number; r: number;
    hueIdx: number; huePhase: number; hueSpeed: number;
  }[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const POINT_COUNT      = 314;
    const fillColor        = opts?.color ?? "#1C62F2";
    const maxDist          = opts?.connectionDist ?? 140;
    const lineAlpha        = opts?.lineOpacity ?? 0.38;
    const colorful         = opts?.colorful ?? false;
    const hues             = opts?.hues ?? DEFAULT_HUES;
    const sat              = opts?.saturation ?? 40;
    const lit              = opts?.lightness ?? 88;
    const speed            = opts?.speed ?? 1.0;
    const hueSpeedMult     = opts?.hueSpeedMultiplier ?? 1.0;

    function init() {
      const dpr = window.devicePixelRatio || 1;
      canvas!.width  = window.innerWidth  * dpr;
      canvas!.height = window.innerHeight * dpr;
      canvas!.style.width  = window.innerWidth  + "px";
      canvas!.style.height = window.innerHeight + "px";
      ctx!.scale(dpr, dpr);

      const pts: typeof pointsRef.current = [];
      for (let i = 0; i < POINT_COUNT; i++) {
        pts.push({
          x:  Math.random() * window.innerWidth,
          y:  Math.random() * window.innerHeight,
          vx: (Math.random() - 0.5) * 0.5 * speed,
          vy: (Math.random() - 0.5) * 0.5 * speed,
          r:  0.8 + Math.random() * 2.2,
          hueIdx:  Math.floor(Math.random() * hues.length),
          huePhase: Math.random() * Math.PI * 2,
          hueSpeed: (0.003 + Math.random() * 0.008) * hueSpeedMult,
        });
      }
      pointsRef.current = pts;
    }

    // Parse hex to rgb for connection lines in non-colorful mode
    function hexToRgb(hex: string): string {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `${r},${g},${b}`;
    }
    const rgb = fillColor.startsWith("#") && fillColor.length === 7
      ? hexToRgb(fillColor)
      : "28,98,242";

    /** Get the current color for a particle in colorful mode */
    function getParticleColor(p: typeof pointsRef.current[0], alpha: number): string {
      // Oscillate between white and a subtle hue
      const blend = (Math.sin(p.huePhase) + 1) / 2; // 0..1
      const h = hues[p.hueIdx % hues.length];
      // When blend is 0: near-white (sat=0, lit=95)
      // When blend is 1: subtle color (sat=given, lit=given)
      const s = blend * sat;
      const l = 95 - blend * (95 - lit);
      return `hsla(${h}, ${s}%, ${l}%, ${alpha})`;
    }

    function draw() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx!.clearRect(0, 0, w, h);
      const pts = pointsRef.current;

      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;

        if (colorful) {
          // Advance phase
          p.huePhase += p.hueSpeed;
          // Occasionally shift to a new hue target
          if (Math.random() < 0.0003) {
            p.hueIdx = (p.hueIdx + 1 + Math.floor(Math.random() * (hues.length - 1))) % hues.length;
          }
          ctx!.fillStyle = getParticleColor(p, 0.9);
        } else {
          ctx!.fillStyle = fillColor;
        }

        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fill();

        for (let j = i + 1; j < pts.length; j++) {
          const p2 = pts[j];
          const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
          if (dist < maxDist) {
            const alpha = lineAlpha * (1 - dist / maxDist);

            if (colorful) {
              // Connection takes the average hue of the two endpoints
              const blend1 = (Math.sin(p.huePhase) + 1) / 2;
              const blend2 = (Math.sin(p2.huePhase) + 1) / 2;
              const avgBlend = (blend1 + blend2) / 2;
              const h1 = hues[p.hueIdx % hues.length];
              const h2 = hues[p2.hueIdx % hues.length];
              // Circular hue average
              const avgHue = (h1 + h2) / 2;
              const s = avgBlend * (sat * 0.6);
              const l = 95 - avgBlend * (95 - lit);
              ctx!.strokeStyle = `hsla(${avgHue}, ${s}%, ${l}%, ${alpha})`;
            } else {
              ctx!.strokeStyle = `rgba(${rgb}, ${alpha})`;
            }

            ctx!.beginPath();
            ctx!.lineWidth = 0.8;
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
  }, [canvasRef, opts?.color, opts?.connectionDist, opts?.lineOpacity, opts?.colorful, opts?.saturation, opts?.lightness, opts?.hues, opts?.speed, opts?.hueSpeedMultiplier]);
}
