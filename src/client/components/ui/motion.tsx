// Анимации: поэтапное появление, счётчики, переходы. Учитываем prefers-reduced-motion.

import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function Reveal({
  children,
  delay = 0,
  y = 14,
  className,
  ...props
}: { children: ReactNode; delay?: number; y?: number; className?: string } & HTMLMotionProps<'div'>) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function StaggerList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}

/** Плавный счётчик: анимирует число без «прыжков» при перерисовке. */
export function AnimatedNumber({
  value,
  duration = 700,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    if (from === value) return;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(from + (value - from) * eased);
      setDisplay(next);
      if (progress < 1) frame = requestAnimationFrame(step);
      else fromRef.current = value;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduce]);

  return <span className={className}>{new Intl.NumberFormat('ru-RU').format(display)}</span>;
}

export function PageTransition({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
