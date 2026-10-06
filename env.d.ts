/* הצהרות גלובליות: ייבוא נכסים, וגשר ה-preload של Electron */
declare module '*.png' {
  const value: string
  export default value
}

declare module '*.css' {
  const content: Record<string, string>
  export default content
}

interface Window {
  electron: {
    setIgnoreMouseEvents: (ignore: boolean) => void
    closeApp: () => void
  }
}
