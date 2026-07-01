/** Build LAN-accessible URL for public heat results page. */
export function buildHeatResultsUrl(heatNumber, networkUrls = [], fallbackOrigin = '') {
  const n = Number(heatNumber);
  if (!n || Number.isNaN(n)) return '';
  const base = (Array.isArray(networkUrls) && networkUrls[0])
    || fallbackOrigin
    || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${String(base).replace(/\/$/, '')}/results/${n}`;
}

export function buildResultsListUrl(networkUrls = [], fallbackOrigin = '') {
  const base = (Array.isArray(networkUrls) && networkUrls[0])
    || fallbackOrigin
    || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${String(base).replace(/\/$/, '')}/results`;
}
