// EO: DEF·CON(Network → Link, Tending,Binding) — shared webhook endpoint configuration
// Centralizes EO's companion webhook URLs so deploys can point the reader at their own n8n (or
// compatible) instance without editing feature code. Browser hosts may set either:
//   window.__EO_WEBHOOK_BASE__ = 'https://example.test/webhook'
//   localStorage.setItem('eo_webhook_base', 'https://example.test/webhook')
// Node/tests may pass explicit options or set EO_WEBHOOK_BASE.

export const DEFAULT_WEBHOOK_BASE = 'https://n8n.intelechia.com/webhook';
export const WEBHOOK_BASE_STORAGE_KEY = 'eo_webhook_base';

const trimSlash = (s) => String(s || '').trim().replace(/\/+$/, '');

export const normalizeWebhookBase = (base = DEFAULT_WEBHOOK_BASE) => {
  const s = trimSlash(base) || DEFAULT_WEBHOOK_BASE;
  return s.endsWith('/webhook') ? s : `${s}/webhook`;
};

export const configuredWebhookBase = (fallback = DEFAULT_WEBHOOK_BASE) => {
  const g = globalThis;
  const win = g && typeof g === 'object' ? g.window : null;
  const fromWindow = win?.__EO_WEBHOOK_BASE__ || g?.__EO_WEBHOOK_BASE__;
  if (fromWindow) return normalizeWebhookBase(fromWindow);
  try {
    const stored = win?.localStorage?.getItem?.(WEBHOOK_BASE_STORAGE_KEY) || g?.localStorage?.getItem?.(WEBHOOK_BASE_STORAGE_KEY);
    if (stored) return normalizeWebhookBase(stored);
  } catch { /* storage can be unavailable in private/browser test contexts */ }
  const fromEnv = g?.process?.env?.EO_WEBHOOK_BASE;
  return normalizeWebhookBase(fromEnv || fallback);
};

export const webhookUrl = (path = '', base = configuredWebhookBase()) => {
  const p = String(path || '').replace(/^\/+/, '');
  return p ? `${normalizeWebhookBase(base)}/${p}` : normalizeWebhookBase(base);
};
