import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// PWA service worker sam preuzima kontrolu nad stranicom (self.skipWaiting +
// clientsClaim su ukljuceni u generirani sw.js), ali vec ucitana stranica
// ostaje na starom JS bundleu dok se ne ucita ponovno — bez ovog listenera
// nove verzije aplikacije se ne vide dok korisnik potpuno ne zatvori i ponovo
// otvori PWA (obicno resume s home screena ne broji se kao ucitavanje).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
