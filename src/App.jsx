import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import HomePage from './components/HomePage.jsx'
import AdminPanel from './components/AdminPanel.jsx'
import LiveTiming from './components/LiveTiming.jsx'

function App() {
  return (
    <Router>
      <Routes>
        {/* עמוד הבית הסטנדרטי (מבוסס על index.html המקורי שלך) */}
        <Route path="/" element={<HomePage />} />
        
        {/* פאנל הניהול המשופר עם רשימת המתנה יורדת ווידג'ט עריכת נהג */}
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/admin.html" element={<AdminPanel />} />
        
        {/* לוח הזמנים החי (מבוסס על live-timing.html המקורי שלך) */}
        <Route path="/live-timing" element={<LiveTiming />} />
        <Route path="/live-timing/:track" element={<LiveTiming />} />
      </Routes>
    </Router>
  )
}

export default App