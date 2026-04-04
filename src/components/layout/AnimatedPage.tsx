import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

const variants = {
  initial: { opacity: 0, y: 4 },
  enter: { opacity: 1, y: 0, transition: { duration: 0.14, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit: { opacity: 0, transition: { duration: 0.08, ease: 'easeOut' } },
};

/**
 * Wraps a page with a subtle fade + slide-up transition.
 * Light enough to not be distracting, smooth enough to feel polished.
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
