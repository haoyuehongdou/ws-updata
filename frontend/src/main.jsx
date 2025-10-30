import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@ant-design/v5-patch-for-react-19';
import './index.css'
import App from './App.jsx'
import { ConnectionProvider } from './contexts/ConnectionContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ConnectionProvider>
      <App />
    </ConnectionProvider>
  </StrictMode>,
)
