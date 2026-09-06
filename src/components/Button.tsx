import type { ComponentPropsWithRef } from 'react'
import { cx } from '../lib/cx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'
export type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const variantClasses: Record<ButtonVariant, string> = {
  // The global :focus-visible ring is pine, which all but disappears against a
  // pine fill; primary buttons draw theirs in ink instead (12.6:1 on the page
  // in light, 12.8:1 in dark) and every variant keeps a 2px offset so the ring
  // sits on the page background rather than on the button.
  primary: 'bg-pine text-page hover:bg-pine-deep focus-visible:outline-ink',
  secondary: 'border border-line-strong bg-card text-ink hover:bg-mint',
  ghost: 'text-muted hover:bg-mint hover:text-ink',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex cursor-pointer items-center justify-center gap-2 rounded-md font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        'focus-visible:outline-2 focus-visible:outline-offset-2',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...rest}
    />
  )
}
