import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'

const restoreGithubPagesRedirect = () => {
  const redirect = window.sessionStorage.getItem('lucca:redirect')

  if (!redirect) {
    return
  }

  window.sessionStorage.removeItem('lucca:redirect')

  const basePath = import.meta.env.BASE_URL
  const baseWithoutTrailingSlash = basePath.replace(/\/$/, '')
  const routePath = redirect.startsWith(basePath)
    ? redirect.slice(basePath.length - 1)
    : redirect

  window.history.replaceState(
    null,
    '',
    `${baseWithoutTrailingSlash}${routePath.startsWith('/') ? routePath : `/${routePath}`}`,
  )
}

restoreGithubPagesRedirect()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
