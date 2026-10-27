// Кнопки: состояния hover/press/loading/success, размеры, варианты.

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2, Check } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/client/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] select-none',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md',
        secondary:
          'bg-secondary text-secondary-foreground border border-border hover:bg-surface-hover hover:border-foreground/20',
        ghost: 'text-muted-foreground hover:bg-surface-hover hover:text-foreground',
        outline: 'border border-border bg-transparent hover:bg-surface-hover',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        success: 'bg-success text-success-foreground hover:bg-success/90',
        link: 'text-accent underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-9 px-4',
        lg: 'h-11 px-6 text-[15px]',
        icon: 'h-9 w-9',
        'icon-sm': 'h-8 w-8',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  success?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, success, children, disabled, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size }), className);

    // Slot требует ровно одного React-элемента, поэтому иконка состояния
    // добавляется только для обычной кнопки.
    if (asChild) {
      return (
        <Slot ref={ref} className={classes} {...props}>
          {children}
        </Slot>
      );
    }

    return (
      <button
        ref={ref}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : success ? (
          <Check className="h-4 w-4" aria-hidden />
        ) : null}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
