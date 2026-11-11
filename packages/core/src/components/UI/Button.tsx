import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'icon'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
const BASE = `inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none ${FOCUS}`

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: `${BASE} h-8 px-4 rounded-sm text-sm font-medium bg-accent hover:bg-accent-hover active:brightness-90 text-white`,
  secondary: `${BASE} h-8 px-4 rounded-sm text-sm font-medium bg-surface-2 border border-border text-text-primary hover:bg-surface-3 active:bg-surface-2`,
  danger: `${BASE} h-8 px-4 rounded-sm text-sm font-medium bg-danger hover:brightness-110 active:brightness-90 text-white`,
  icon: `${BASE} p-1.5 rounded-full text-text-secondary hover:text-text-primary hover:bg-white/10 active:bg-white/5`,
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

const INPUT_BASE = 'w-full h-9 px-3 rounded-sm border text-sm text-text-primary placeholder:text-text-tertiary transition-colors focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50'

const INPUT_VARIANTS: Record<InputVariant, string> = {
  default: `${INPUT_BASE} bg-surface-2 border-border`,
  subtle: `${INPUT_BASE} bg-bg border-border`,
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: InputVariant
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { variant = 'default', className = '', ...rest }, ref
) {
  return <input ref={ref} className={className ? `${INPUT_VARIANTS[variant]} ${className}` : INPUT_VARIANTS[variant]} {...rest} />
})
