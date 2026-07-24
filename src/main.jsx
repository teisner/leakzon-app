import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// Apply theme before React mounts to prevent flash
try {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  if (savedTheme === 'dark') document.documentElement.classList.add('dark');
} catch {}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)