// electron-vite `?asset` imports resolve to the emitted file's absolute path.
declare module '*?asset' {
  const path: string
  export default path
}
