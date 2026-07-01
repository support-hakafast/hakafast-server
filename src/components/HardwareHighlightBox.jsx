import React from 'react';
import { Link } from 'react-router-dom';

export default function HardwareHighlightBox({ t }) {
  return (
    <section className="sales-info-box sales-info-primary hardware-highlight-box">
      <h3>{t('quote_hardware_highlight_title')}</h3>
      <p>{t('quote_hardware_highlight_body')}</p>
      <ul className="sales-bullet-list">
        <li>
          <Link to="/modules/decoder_tranx">{t('mod_decoder_name')}</Link>
          {' — '}
          {t('quote_hardware_included')}
        </li>
        <li>
          <Link to="/modules/hardware_supply">{t('mod_hardware_supply_name')}</Link>
          {' — '}
          {t('mod_label_partner')}
        </li>
      </ul>
    </section>
  );
}
