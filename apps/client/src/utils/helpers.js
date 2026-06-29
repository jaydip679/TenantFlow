/**
 * Utility helpers for the TenantFlow frontend.
 */

/**
 * Format paise (integer) to Indian rupee string.
 * @param {number} paise
 * @returns {string} e.g. "₹1,23,456"
 */
export const formatCurrency = (paise) => {
  if (paise == null || isNaN(paise)) return '₹0';
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style:    'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(rupees);
};

/**
 * Format ISO date string to readable format.
 * @param {string|Date} date
 * @returns {string} e.g. "12 Jan 2024"
 */
export const formatDate = (date) => {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-IN', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
  });
};

/**
 * Format ISO date + time.
 * @param {string|Date} date
 * @returns {string} e.g. "12 Jan 2024, 14:30"
 */
export const formatDateTime = (date) => {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-IN', {
    day:    '2-digit',
    month:  'short',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  });
};

/**
 * Time ago string for notification timestamps.
 * @param {string|Date} date
 * @returns {string} e.g. "2 hours ago"
 */
export const timeAgo = (date) => {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  const intervals = [
    [31536000, 'year'],
    [2592000,  'month'],
    [86400,    'day'],
    [3600,     'hour'],
    [60,       'minute'],
    [1,        'second'],
  ];
  for (const [secs, label] of intervals) {
    const count = Math.floor(seconds / secs);
    if (count >= 1) return `${count} ${label}${count > 1 ? 's' : ''} ago`;
  }
  return 'just now';
};

/**
 * Seat utilization percentage.
 * @param {number} used
 * @param {number} total
 * @returns {number} 0-100
 */
export const seatUtilizationPct = (used, total) => {
  if (!total) return 0;
  return Math.min(100, Math.round((used / total) * 100));
};

/**
 * Get churn risk color for display.
 * @param {number} score
 * @returns {string} CSS color
 */
export const churnRiskColor = (score) => {
  if (score > 75) return '#ef4444';
  if (score > 40) return '#f59e0b';
  return '#10b981';
};

/**
 * Days until a given date.
 * @param {string|Date} date
 * @returns {number}
 */
export const daysUntil = (date) => {
  if (!date) return 0;
  return Math.max(0, Math.ceil((new Date(date) - new Date()) / 86400000));
};

/**
 * Load an external script dynamically.
 * @param {string} src
 * @returns {Promise<void>}
 */
export const loadScript = (src) => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
};
