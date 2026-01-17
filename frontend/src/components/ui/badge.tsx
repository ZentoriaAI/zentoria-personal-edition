'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-zentoria-500 text-white',
        secondary:
          'border-transparent bg-light-surface dark:bg-dark-elevated text-foreground',
        destructive:
          'border-transparent bg-red-500 text-white',
        success:
          'border-transparent bg-green-500 text-white',
        warning:
          'border-transparent bg-yellow-500 text-white',
        outline: 'text-foreground',
        // Status variants
        online:
          'border-transparent bg-green-500/10 text-green-500',
        offline:
          'border-transparent bg-gray-500/10 text-gray-500',
        running:
          'border-transparent bg-green-500/10 text-green-500',
        stopped:
          'border-transparent bg-gray-500/10 text-gray-500',
        error:
          'border-transparent bg-red-500/10 text-red-500',
        pending:
          'border-transparent bg-yellow-500/10 text-yellow-500',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
  pulse?: boolean;
}

function Badge({ className, variant, dot, pulse, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full mr-1.5',
            variant === 'online' || variant === 'running' || variant === 'success'
              ? 'bg-green-500'
              : variant === 'error' || variant === 'destructive'
              ? 'bg-red-500'
              : variant === 'warning' || variant === 'pending'
              ? 'bg-yellow-500'
              : 'bg-gray-500',
            pulse && 'animate-pulse'
          )}
        />
      )}
      {children}
    </div>
  );
}

export { Badge, badgeVariants };
