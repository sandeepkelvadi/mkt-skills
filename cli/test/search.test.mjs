import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSearchResults } from '../lib/commands.mjs';

test('renders ranked matches with install commands and matched terms', () => {
  const out = renderSearchResults({
    query: 'cold email',
    results: [
      {
        slug: 'cold-email',
        title: 'Cold Email',
        description: 'Write cold outreach sequences.',
        categories: ['Email'],
        price: 'free',
        score: 2.1,
        matched: ['cold', 'email'],
      },
    ],
  });
  assert.match(out, /cold-email/);
  assert.match(out, /npx mkt-skills install cold-email/);
  assert.match(out, /matched: cold, email/);
});

test('flags premium skills', () => {
  const out = renderSearchResults({
    query: 'suite',
    results: [
      { slug: 'pro-skill', title: 'Pro', description: 'x', categories: [], price: 'paid', score: 1, matched: ['suite'] },
    ],
  });
  assert.match(out, /premium/);
});

test('omits matched line and tolerates missing categories', () => {
  const out = renderSearchResults({
    query: 'x',
    results: [
      { slug: 'no-meta', title: 'No Meta', description: 'desc', price: 'free', score: 1, matched: [] },
    ],
  });
  assert.doesNotMatch(out, /matched:/);
  assert.match(out, /no-meta/);
});

test('handles no results with a browse hint', () => {
  const out = renderSearchResults({ query: 'zzz', results: [] });
  assert.match(out, /No close matches/);
  assert.match(out, /npx mkt-skills list/);
});
