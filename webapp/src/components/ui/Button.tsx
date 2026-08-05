import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'
export type ButtonSize = 'md' | 'sm'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  type = 'button',
  ...buttonProps
}: ButtonProps) {
  const classes = [
    'ui-btn',
    variant === 'primary' ? 'ui-btn-primary' : '',
    variant === 'secondary' ? 'ui-btn-secondary' : '',
    variant === 'ghost' ? 'ui-btn-ghost' : '',
    size === 'sm' ? 'ui-btn-sm' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type={type} className={classes} {...buttonProps}>
      {children}
    </button>
  )
}
