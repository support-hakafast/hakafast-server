import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import '../assets/HomePage.css';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import HakafastLogo from './HakafastLogo.jsx';

const SUPPORT_EMAIL = 'support.hakafast@gmail.com';
const CONTACT_TIMEOUT_MS = 12000;

const HomePage = () => {
  const { t } = useLanguage();
  const [contactStatus, setContactStatus] = useState('idle');

  const handleContactSubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const trackName = form.trackName.value.trim();
    const contactName = form.contactName.value.trim();
    const email = form.email.value.trim();
    const phone = form.phone.value.trim();
    const message = form.message.value.trim();

    if (!trackName || !contactName || !email || !message) return;

    setContactStatus('sending');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONTACT_TIMEOUT_MS);

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackName, contactName, email, phone, message }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (res.ok && data.success) {
        setContactStatus('success');
        form.reset();
        return;
      }

      if (data.error === 'invalid_email') {
        setContactStatus('invalid_email');
        return;
      }

      setContactStatus('error');
    } catch {
      clearTimeout(timeoutId);
      setContactStatus('error');
    }
  };

  return (
    <div className="home">
      <header className="home-nav">
        <HakafastLogo to="/" className="home-nav-logo" />
        <div className="home-nav-end">
          <nav className="home-nav-links">
            <a href="#features">{t('nav_features')}</a>
            <a href="#live-tracks">{t('nav_live')}</a>
            <a href="#about">{t('nav_about')}</a>
            <a href="#contact">{t('nav_contact')}</a>
          </nav>
          <LanguageSwitcher />
        </div>
      </header>

      <section className="home-hero">
        <span className="home-hero-badge">{t('hero_badge')}</span>
        <h1>{t('hero_title')}</h1>
        <p>{t('hero_desc')}</p>
        <div className="home-cta-row">
          <Link to="/admin/kart-demo" className="home-btn home-btn-primary">{t('cta_admin')}</Link>
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

      <section className="home-section home-about" id="about">
        <h2>{t('about_title')}</h2>
        <p className="home-section-lead">{t('about_lead')}</p>
        <div className="home-about-content">
          <p>{t('about_body')}</p>
          <ul className="home-about-list">
            <li>{t('about_point_1')}</li>
            <li>{t('about_point_2')}</li>
            <li>{t('about_point_3')}</li>
            <li>{t('about_point_4')}</li>
          </ul>
          <p className="home-about-support">
            {t('about_support')}{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </p>
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
            <div>
              <strong>{t('track_demo')}</strong>
              <p className="home-demo-hint">{t('demo_workspace_hint')}</p>
            </div>
            <Link to="/live-timing/kart-demo" className="home-btn home-btn-primary" style={{ padding: '0.65rem 1.1rem', fontSize: '0.9rem' }}>
              {t('btn_demo')}
            </Link>
          </div>
        </div>
      </section>

      <section className="home-section home-contact" id="contact">
        <h2>{t('contact_title')}</h2>
        <p className="home-section-lead">{t('contact_lead')}</p>
        <form className="home-form" onSubmit={handleContactSubmit} noValidate>
          <label htmlFor="track-name">{t('form_track')}</label>
          <input id="track-name" name="trackName" type="text" required autoComplete="organization" />

          <label htmlFor="contact-name">{t('form_name')}</label>
          <input id="contact-name" name="contactName" type="text" required autoComplete="name" />

          <label htmlFor="contact-email">{t('form_email')}</label>
          <input id="contact-email" name="email" type="email" required autoComplete="email" />

          <label htmlFor="contact-phone">{t('form_phone')}</label>
          <input id="contact-phone" name="phone" type="tel" autoComplete="tel" />

          <label htmlFor="message">{t('form_message')}</label>
          <textarea id="message" name="message" rows={4} required />

          <button type="submit" disabled={contactStatus === 'sending'}>
            {contactStatus === 'sending' ? t('form_sending') : t('form_submit')}
          </button>

          {contactStatus === 'success' && (
            <p className="home-form-status home-form-status-success" role="status">
              {t('form_success')}
            </p>
          )}
          {contactStatus === 'invalid_email' && (
            <p className="home-form-status home-form-status-error" role="alert">
              {t('form_invalid_email')}
            </p>
          )}
          {contactStatus === 'error' && (
            <p className="home-form-status home-form-status-error" role="alert">
              {t('form_error')}
            </p>
          )}
        </form>
      </section>

      <footer className="home-footer">
        © {new Date().getFullYear()} {t('title')} — {t('footer')}
      </footer>
    </div>
  );
};

export default HomePage;
