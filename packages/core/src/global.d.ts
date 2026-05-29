import type { PlatformApi } from './platform'

declare global {
  interface Window {
    api: PlatformApi
  }
}

export {}
