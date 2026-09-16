import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ProvedorAuth } from './lib/auth'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ProvedorAuth>
        <App />
      </ProvedorAuth>
    </BrowserRouter>
  </StrictMode>,
)
