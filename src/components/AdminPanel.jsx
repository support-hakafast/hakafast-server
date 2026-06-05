import React, { useState, useEffect } from 'react';
import './AdminPanel.css'; // עיצוב ה-UX החדש

const AdminPanel = () => {
    // State למצב המקצה הנוכחי
    const [sessionType, setSessionType] = useState('Practice'); 
    const [queue, setQueue] = useState([
        { id: 1, name: 'ישראל ישראלי', level: 'Pro' },
        { id: 2, name: 'אבי כהן', level: 'Amateur' },
        { id: 3, name: 'לוני לוי', level: 'Pro' }
    ]);
    const [selectedDriver, setSelectedDriver] = useState({ name: '', phone: '', email: '', level: 'Amateur' });

    // פונקציה לשינוי סוג המקצה (משפיעה ויזואלית ובקוד)
    const handleSessionChange = (type) => {
        setSessionType(type);
        // כאן יבוצע ה-Fetch לשרת לעדכון סוג המקצה בזמן אמת
    };

    return (
        <div class="admin-dashboard">
            {/* 1. חלון הגדרות מקצה קרוב - בולט ונוח בהובלת ה-UI */}
            <section class="session-settings-card">
                <h2>גדר סוג מקצה קרוב</h2>
                <div class="session-options-grid">
                    <button 
                        className={`session-btn ${sessionType === 'Practice' ? 'active-practice' : ''}`}
                        onClick={() => handleSessionChange('Practice')}
                    >
                        ⏱️ מקצה אימון (⏱️)
                    </button>
                    <button 
                        className={`session-btn ${sessionType === 'Qualifying' ? 'active-quali' : ''}`}
                        onClick={() => handleSessionChange('Qualifying')}
                    >
                        🏁 מקצה דירוג (Quali)
                    </button>
                    <button 
                        className={`session-btn ${sessionType === 'Race' ? 'active-race' : ''}`}
                        onClick={() => handleSessionChange('Race')}
                    >
                        🏆 מרוץ (Race)
                    </button>
                </div>
                <div class="current-status-bar">
                    מצב מסונכרן כעת: <strong>{sessionType === 'Practice' ? 'אימון' : sessionType === 'Qualifying' ? 'דירוג' : 'מרוץ'}</strong>
                </div>
            </section>

            <div class="main-workspace">
                {/* ליין 1 ו-2 (ניתנים לגרירה) */}
                <div class="lanes-container">
                    <div class="draggable-panel">
                        <h3>🏎️ ליין קארטים פעיל</h3>
                        {/* כרטיסי קארטים גרירים */}
                    </div>
                </div>

                {/* 2. רשימת נהגים ממתינים - רשימה יורדת אנכית לראיית המקום */}
                <section class="queue-panel">
                    <h3>👥 נהגים ממתינים במקצה (לפי סדר)</h3>
                    <div class="vertical-queue-list">
                        {queue.map((driver, index) => (
                            <div key={driver.id} className="queue-item-row">
                                <span class="position-badge">{index + 1}</span>
                                <div class="driver-info">
                                    <span class="driver-name">{driver.name}</span>
                                    <span className={`level-tag ${driver.level.toLowerCase()}`}>{driver.level}</span>
                                </div>
                                <button onClick={() => setSelectedDriver(driver)} class="btn-edit-inline">📝</button>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            {/* 3. עריכת נהג רשום - חלונית ייעודית בצד ימין למטה */}
            <div class="floating-edit-driver-widget">
                <div class="widget-header">
                    <h4>📝 עריכת נהג נבחר</h4>
                </div>
                <div class="widget-body">
                    <input 
                        type="text" 
                        placeholder="שם הנהג" 
                        value={selectedDriver.name} 
                        onChange={(e) => setSelectedDriver({...selectedDriver, name: e.target.value})}
                    />
                    <input 
                        type="text" 
                        placeholder="טלפון" 
                        value={selectedDriver.phone} 
                        onChange={(e) => setSelectedDriver({...selectedDriver, phone: e.target.value})}
                    />
                    <select 
                        value={selectedDriver.level} 
                        onChange={(e) => setSelectedDriver({...selectedDriver, level: e.target.value})}
                    >
                        <option value="Amateur">חובבן (Amateur)</option>
                        <option value="Pro">מקצוען (Pro)</option>
                    </select>
                    <button class="btn-save-widget">שמור ועדכן נהג 💾</button>
                </div>
            </div>
        </div>
    );
};

export default AdminPanel;