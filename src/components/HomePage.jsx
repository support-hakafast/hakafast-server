import React from 'react';

const HomePage = () => {
  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: "#ffffff", color: "#1a202c", direction: "rtl" }}>
      
      {/* HEADER */}
      <header style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '0 40px', background: '#ffffff', borderBottom: '1px solid #e2e8f0', height: '80px', position: 'relative' }}>
        <a href="#" className="logo-zone" style={{ display: 'flex', alignItems: 'center', height: '100%', padding: '12px 0' }}>
          <img src="/public/assets/logo.png" alt="HAKAFAST Logo" style={{ height: '100%', width: 'auto', display: 'block' }} />
        </a>
      </header>

      {/* HERO SECTION */}
      <section style={{ textAlign: "center", padding: "90px 20px", background: "linear-gradient(135deg, #000080 0%, #800080 100%)", color: "#ffffff" }}>
        <h1 style={{ fontSize: "3.5em", fontWeight: "900", marginBottom: "20px", marginTop: "0" }}>HAKAFAST</h1>
        <p style={{ fontSize: "1.6em", opacity: "0.9", maxWidth: "800px", margin: "0 auto 40px auto", fontWeight: "500" }}>
          מערכת ניהול מרוצים ותזמון זמנים (Live Timing) מתקדמת בזמן אמת למסלולי קארטינג.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: "20px", flexWrap: "wrap" }}>
          <a href="/admin" style={{ background: "#40E0D0", color: "#000080", padding: "16px 36px", borderRadius: "30px", fontSize: "1.2em", fontWeight: "bold", textDecoration: "none", transition: "0.2s" }}>
            ניהול מסלול (Admin Panel) 🛠️
          </a>
          <a href="#live-tracks" style={{ background: "transparent", color: "#ffffff", padding: "16px 36px", borderRadius: "30px", fontSize: "1.2em", fontWeight: "bold", textDecoration: "none", border: "2px solid #ffffff", transition: "0.2s" }}>
            צפייה במסכים פעילים 💻
          </a>
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section style={{ padding: "80px 40px", maxWidth: "1200px", margin: "0 auto" }} id="features">
        <h2 style={{ textAlign: "center", fontSize: "2.5em", color: "#000080", marginBottom: "50px" }}>למה לבחור ב-HAKAFAST?</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "30px" }}>
          
          <div style={{ padding: "30px", borderRadius: "16px", background: "#f8fafc", borderRight: "5px solid #40E0D0" }}>
            <div style={{ fontSize: "2.5em", marginBottom: "15px" }}>⏱️</div>
            <h3 style={{ fontSize: "1.4em", color: "#000080", margin: "0 0 10px 0" }}>סנכרון פיטס חכם</h3>
            <p style={{ margin: "0", color: "#4a5568", lineHeight: "1.6" }}>שיבוץ נהגים אוטומטי לקארטים פנויים בליין בהתאם לסדר ההמתנה ובקרת עומס בפיטס.</p>
          </div>

          <div style={{ padding: "30px", borderRadius: "16px", background: "#f8fafc", borderRight: "5px solid #800080" }}>
            <div style={{ fontSize: "2.5em", marginBottom: "15px" }}>📊</div>
            <h3 style={{ fontSize: "1.4em", color: "#000080", margin: "0 0 10px 0" }}>לוח זמנים חי (Live)</h3>
            <p style={{ margin: "0", color: "#4a5568", lineHeight: "1.6" }}>טבלאות זמנים מתעדכנות דינמית כל 2 שניות במסכי המסלול, כולל חיווי הקפה מהירה (Best Lap).</p>
          </div>

          <div style={{ padding: "30px", borderRadius: "16px", background: "#f8fafc", borderRight: "5px solid #000080" }}>
            <div style={{ fontSize: "2.5em", marginBottom: "15px" }}>🌐</div>
            <h3 style={{ fontSize: "1.4em", color: "#000080", margin: "0 0 10px 0" }}>רב-לשוני מובנה</h3>
            <p style={{ margin: "0", color: "#4a5568", lineHeight: "1.6" }}>תמיכה מלאה במעבר מהיר בין עברית לאנגלית עבור נהגים מקומיים ובין-לאומיים.</p>
          </div>

        </div>
      </section>

      {/* LIVE TRACKS */}
      <section style={{ padding: "60px 40px", background: "#f1f5f9", textAlign: "center" }} id="live-tracks">
        <h2 style={{ fontSize: "2.2em", color: "#000080", marginBottom: "10px" }}>מסלולים פעילים כעת</h2>
        <p style={{ color: "#4a5568", marginBottom: "40px", fontSize: "1.1em" }}>בחר מסלול כדי לצפות בלוח הזמנים ובתוצאות המקצה בזמן אמת</p>
        <div style={{ display: "flex", justifyContent: "center", gap: "25px", flexWrap: "wrap", maxWidth: "800px", margin: "0 auto" }}>
          
          <div style={{ background: "#ffffff", padding: "24px 40px", borderRadius: "12px", boxShadow: "0 4px 15px rgba(0,0,0,0.05)", borderRight: "6px solid #000080", display: "flex", alignItems: "center", gap: "20px" }}>
            <span style={{ fontWeight: "bold", fontSize: "1.2em" }}>Dan Karting Haifa</span>
            <a href="/live-timing" style={{ background: "#000080", color: "#ffffff", padding: "10px 20px", borderRadius: "8px", textDecoration: "none", fontWeight: "bold", fontSize: "0.95em" }}>צפה בלוח זמנים 💻</a>
          </div>

          <div style={{ background: "#ffffff", padding: "24px 40px", borderRadius: "12px", boxShadow: "0 4px 15px rgba(0,0,0,0.05)", borderRight: "6px solid #40E0D0", display: "flex", alignItems: "center", gap: "20px" }}>
            <span style={{ fontWeight: "bold", fontSize: "1.2em" }}>Kart Demo Track</span>
            <a href="/live-timing/kart-demo" style={{ background: "#40E0D0", color: "#000080", padding: "10px 20px", borderRadius: "8px", textDecoration: "none", fontWeight: "bold", fontSize: "0.95em" }}>סביבת בדיקה פעילה 🏎️</a>
          </div>

        </div>
      </section>

      {/* CONTACT FORM */}
      <section style={{ padding: "80px 20px", maxWidth: "600px", margin: "0 auto", textAlign: "center" }} id="contact">
        <h2 style={{ fontSize: "2.3em", color: "#000080", marginBottom: "10px" }}>הצטרף למהפכת התזמון</h2>
        <p style={{ color: "#4a5568", marginBottom: "35px" }}>השאר פרטים ונחזור אליך עם הצעה מותאמת אישית למסלול שלך.</p>
        
        <form action="mailto:yanih@gmail.com" method="post" encType="text/plain" style={{ display: "flex", flexDirection: "column", gap: "15px", textAlign: "right" }}>
          <label style={{ fontWeight: "bold", color: "#000080" }}>שם המסלול / חברה:</label>
          <input type="text" name="Track_Name" required style={{ padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "1em", width: "100%", boxSizing: "border-box" }} />
          
          <label style={{ fontWeight: "bold", color: "#000080" }}>איש קשר וטלפון:</label>
          <input type="text" name="Contact_Details" required style={{ padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "1em", width: "100%", boxSizing: "border-box" }} />
          
          <label style={{ fontWeight: "bold", color: "#000080" }}>הודעה / כמות קארטים במסלול:</label>
          <textarea name="Message" rows="4" required style={{ padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "1em", fontFamily: "inherit", width: "100%", boxSizing: "border-box" }}></textarea>
          
          <button type="submit" style={{ width: "100%", padding: "14px", background: "#000080", color: "#ffffff", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "1.1em", cursor: "pointer", marginTop: "10px" }}>
            שלח פנייה למערכת 🚀
          </button>
        </form>
      </section>

    </div>
  );
};

export default HomePage;