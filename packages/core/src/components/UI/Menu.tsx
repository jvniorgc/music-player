import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal, type LucideIcon } from 'lucide-react'

export interface MenuItem {
  label: string
  icon?: LucideIcon
  onSelect: () => void
  danger?: boolean
}
export type MenuEntry = MenuItem | 'separator' | null | false | undefined | '' | 0

/** Drops falsy entries and leading/trailing/duplicate separators. */
export function cleanEntries(entries: MenuEntry[]): (MenuItem | 'separator')[] {
  const out: (MenuItem | 'separator')[] = []
  for (const e of entries) {
    if (!e) continue
    if (e === 'separator' && (out.length === 0 || out[out.length - 1] === 'separator')) continue
    out.push(e)
  }
  while (out[out.length - 1] === 'separator') out.pop()
  return out
}

/** A positioned popup menu rendered in a portal; Escape/Tab/outside click close it, arrows move focus. */
export function MenuPopover({ entries, x, y, onClose }: {
  entries: MenuEntry[]
  x: number
  y: number
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  const items = cleanEntries(entries)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - width - 4)),
      top: y + height > window.innerHeight - 4 ? Math.max(4, y - height) : y,
    })
    el.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [x, y])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onScroll = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onClose)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  const onKeyDown = (e: ReactKeyboardEvent) => {
    // Keep keys from reaching the global player shortcuts.
    e.stopPropagation()
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      buttons[(i + 1) % buttons.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      buttons[(i - 1 + buttons.length) % buttons.length]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      buttons[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      buttons[buttons.length - 1]?.focus()
    }
  }

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-[60] bg-surface-2 border border-border rounded-lg shadow-lg shadow-black/40 py-1.5 min-w-[200px] max-w-[280px]"
      style={pos}
      onKeyDown={onKeyDown}
      onClick={e => e.stopPropagation()}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation() }}
    >
      {items.map((item, i) => item === 'separator' ? (
        <div key={`sep-${i}`} role="separator" className="my-1 border-t border-border" />
      ) : (
        <button
          key={`${item.label}-${i}`}
          role="menuitem"
          type="button"
          onClick={() => { onClose(); item.onSelect() }}
          className={`flex items-center gap-3 w-full px-4 py-2 text-sm text-left hover:bg-white/10 focus:bg-white/10 focus:outline-none transition-colors ${item.danger ? 'text-danger' : 'text-text-primary'}`}
        >
          {item.icon && <item.icon size={14} className="shrink-0" />}
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </div>,
    document.body
  )
}

/**
 * "..." button that opens a menu. With `bindRow`, right-clicking the closest
 * `[data-menu-row]` ancestor (a track row or card) opens it at the cursor.
 */
export function MoreMenu({ entries, bindRow = true, className, label = 'More options', size = 14 }: {
  /** Built lazily so menus don't compute their items for every row render. */
  entries: () => MenuEntry[]
  bindRow?: boolean
  className?: string
  label?: string
  size?: number
}) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!bindRow) return
    const row = buttonRef.current?.closest<HTMLElement>('[data-menu-row]')
    if (!row) return
    const onContextMenu = (e: MouseEvent) => {
      // Let nested rows/menus handle their own right-click.
      if (e.defaultPrevented) return
      e.preventDefault()
      setAt({ x: e.clientX, y: e.clientY })
    }
    row.addEventListener('contextmenu', onContextMenu)
    return () => row.removeEventListener('contextmenu', onContextMenu)
  }, [bindRow])

  const close = () => {
    setAt(null)
    buttonRef.current?.focus({ preventScroll: true })
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={!!at}
        aria-label={label}
        title={label}
        onClick={(e) => {
          e.stopPropagation()
          if (at) { setAt(null); return }
          const r = e.currentTarget.getBoundingClientRect()
          setAt({ x: r.left, y: r.bottom + 4 })
        }}
        className={className ?? `p-1.5 rounded-full hover:bg-white/10 text-text-tertiary transition-all shrink-0 focus-visible:opacity-100 ${at ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
      >
        <MoreHorizontal size={size} />
      </button>
      {at && <MenuPopover entries={entries()} x={at.x} y={at.y} onClose={close} />}
    </>
  )
}
