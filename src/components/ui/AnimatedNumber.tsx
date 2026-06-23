import { useEffect, useRef, useState } from 'react';

type AnimatedNumberProps = {
  /** Valor final a exibir. */
  value: number;
  /** Formata o número inteiro intermediário (ex.: moeda BRL). */
  format?: (value: number) => string;
  /** Duração da animação em ms. */
  duration?: number;
  className?: string;
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/**
 * Conta de 0 (ou do valor anterior) até `value` com easing suave.
 * Respeita prefers-reduced-motion: nesse caso mostra o valor final direto.
 */
export function AnimatedNumber({ value, format = (n) => String(n), duration = 900, className }: AnimatedNumberProps) {
  const [display, setDisplay] = useState(() => (prefersReducedMotion() ? value : 0));
  const fromRef = useRef(0);
  const frameRef = useRef<number>();

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(value);
      return;
    }

    const from = fromRef.current;
    const delta = value - from;
    if (delta === 0) {
      setDisplay(value);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      setDisplay(from + delta * eased);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      fromRef.current = value;
    };
  }, [value, duration]);

  return <span className={className}>{format(Math.round(display))}</span>;
}
