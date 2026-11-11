import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'icon'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'px-5 py-2 rounded-full text-sm font-semibold bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
  secondary: 'px-5 py-2 rounded-full text-sm text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors disabled:opacity-40',
  danger: 'px-5 py-2 rounded-full text-sm font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
  icon: 'p-1.5 rounded-full hover:bg-white/10 text-text-tertiary transition-colors',
}

export function buttonClass(variant: ButtonVariant = 'primary', className = ''): string {
  return className ? `${BUTTON_VARIANTS[variant]} ${className}` : BUTTON_VARIANTS[variant]
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

/** Shared button. `className` is appended for layout tweaks (e.g. `flex items-center gap-2`). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', className = '', type = 'button', ...rest }, ref
) {
  return <button ref={ref} type={type} className={buttonClass(variant, className)} {...rest} />
})

export type InputVariant = 'default' | 'subtle'

const INPUT_VARIANTS: Record<InputVariant, string> = {
  default: 'w-full bg-bg-elevated border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition',
  subtle: 'w-full bg-bg-primary border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition',
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: InputVariant
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { variant = 'default', className = '', ...rest }, ref
) {
  return <input ref={ref} className={className ? `${INPUT_VARIANTS[variant]} ${className}` : INPUT_VARIANTS[variant]} {...rest} />
})
