import { describe, expect, it } from 'vitest';
import suite from './harvey_v3_scenarios.json';

const expected = {
  company_discovery: 200,
  shipment_analytics: 200,
  forwarder_history: 150,
  opportunity_reasoning: 150,
  crm_and_enrichment: 100,
  outreach: 100,
  conversation_memory: 100,
};

describe('Harvey V3 evaluation fixture integrity', () => {
  it('contains 1,000 distinct natural-language scenarios', () => {
    expect(suite.scenario_count).toBe(1000);
    expect(suite.scenarios).toHaveLength(1000);
    expect(new Set(suite.scenarios.map((s) => s.id)).size).toBe(1000);
    expect(new Set(suite.scenarios.map((s) => s.question.trim().toLowerCase())).size).toBe(1000);
  });
  it('covers all agreed domain categories', () => {
    const actual = suite.scenarios.reduce((acc, scenario) => {
      acc[scenario.category] = (acc[scenario.category] || 0) + 1;
      return acc;
    }, {});
    expect(actual).toEqual(expected);
  });
  it('requires approval for messages and calendar/campaign side effects', () => {
    for (const s of suite.scenarios) {
      if (s.category === 'outreach' && /^(Send|Schedule|Create)/i.test(s.question)) {
        expect(s.requires_approval).toBe(true);
      }
    }
  });
  it('rejects claims of verified air data without a validated source', () => {
    for (const s of suite.scenarios) {
      if (s.category === 'shipment_analytics' && /air shipments/i.test(s.question)) {
        expect(s.expected_response_kind).toBe('unsupported_without_verified_air_source');
      }
    }
  });
});
