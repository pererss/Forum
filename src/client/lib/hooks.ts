// Небольшие клиентские хуки.

import { useEffect, useState } from 'react';

export function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    const base = 'Nuffy — сообщество';
    document.title = title ? `${title} · Nuffy` : base;
    return () => {
      document.title = base;
    };
  }, [title]);
}

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const listener = (event: MediaQueryListEvent) => setMobile(event.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);
  return mobile;
}

/** Блокирует прокрутку фона при открытой модалке. */
export function useLockBody(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [locked]);
}
