import React from 'react';
import { Link } from 'react-router-dom';

export default function BookingDecisionBox({ t }) {
  return (
    <section className="sales-info-box booking-decision-box">
      <h3>{t('quote_booking_decision_title')}</h3>
      <ul className="sales-bullet-list booking-decision-list">
        <li>{t('quote_booking_decision_new')}</li>
        <li>
          {t('quote_booking_decision_payment')}{' '}
          <Link to="/demo/payment">{t('mod_payment_demo_cta')}</Link>
        </li>
        <li>{t('quote_booking_decision_legacy')}</li>
      </ul>
    </section>
  );
}
