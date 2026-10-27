// Утилиты классов (shadcn-подход): clsx + tailwind-merge.

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Форматирование чисел и дат по-русски. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function timeAgo(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'только что';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} дн назад`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} мес назад`;
  return formatDate(value);
}

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function pluralComments(n: number): string {
  return `${n} ${plural(n, 'комментарий', 'комментария', 'комментариев')}`;
}

export function pluralPosts(n: number): string {
  return `${n} ${plural(n, 'публикация', 'публикации', 'публикаций')}`;
}
