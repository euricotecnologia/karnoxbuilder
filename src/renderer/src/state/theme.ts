import { useAppStore } from './store'

type Theme = 'dark' | 'light'

function apply(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
  useAppStore.getState().setTheme(theme)
}

export async function loadInitialTheme(): Promise<void> {
  const saved = await window.api.settings.get('ui_theme')
  apply(saved === 'light' ? 'light' : 'dark')
}

export async function applyTheme(theme: Theme): Promise<void> {
  apply(theme)
  await window.api.settings.set('ui_theme', theme)
}
