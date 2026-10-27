// Поля ввода, теги, переключатели.

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { cn } from '@/client/lib/utils';
import { X } from 'lucide-react';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring/40 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-[90px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring/40 disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm shadow-sm focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring/40 disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

export function Label({
  htmlFor,
  children,
  hint,
  error,
  className,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  hint?: string;
  error?: string | undefined;
  className?: string;
}) {
  return (
    <div className={cn('mb-1.5 flex items-baseline justify-between gap-2', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {children}
      </label>
      {error ? (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <Label htmlFor={htmlFor} hint={hint} error={error}>
        {label}
      </Label>
      {children}
    </div>
  );
}

// ————— Тег-чип с удалением —————

export function TagChip({
  name,
  onRemove,
  onClick,
  active = false,
}: {
  name: string;
  onRemove?: () => void;
  onClick?: () => void;
  active?: boolean;
}) {
  const Comp = onClick ? 'button' : 'span';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-accent/40 bg-accent/10 text-accent'
          : 'border-border bg-secondary text-secondary-foreground',
        onClick && 'hover:border-foreground/25 hover:bg-surface-hover cursor-pointer',
      )}
    >
      {onClick ? (
        <Comp type="button" onClick={onClick} className="contents">
          {name}
        </Comp>
      ) : (
        name
      )}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Убрать тег ${name}`}
          className="-mr-0.5 rounded-full p-0.5 hover:bg-foreground/10"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}

// ————— Переключатель (нативный checkbox в стиле) —————

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-2">
      <span className="text-sm text-foreground">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full border transition-colors disabled:opacity-50',
          checked ? 'border-accent bg-accent' : 'border-input bg-muted',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-4',
          )}
        />
      </button>
    </label>
  );
}

// ————— Радио-карточка для выбора типа публикации —————

export function RadioCard({
  selected,
  onSelect,
  title,
  description,
  icon,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg border p-3.5 text-left transition-all duration-150',
        selected
          ? 'border-accent bg-accent/5 shadow-sm'
          : 'border-border bg-card hover:border-foreground/20 hover:bg-surface-hover',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
          selected ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
    </button>
  );
}
