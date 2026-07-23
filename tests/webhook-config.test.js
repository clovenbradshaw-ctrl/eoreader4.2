import test from 'node:test';
import assert from 'node:assert/strict';

import { configuredWebhookBase, normalizeWebhookBase, webhookUrl } from '../src/organs/ingest/webhook-config.js';

test('normalizeWebhookBase accepts host roots and webhook roots', () => {
  assert.equal(normalizeWebhookBase('https://example.test'), 'https://example.test/webhook');
  assert.equal(normalizeWebhookBase('https://example.test/webhook/'), 'https://example.test/webhook');
});

test('webhookUrl builds sibling webhook URLs from an explicit base', () => {
  assert.equal(webhookUrl('feed', 'https://hooks.example/webhook'), 'https://hooks.example/webhook/feed');
  assert.equal(webhookUrl('/archiveo', 'https://hooks.example'), 'https://hooks.example/webhook/archiveo');
});

test('configuredWebhookBase reads EO_WEBHOOK_BASE when present', () => {
  const prev = process.env.EO_WEBHOOK_BASE;
  process.env.EO_WEBHOOK_BASE = 'https://env.example/hooks';
  try {
    assert.equal(configuredWebhookBase(), 'https://env.example/hooks/webhook');
  } finally {
    if (prev === undefined) delete process.env.EO_WEBHOOK_BASE;
    else process.env.EO_WEBHOOK_BASE = prev;
  }
});
