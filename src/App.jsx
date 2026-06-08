import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { LanguageProvider } from './i18n/LanguageContext.jsx'
import { DialogProvider } from './i18n/DialogContext.jsx'
import HomePage from './components/HomePage.jsx'
import AdminPanel from './components/AdminPanel.jsx'
import LiveTiming from './components/LiveTiming.jsx'

function App() {
  return (
    <LanguageProvider>
      <DialogProvider>
      <Router>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="/admin/:trackName" element={<AdminPanel />} />
          <Route path="/admin.html" element={<AdminPanel />} />
          <Route path="/live-timing" element={<LiveTiming />} />
          <Route path="/live-timing/:track" element={<LiveTiming />} />
        </Routes>
      </Router>
      </DialogProvider>
    </LanguageProvider>
  )
}

export default App
