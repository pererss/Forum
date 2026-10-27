// Карточки, бейджи, аватары, скелетоны, пустые состояния.

import { cva, type VariantProps } from 'class-variance-authority';
import { cn, formatNumber } from '@/client/lib/utils';
import { initialsOf, stableHue } from '@/shared/slug';
import type { ReactNode } from 'react';

// ————— Карточка —————

export function Card({
  className,
  hover = false,
  children,
  ...props
}: { className?: string; hover?: boolean; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card text-card-foreground shadow-card',
        hover &&
          'transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-pop',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ————— Бейдж типа публикации —————

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none border',
  {
    variants: {
      tone: {
        neutral: 'bg-secondary text-secondary-foreground border-border',
        blue: 'bg-info/10 text-info border-info/25',
        amber: 'bg-warning/10 text-warning border-warning/25',
        teal: 'bg-success/10 text-success border-success/25',
        emerald: 'bg-success/10 text-success border-success/25',
        rose: 'bg-destructive/10 text-destructive border-destructive/25',
        orange: 'bg-warning/10 text-warning border-warning/25',
        indigo: 'bg-accent/10 text-accent border-accent/25',
        cyan: 'bg-info/10 text-info border-info/25',
        violet: 'bg-accent/10 text-accent border-accent/25',
        slate: 'bg-secondary text-secondary-foreground border-border',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export function Badge({
  tone,
  className,
  children,
}: VariantProps<typeof badgeVariants> & { className?: string; children: ReactNode }) {
  return <span className={cn(badgeVariants({ tone }), className)}>{children}</span>;
}

// ————— Аватар-инициалы —————

export function Avatar({
  name,
  username,
  size = 36,
  className,
}: {
  name: string;
  username?: string;
  size?: number;
  className?: string;
}) {
  const seed = username || name;
  const hue = stableHue(seed);
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white/95',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.38)),
        background: `linear-gradient(135deg, hsl(${hue} 18% 34%), hsl(${(hue + 40) % 360} 16% 22%))`,
      }}
    >
      {initialsOf(name)}
    </span>
  );
}

// ————— Скелетоны —————

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse-soft rounded-md bg-muted', className)}
    />
  );
}

export function PostCardSkeleton({ variant = 'list' }: { variant?: 'list' | 'grid' }) {
  return (
    <Card
      className={cn(
        'space-y-3 p-4 sm:p-5',
        variant === 'grid' && 'flex h-full min-h-[292px] flex-col p-4',
      )}
    >
      <div className="flex items-center gap-2.5">
        <Skeleton className="h-7 w-7 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="h-2 w-14" />
        </div>
      </div>
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
      <div className="space-y-1.5">
        <Skeleton className="h-2.5 w-full" />
        <Skeleton className="h-2.5 w-3/4" />
      </div>
      <div className="flex gap-2 pt-2">
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
    </Card>
  );
}

export function FeedSkeleton({
  count = 5,
  layout = 'list',
}: {
  count?: number;
  layout?: 'list' | 'grid';
}) {
  return (
    <div
      className={cn(
        layout === 'list'
          ? 'space-y-3'
          : 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
      )}
      aria-label="Загрузка публикаций"
      role="status"
    >
      {Array.from({ length: count }, (_, index) => (
        <PostCardSkeleton key={index} variant={layout === 'grid' ? 'grid' : 'list'} />
      ))}
    </div>
  );
}

// ————— Пустое состояние —————

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-border bg-card/50 px-6 py-16 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-40 w-72 -translate-x-1/2 rounded-full bg-accent/10 blur-3xl"
      />
      {icon ? (
        <div className="relative mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-border bg-surface text-muted-foreground/70">
          {icon}
        </div>
      ) : null}
      <h3 className="relative font-display text-base font-semibold">{title}</h3>
      {description ? (
        <p className="relative mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="relative mt-5">{action}</div> : null}
    </div>
  );
}

// ————— Ошибка с повтором —————

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center"
    >
      <p className="text-sm font-medium text-destructive">Что-то пошло не так</p>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-surface-hover"
        >
          Повторить
        </button>
      ) : null}
    </div>
  );
}

// ————— Счётчик —————

export function CountBadge({ value, max = 99 }: { value: number; max?: number }) {
  if (value <= 0) return null;
  return (
    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
      {value > max ? `${max}+` : formatNumber(value)}
    </span>
  );
}
