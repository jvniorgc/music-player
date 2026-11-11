/** True when the event target is a text field where typing must not trigger shortcuts. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== 'string') return false
  const el = target as HTMLElement
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase()
    // Range sliders / checkboxes / buttons don't take text input.
    return !['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file'].includes(type)
  }
  return el.isContentEditable || el.getAttribute?.('contenteditable') === 'true'
}
