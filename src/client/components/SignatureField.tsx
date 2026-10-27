// Курсор-реактивная «подпись» Nuffy: лента света, которая следует за указателем.
// На тач-устройствах и при prefers-reduced-motion — спокойная статичная волна.

import { useEffect, useRef } from 'react';
import { cn } from '@/client/lib/utils';

type Point = { x: number; y: number };

export function SignatureField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0;
    let height = 0;
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    let frame = 0;
    let pointerActive = false;
    const pointer: Point = { x: 0, y: 0 };
    const head: Point = { x: 0, y: 0 };
    const points: Point[] = [];
    const dust = Array.from({ length: 46 }, () => ({
      x: Math.random(),
      y: Math.random(),
      speed: 0.00008 + Math.random() * 0.00022,
      size: 0.4 + Math.random() * 1.2,
      phase: Math.random() * Math.PI * 2,
    }));

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (points.length === 0) {
        head.x = width / 2;
        head.y = height / 2;
        for (let index = 0; index < 50; index += 1) {
          points.push({ x: width / 2 - index * 4, y: height / 2 });
        }
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    head.x = width / 2;
    head.y = height / 2;
    pointer.x = head.x;
    pointer.y = head.y;

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      if (!pointerActive) {
        pointerActive = true;
        if (points.length === 0) {
          for (let index = 0; index < 50; index += 1) points.push({ ...pointer });
        }
      }
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    const isDark = () =>
      document.documentElement.classList.contains('dark');

    const draw = (time: number) => {
      context.clearRect(0, 0, width, height);

      if (pointerActive) {
        head.x += (pointer.x - head.x) * 0.14;
        head.y += (pointer.y - head.y) * 0.14;
      } else {
        const t = time / 2600;
        head.x = width * (0.5 + 0.22 * Math.sin(t * 0.9));
        head.y = height * (0.5 + 0.16 * Math.sin(t * 1.35 + 1.2));
      }

      points.unshift({ x: head.x, y: head.y });
      if (points.length > 54) points.pop();

      const dark = isDark();
      const accent = dark ? [124, 190, 240] : [66, 112, 224];
      const soft = dark ? [200, 220, 255] : [30, 40, 70];

      // Пыль
      context.globalCompositeOperation = 'source-over';
      for (const particle of dust) {
        particle.y -= particle.speed * (reduce ? 0 : 16);
        if (particle.y < -0.02) particle.y = 1.02;
        const px = particle.x * width;
        const py = particle.y * height;
        const twinkle = 0.18 + 0.12 * Math.sin(time / 900 + particle.phase);
        context.beginPath();
        context.arc(px, py, particle.size, 0, Math.PI * 2);
        context.fillStyle = `rgba(${soft[0]}, ${soft[1]}, ${soft[2]}, ${twinkle.toFixed(3)})`;
        context.fill();
      }

      // Светящаяся лента: несколько смещённых проходов
      context.globalCompositeOperation = 'lighter';
      for (let layer = 0; layer < 3; layer += 1) {
        const offset = (layer - 1) * (5 + layer * 2);
        const alphaBase = layer === 1 ? 0.5 : 0.16;
        for (let index = 1; index < points.length; index += 1) {
          const previous = points[index - 1]!;
          const current = points[index]!;
          const next = points[index + 1] ?? current;
          const dx = next.x - previous.x;
          const dy = next.y - previous.y;
          const length = Math.hypot(dx, dy) || 1;
          const nx = (-dy / length) * offset;
          const ny = (dx / length) * offset;

          const fade = 1 - index / points.length;
          const alpha = alphaBase * fade * fade;
          if (alpha <= 0.004) continue;

          context.beginPath();
          context.moveTo(previous.x + nx, previous.y + ny);
          context.quadraticCurveTo(
            current.x + nx,
            current.y + ny,
            (current.x + next.x) / 2 + nx,
            (current.y + next.y) / 2 + ny,
          );
          context.strokeStyle = `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, ${alpha.toFixed(3)})`;
          context.lineWidth = (layer === 1 ? 2.4 : 1.1) * (0.4 + fade * 0.9);
          context.lineCap = 'round';
          context.stroke();
        }
      }

      // Яркая голова
      const glow = context.createRadialGradient(head.x, head.y, 0, head.x, head.y, 46);
      glow.addColorStop(0, `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, 0.55)`);
      glow.addColorStop(0.35, `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, 0.16)`);
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(head.x, head.y, 48, 0, Math.PI * 2);
      context.fill();

      context.globalCompositeOperation = 'source-over';
      context.beginPath();
      context.arc(head.x, head.y, 3, 0, Math.PI * 2);
      context.fillStyle = dark ? 'rgba(235, 246, 255, 0.95)' : 'rgba(30, 52, 120, 0.9)';
      context.fill();

      if (!reduce) frame = requestAnimationFrame(draw);
    };

    if (reduce) {
      head.x = width / 2;
      head.y = height / 2;
      draw(0);
    } else {
      frame = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}
    />
  );
}
