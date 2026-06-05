import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const LiveTiming = () => {
  const { track } = useParams(); // תומך בנתיבי מסלול שונים דינמית
  const [lang, setLang] = useState('he');
  const [rowsData, setRowsData] = useState([]);
  const [sessionType, setSessionType] = useState('Practice');

  // מילון התרגומים המקורי שלך מתוך קובץ ה-HTML
  const words = {
    he: { title: "לוח זמנים חי - דן קארטינג", pos: "מיקום", kart: "קארט", driver: "נהג", last_lap: "הקפה אחרונה", best_lap: "הקפה מהירה", laps: "הקפות" },
    en: { title: "Live Timing - Dan Karting", pos: "POS", kart: "KART", driver: "DRIVER", last_lap: "LAST LAP", best_lap: "BEST LAP", laps: "LAPS" }
  };

  const t = words[lang];

  // פונקציית משיכת הנתונים הדינמית מהשרת (בדיוק כמו ה-fetch המקורי שלך)
  const updateTable = async () => {
    try {
      const res = await fetch('/live-timing-data');
      const data = await res.json();
      
      // מיון לפי ההקפה הטובה ביותר
      const sorted = data.sort((a, b) => {
        if (!a.best_lap_time) return 1;
        if (!b.best_lap_time) return -1;
        return a.best_lap_time.localeCompare(b.best_lap_time);
      });
      
      setRowsData(sorted);
    } catch (err) {
      console.error("Error fetching live timing:", err);
    }
  };

  // תזמון ה-Interval (כל 2 שניות) בתוך Lifecycle של React
  useEffect(() => {
    updateTable(); // קריאה ראשונית מיידית
    const interval = setInterval(updateTable, 2000);
    return () => clearInterval(interval); // ניקוי ה-Interval כשהקומפוננטה נסגרת
  }, []);

  return (
    <div style={{ 
      fontFamily: "system-ui, sans-serif", 
      padding: "30px", 
      background: "#f4f6f9", 
      minHeight: "100vh", 
      direction: lang === 'he' ? 'rtl' : 'ltr',
      textAlign: 'center'
    }}>
      <h1 style={{ fontSize: "2.8em", fontWeight: "800", marginBottom: "5px", color: "#000080" }} id="mainTitle">
        {t.title}
      </h1>
      <div style={{ fontSize: "1.5em", color: "#40E0D0", fontWeight: "bold", marginBottom: "25px", textTransform: "uppercase" }}>
        {sessionType === 'Practice' ? '⏱️ PRACTICE SESSION' : '🏁 RACE'}
      </div>

      {/* כפתורי שינוי השפה המקוריים */}
      <div style={{ marginBottom: "30px" }}>
        <button onClick={() => setLang('he')} style={{ backgroundColor: "#000080", color: "white", border: "none", padding: "10px 24px", cursor: "pointer", fontWeight: "bold", margin: "0 5px", borderRadius: "6px" }}>עברית</button>
        <button onClick={() => setLang('en')} style={{ backgroundColor: "#000080", color: "white", border: "none", padding: "10px 24px", cursor: "pointer", fontWeight: "bold", margin: "0 5px", borderRadius: "6px" }}>English</button>
      </div>

      {/* טבלת הנתונים הגדולה והברורה למסכים */}
      <div style={{ background: "#ffffff", borderRadius: "12px", boxShadow: "0 10px 30px rgba(0,0,0,0.05)", overflow: "hidden", maxWidth: "1400px", margin: "0 auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "1.8em" }}>
          <thead>
            <tr style={{ backgroundColor: "#000080", color: "#FFFFFF" }}>
              <th style={{ padding: "20px" }} id="thPos">{t.pos}</th>
              <th style={{ padding: "20px" }} id="thKart">{t.kart}</th>
              <th style={{ padding: "20px", textAlign: "start", paddingWithStart: "40px" }} id="thDriver">{t.driver}</th>
              <th style={{ padding: "20px" }} id="thLast">{t.last_lap}</th>
              <th style={{ padding: "20px" }} id="thBest">{t.best_lap}</th>
              <th style={{ padding: "20px" }}>{t.laps}</th>
            </tr>
          </thead>
          <tbody>
            {rowsData.map((row, index) => {
              // בדיקה האם זו ההקפה המהירה ביותר במקצה כולו לצורך סימון זהב/מדליה
              const isOverallBest = index === 0 && row.best_lap_time;
              
              return (
                <tr key={index} style={{ backgroundColor: index % 2 === 1 ? "#f8fafc" : "#ffffff" }}>
                  <td style={{ padding: "20px", fontWeight: "bold" }}>{index + 1}</td>
                  <td style={{ padding: "20px" }}>
                    <span style={{ background: "#000080", color: "white", padding: "4px 12px", borderRadius: "6px", fontWeight: "900" }}>
                      {row.kart_number}
                    </span>
                  </td>
                  <td style={{ padding: "20px", textAlign: "start", paddingInlineStart: "40px" }}>
                    {isOverallBest && <span style={{ marginLeft: "10px" }}>👑</span>}
                    {row.driver_name}
                  </td>
                  <td style={{ padding: "20px" }}>{row.last_lap_time || '--.---'}</td>
                  <td style={{ 
                    padding: "20px", 
                    color: isOverallBest ? "#d97706" : "inherit",
                    fontWeight: isOverallBest ? "900" : "bold"
                  }}>
                    {row.best_lap_time || '--.---'}
                  </td>
                  <td style={{ padding: "20px", color: "#800080" }}>{row.total_laps || 0}</td>
                </tr>
              );
            })}
            {rowsData.length === 0 && (
              <tr>
                <td colSpan="6" style={{ padding: "40px", color: "#64748b", fontSize: "0.8em" }}>
                  מחכה לנתוני המקצה מהחיישנים... 🏎️
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LiveTiming;