// Поля ввода, теги, переключатели, кастомные списки выбора.

import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown, X } from 'lucide-react';
import {
  Children,
  forwardRef,
  isValidElement,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/client/lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-9 w-full rounded-[10px] border border-input bg-card px-3 py-1 text-sm text-foreground shadow-sm transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_18%,transparent)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
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
      'flex min-h-[90px] w-full rounded-[10px] border border-input bg-card px-3 py-2 text-sm shadow-sm transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_18%,transparent)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

// ————— Select: нативный API (<option>), но отрисовка в стиле Nuffy —————

const EMPTY_VALUE = '__nuffy_empty__';

type NativeOption = React.ReactElement<{
  value?: string | number;
  children?: ReactNode;
  disabled?: boolean;
}>;

function readOptions(children: ReactNode) {
  const options: { value: string; label: string; disabled: boolean }[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const option = child as NativeOption;
    const raw = option.props.children;
    const label =
      typeof raw === 'string' || typeof raw === 'number'
        ? String(raw)
        : Children.toArray(raw)
            .filter((part) => typeof part === 'string' || typeof part === 'number')
            .join('')
            .trim();
    options.push({
      value: String(option.props.value ?? label),
      label,
      disabled: Boolean(option.props.disabled),
    });
  });
  return options;
}

export const Select = forwardRef<
  HTMLButtonElement,
  SelectHTMLAttributes<HTMLSelectElement> & { placeholder?: string }
>(({ className, children, value, onChange, disabled, id, name, placeholder, ...props }, ref) => {
  const options = readOptions(children);
  const current = value === undefined || value === null ? '' : String(value);
  const empty = options.find((option) => option.value === '');
  const radixValue = current === '' ? EMPTY_VALUE : current;

  return (
    <RadixSelect.Root
      value={radixValue}
      disabled={disabled}
      name={name}
      onValueChange={(next) => {
        const real = next === EMPTY_VALUE ? '' : next;
        onChange?.({
          target: { value: real, name },
          currentTarget: { value: real, name },
        } as never);
      }}
    >
      <RadixSelect.Trigger
        ref={ref}
        id={id}
        aria-label={(props as { 'aria-label'?: string })['aria-label']}
        className={cn(
          'group flex h-9 w-full items-center justify-between gap-2 rounded-[10px] border border-input bg-card px-3 text-sm text-foreground shadow-sm transition-[border-color,box-shadow] hover:border-foreground/20 focus-visible:border-ring focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_18%,transparent)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:border-ring',
          className,
        )}
      >
        <RadixSelect.Value placeholder={placeholder ?? empty?.label ?? 'Выберите'}>
          {current === '' ? (empty?.label ?? placeholder) : undefined}
        </RadixSelect.Value>
        <RadixSelect.Icon asChild>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={6}
          className="nuffy-select-content z-[70] max-h-[min(340px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-pop backdrop-blur-xl"
        >
          <RadixSelect.ScrollUpButton className="flex h-6 items-center justify-center text-muted-foreground">
            <ChevronDown className="h-4 w-4 rotate-180" />
          </RadixSelect.ScrollUpButton>
          <RadixSelect.Viewport className="p-0.5">
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value || '__empty'}
                value={option.value === '' ? EMPTY_VALUE : option.value}
                disabled={option.disabled}
                className={cn(
                  'relative flex cursor-pointer select-none items-center gap-2 rounded-lg py-1.5 pl-2.5 pr-8 text-[13px] font-medium outline-none transition-colors',
                  'data-[highlighted]:bg-surface-hover data-[highlighted]:text-foreground',
                  'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
                )}
              >
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator className="absolute right-2.5 flex items-center">
                  <Check className="h-3.5 w-3.5 text-accent" />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
          <RadixSelect.ScrollDownButton className="flex h-6 items-center justify-center text-muted-foreground">
            <ChevronDown className="h-4 w-4" />
          </RadixSelect.ScrollDownButton>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
});
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
        onClick && 'cursor-pointer hover:border-foreground/25 hover:bg-surface-hover',
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
          'relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-200 disabled:opacity-50',
          checked ? 'border-accent bg-accent' : 'border-input bg-muted',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
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
