'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Slim progress bar across the top of the viewport — fires on every
 * client-side navigation. Instantly visible feedback that the app is
 * loading, even when the server component takes 1-2 s to resolve.
 */
export function TopLoader() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const prev = useRef(pathname);

  const start = useCallback(() => {
    setProgress(12);
    setVisible(true);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) {
          if (timer.current) clearInterval(timer.current);
          return p;
        }
        // fast at first, then slow down — feels natural
        const step = p < 30 ? 8 : p < 60 ? 4 : p < 80 ? 1.5 : 0.5;
        return Math.min(p + step, 90);
      });
    }, 120);
  }, []);

  const finish = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    setProgress(100);
    setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 280);
  }, []);

  // Detect route changes
  useEffect(() => {
    if (prev.current !== pathname) {
      finish();
      prev.current = pathname;
    }
  }, [pathname, finish]);

  // Intercept link clicks to start the bar before React navigates
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (
        href &&
        href.startsWith('/') &&
        href !== pathname &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        anchor.target !== '_blank'
      ) {
        start();
      }
    };
    document.addEventListener('click', handleClick, { capture: true });
    return () => document.removeEventListener('click', handleClick, { capture: true });
  }, [pathname, start]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[2.5px]">
      <div
        className="h-full bg-accent shadow-[0_0_8px_var(--color-accent)] transition-[width] duration-150 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
