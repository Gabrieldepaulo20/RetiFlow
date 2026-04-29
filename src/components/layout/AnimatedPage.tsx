import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

const variants = {
  initial: { opacity: 0.96 },
  enter: {
    opacity: 1,
    transition: { duration: 0.08, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    opacity: 1,
    transition: { duration: 0 },
  },
};

/**
 * Wraps a page with a very subtle fade transition.
 * The goal is to keep navigation polished without a noticeable "jump".
 */
export function AnimatedPage({ children }: { children: ReactNode }) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      variants={variants}
      initial={prefersReducedMotion ? false : 'initial'}
      animate="enter"
      exit="exit"
      style={{ height: '100%' }}
    >
      {children}
    </motion.div>
  );
}
