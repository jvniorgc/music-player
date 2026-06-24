import { vi } from 'vitest'

/** A JSON Response (uses the real Web Response available in Node 20+). */
export function jsonRes(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

/** A plain-text Response. */
export function textRes(text: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(text, { status, headers })
}

/** An empty Response (e.g. 204 No Content, or a bodyless HEAD). */
export function emptyRes(status = 204, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers })
}

type Route = Response | ((url: string, init?: RequestInit) => Response | Promise<Response>)

/**
 * Install a `fetch` mock that routes by substring match against the request URL.
 * The first matching entry (in insertion order) wins. Unmatched URLs reject so
 * tests fail loudly on unexpected calls.
 */
export function mockFetchRouter(routes: Array<[match: string, route: Route]>) {
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    for (const [match, route] of routes) {
      if (url.includes(match)) {
        return typeof route === 'function' ? route(url, init) : route
      }
    }
    throw new Error(`Unexpected fetch: ${url}`)
  })
  vi.stubGlobal('fetch', fn)
  return fn
}
