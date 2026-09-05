import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

class GlobalErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ fontFamily: 'monospace', padding: 24 }}>
          <h1 style={{ color: '#b91c1c' }}>Erro no painel</h1>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: '#f8fafc', padding: 12, borderRadius: 8 }}>
            {String(this.state.error?.stack || this.state.error)}
          </pre>
          <button onClick={() => { this.setState({ error: null }); window.location.href = '/' }}>recarregar</button>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </GlobalErrorBoundary>
  </StrictMode>,
)
