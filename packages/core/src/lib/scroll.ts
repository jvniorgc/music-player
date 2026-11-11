/** Nearest ancestor that scrolls vertically, falling back to the document scroller. */
export function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null
  while (node) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll') return node
    node = node.parentElement
  }
  return (document.scrollingElement as HTMLElement | null) ?? null
}
