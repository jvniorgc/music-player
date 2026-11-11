/** Default timeout for API requests made by the renderer services. */
export const DEFAULT_TIMEOUT_MS = 20_000

/**
 * An AbortSignal that aborts when `signal` aborts or after `timeoutMs`,
 * whichever comes first. Implemented manually so it works across runtimes
 * lacking AbortSignal.any / AbortSignal.timeout.
 */
export function timeoutSignal(signal?: AbortSignal, timeoutMs = DEFAULT_TIMEOUT_MS): AbortSignal {
  const controller = new AbortController()
  if (signal?.aborted) {
    controller.abort(signal.reason)
    return controller.signal
  }
  const timer = setTimeout(() => {
    controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, 'TimeoutError'))
  }, timeoutMs)
  const onAbort = () => {
    clearTimeout(timer)
    controller.abort(signal?.reason)
  }
  signal?.addEventListener('abort', onAbort, { once: true })
  controller.signal.addEventListener('abort', () => {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }, { once: true })
  return controller.signal
}

/** True when an error came from an aborted (cancelled or timed-out) request. */
export function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')
    || (typeof DOMException !== 'undefined' && err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError'))
}
