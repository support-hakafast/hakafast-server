import React from 'react';
import { Link } from 'react-router-dom';
import '../assets/HomePage.css';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';

const HomePage = () => {
  const { t } = useLanguage();

  return (
    <div className="home">
      <header className="home-nav">
        <Link to="/" className="home-logo">
          <span className="home-logo-mark">🏁</span>
          <span>{t('title')}</span>
        </Link>
        <div className="home-nav-end">
          <nav className="home-nav-links">
            <a href="#features">{t('nav_features')}</a>
            <a href="#live-tracks">{t('nav_live')}</a>
            <a href="#contact">{t('nav_contact')}</a>
            <Link to="/admin">{t('nav_admin')}</Link>
          </nav>
          <LanguageSwitcher />
        </div>
      </header>

      <section className="home-hero">
        <span className="home-hero-badge">{t('hero_badge')}</span>
        <h1>{t('hero_title')}</h1>
        <p>{t('hero_desc')}</p>
        <div className="home-cta-row">
          <Link to="/admin" className="home-btn home-btn-primary">{t('cta_admin')}</Link>
          <a href="#live-tracks" className="home-btn home-btn-ghost">{t('cta_live')}</a>
        </div>
      </section>

      <section className="home-section" id="features">
        <h2>{t('features_title')}</h2>
        <p className="home-section-lead">{t('features_lead')}</p>
        <div className="home-features">
          <article className="home-feature">
            <div>⏱️</div>
            <h3>{t('feature_pit_title')}</h3>
            <p>{t('feature_pit_desc')}</p>
          </article>
          <article className="home-feature">
            <div>📊</div>
            <h3>{t('feature_live_title')}</h3>
            <p>{t('feature_live_desc')}</p>
          </article>
          <article className="home-feature">
            <div>🌐</div>
            <h3>{t('feature_lang_title')}</h3>
            <p>{t('feature_lang_desc')}</p>
          </article>
        </div>
      </section>

      <section className="home-tracks" id="live-tracks">
        <div className="home-tracks-inner">
          <h2>{t('tracks_title')}</h2>
          <p className="home-section-lead">{t('tracks_lead')}</p>

          <div className="home-track-card">
            <strong>{t('track_haifa')}</strong>
            <Link to="/live-timing" className="home-btn home-btn-primary" style={{ padding: '0.65rem 1.1rem', fontSize: '0.9rem' }}>
              {t('btn_live')}
            </Link>
          </div>
          <div className="home-track-card alt">
            <strong>{t('track_demo')}</strong>
            <Link to="/live-timing/kart-demo" className="home-btn home-btn-primary" style={{ padding: '0.65rem 1.1rem', fontSize: '0.9rem' }}>
              {t('btn_demo')}
            </Link>
          </div>
        </div>
      </section>

      <section className="home-section home-contact" id="contact">
        <h2>{t('contact_title')}</h2>
        <p className="home-section-lead">{t('contact_lead')}</p>
        <form className="home-form" action="mailto:yanih@gmail.com" method="post" encType="text/plain">
          <label htmlFor="track-name">{t('form_track')}</label>
          <input id="track-name" type="text" name="Track_Name" required />

          <label htmlFor="contact-details">{t('form_contact')}</label>
          <input id="contact-details" type="text" name="Contact_Details" required />

          <label htmlFor="message">{t('form_message')}</label>
          <textarea id="message" name="Message" rows={4} required />

          <button type="submit">{t('form_submit')}</button>
        </form>
      </section>

      <footer className="home-footer">
        © {new Date().getFullYear()} {t('title')} — {t('footer')}
      </footer>
    </div>
  );
};

export default HomePage;
