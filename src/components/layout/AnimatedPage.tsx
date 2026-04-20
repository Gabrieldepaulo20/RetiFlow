import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

const variants = {
  initial: { opacity: 0, y: 2, scale: 0.998 },
  enter: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    opacity: 0,
    y: -1,
    scale: 0.998,
    transition: { duration: 0.1, ease: [0.4, 0, 1, 1] },
  },
};

/**
 * Wraps a page with a very subtle fade transition.
 * The goal is to keep navigation polished without a noticeable "jump".
 */
export function AnimatedPage({ children }: { children: ReactNode }) {
  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="enter"
      exit="exit"
      style={{ height: '100%' }}
    >
      {children}
    </motion.div>
  );
}
