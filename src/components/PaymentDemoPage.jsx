import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import HakafastLogo from './HakafastLogo.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import { formatIls } from '../data/pricing.js';
import { addonPrice } from '../data/modules.js';
import '../assets/SalesPages.css';
import '../assets/PaymentDemo.css';

const PACKAGES = [
  { id: 'single', heats: 1, price: 89, labelKey: 'pay_demo_pkg_single' },
  { id: 'triple', heats: 3, price: 229, labelKey: 'pay_demo_pkg_triple' },
  { id: 'party', heats: 5, price: 349, labelKey: 'pay_demo_pkg_party' },
];

export default function PaymentDemoPage() {
  const { t } = useLanguage();
  const [step, setStep] = useState(1);
  const [pkgId, setPkgId] = useState('triple');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [method, setMethod] = useState('card');
  const [done, setDone] = useState(false);

  const pkg = PACKAGES.find((p) => p.id === pkgId) || PACKAGES[1];
  const modulePrice = addonPrice('paymentKiosk');

  const receipt = useMemo(() => ({
    ref: `HF-DEMO-${Date.now().toString(36).toUpperCase()}`,
    pkg,
    name,
    phone,
    method,
  }), [done, pkg, name, phone, method]);

  const reset = () => {
    setStep(1);
    setDone(false);
    setName('');
    setPhone('');
    setMethod('card');
  };

  const submitPay = () => {
    setDone(true);
    setStep(4);
  };

  return (
    <div className="sales-page payment-demo-page">
      <header className="sales-nav">
        <HakafastLogo to="/" />
        <div className="sales-nav-end">
          <Link to="/modules/payment_kiosk">{t('mod_open_guide')}</Link>
          <Link to="/modules">{t('mod_catalog_title')}</Link>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="sales-main payment-demo-main">
        <div className="payment-demo-badge">{t('pay_demo_badge')}</div>
        <h1>{t('pay_demo_title')}</h1>
        <p className="sales-lead">{t('pay_demo_lead')}</p>
        <p className="sales-note">{t('pay_demo_module_price', { price: formatIls(modulePrice) })}</p>

        <div className="payment-demo-device">
          <div className="payment-demo-steps">
            {[1, 2, 3, 4].map((n) => (
              <span key={n} className={`payment-demo-step-dot${step >= n ? ' is-active' : ''}${step === n ? ' is-current' : ''}`}>
                {n}
              </span>
            ))}
          </div>

          {step === 1 && (
            <section className="payment-demo-panel">
              <h2>{t('pay_demo_step1_title')}</h2>
              <div className="payment-demo-packages">
                {PACKAGES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`payment-demo-pkg${pkgId === p.id ? ' is-selected' : ''}`}
                    onClick={() => setPkgId(p.id)}
                  >
                    <span className="payment-demo-pkg-name">{t(p.labelKey)}</span>
                    <span className="payment-demo-pkg-meta">{p.heats} {t('pay_demo_heats')}</span>
                    <span className="payment-demo-pkg-price">{formatIls(p.price)}</span>
                  </button>
                ))}
              </div>
              <button type="button" className="btn-primary payment-demo-next" onClick={() => setStep(2)}>
                {t('pay_demo_continue')}
              </button>
            </section>
          )}

          {step === 2 && (
            <section className="payment-demo-panel">
              <h2>{t('pay_demo_step2_title')}</h2>
              <label className="payment-demo-field">
                {t('form_name')}
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('pay_demo_name_ph')} />
              </label>
              <label className="payment-demo-field">
                {t('pay_demo_phone')}
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="050-0000000" dir="ltr" />
              </label>
              <div className="payment-demo-nav">
                <button type="button" className="btn-muted" onClick={() => setStep(1)}>{t('busy_day_back')}</button>
                <button type="button" className="btn-primary" disabled={!name.trim()} onClick={() => setStep(3)}>
                  {t('pay_demo_continue')}
                </button>
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="payment-demo-panel">
              <h2>{t('pay_demo_step3_title')}</h2>
              <p className="payment-demo-summary">
                {t(pkg.labelKey)} — <strong>{formatIls(pkg.price)}</strong>
              </p>
              <div className="payment-demo-methods">
                {['card', 'bit', 'cash'].map((m) => (
                  <label key={m} className={`payment-demo-method${method === m ? ' is-selected' : ''}`}>
                    <input type="radio" name="paymethod" checked={method === m} onChange={() => setMethod(m)} />
                    {t(`pay_demo_method_${m}`)}
                  </label>
                ))}
              </div>
              {method === 'card' && (
                <div className="payment-demo-card-mock" aria-hidden>
                  <span>•••• •••• •••• 4242</span>
                  <span>12/28</span>
                </div>
              )}
              <p className="payment-demo-disclaimer">{t('pay_demo_disclaimer')}</p>
              <div className="payment-demo-nav">
                <button type="button" className="btn-muted" onClick={() => setStep(2)}>{t('busy_day_back')}</button>
                <button type="button" className="btn-primary" onClick={submitPay}>{t('pay_demo_pay')}</button>
              </div>
            </section>
          )}

          {step === 4 && done && (
            <section className="payment-demo-panel payment-demo-success">
              <h2>{t('pay_demo_success_title')}</h2>
              <p>{t('pay_demo_success_body')}</p>
              <dl className="payment-demo-receipt">
                <dt>{t('pay_demo_receipt_ref')}</dt>
                <dd dir="ltr">{receipt.ref}</dd>
                <dt>{t('form_name')}</dt>
                <dd>{name}</dd>
                <dt>{t('pay_demo_package')}</dt>
                <dd>{t(pkg.labelKey)} — {formatIls(pkg.price)}</dd>
                <dt>{t('pay_demo_method')}</dt>
                <dd>{t(`pay_demo_method_${method}`)}</dd>
              </dl>
              <p className="payment-demo-queue">{t('pay_demo_queue_note')}</p>
              <button type="button" className="btn-primary" onClick={reset}>{t('pay_demo_again')}</button>
            </section>
          )}
        </div>

        <section className="sales-info-box">
          <h3>{t('pay_demo_real_title')}</h3>
          <p>{t('pay_demo_real_body')}</p>
        </section>
      </main>
    </div>
  );
}
