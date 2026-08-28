import { createClient } from '@sanity/client';

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || 'w0whm6ow';
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production';
const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION || '2024-10-15';
const token = process.env.SANITY_API_WRITE_TOKEN;

if (!token) {
  console.log('[typhon-prepare] SANITY_API_WRITE_TOKEN not present; skipping one-time publish.');
} else {
  const client = createClient({ projectId, dataset, apiVersion, token, useCdn: false });

  await client.createIfNotExists({
    _id: 'author-mira-chen',
    _type: 'author',
    name: 'Mira Chen',
    slug: { _type: 'slug', current: 'mira-chen' },
    role: 'Head of Trade Intelligence · LIT',
    isAiAgent: false,
    expertise: ['Trade intelligence', 'Supply chain risk', 'Ocean freight'],
  });

  await client.createIfNotExists({
    _id: 'category-trade-intelligence',
    _type: 'category',
    title: 'Trade Intelligence',
    slug: { _type: 'slug', current: 'trade-intelligence' },
    color: '#06b6d4',
  });

  await client.createIfNotExists({
    _id: 'category-market-signals',
    _type: 'category',
    title: 'Market Signals',
    slug: { _type: 'slug', current: 'market-signals' },
    color: '#10b981',
  });

  await import('./publish-typhon-china-supply-chain-2026.mjs');
}
