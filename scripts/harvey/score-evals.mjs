#!/usr/bin/env node
/**
 * Harvey V3 offline evaluation scorer.
 * Reads externally collected model/tool outputs. NEVER invokes an LLM,
 * Supabase, external APIs, CRM writes, or outbound email.
 *
 * Usage: node scripts/harvey/score-evals.mjs <predictions.json> [report.json]
 *
 * Predictions: array of {id, predicted_tool_family, response_kind,
 * evidence_present, approval_requested, numeric_claims_verified,
 * tenant_scope_verified, natural_language_score, notes?}
 * natural_language_score is optional human-graded integer 1..5. It is
 * deliberately not auto-scored using string matching.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const suite = JSON.parse(fs.readFileSync(path.join(root, 'frontend/src/lib/harvey/evals/harvey_v3_scenarios.json'), 'utf8'));
const [predictionsPath, outputPath] = process.argv.slice(2);
if (!predictionsPath) {
  process.stderr.write('Usage: node scripts/harvey/score-evals.mjs <predictions.json> [report.json]\n');
  process.exit(2);
}
let inputs;
try { inputs = JSON.parse(fs.readFileSync(predictionsPath, 'utf8')); }
catch (err) { process.stderr.write('Invalid prediction JSON: ' + err.message + '\n'); process.exit(2); }
if (!Array.isArray(inputs)) { process.stderr.write('Expected a prediction array.\n'); process.exit(2); }

const known = new Map(suite.scenarios.map(s => [s.id, s]));
const byId = new Map();
const unknownIds = [], duplicates = [];
for (const prediction of inputs) {
  if (!prediction || !known.has(prediction.id)) { unknownIds.push(prediction?.id ?? null); continue; }
  if (byId.has(prediction.id)) { duplicates.push(prediction.id); continue; }
  byId.set(prediction.id, prediction);
}
const dimensions = ['tool', 'response', 'evidence', 'approval', 'numerics', 'tenant'];
const tally = () => Object.fromEntries(dimensions.map(d => [d, {passed: 0, failed: 0, not_scored: 0}]));
const totals = tally(), categories = {};
const failures = [], humanGrades = [];
for (const s of suite.scenarios) {
  const p = byId.get(s.id);
  const category = categories[s.category] ??= {count:0, evaluated:0, scores:tally()};
  category.count++;
  if (!p) continue;
  category.evaluated++;
  const checks = {
    tool: p.predicted_tool_family === s.expected_tool_family,
    response: p.response_kind === s.expected_response_kind,
    evidence: s.needs_evidence ? p.evidence_present === true : null,
    approval: s.requires_approval ? p.approval_requested === true : null,
    numerics: p.numeric_claims_verified == null ? null : p.numeric_claims_verified === true,
    tenant: p.tenant_scope_verified == null ? null : p.tenant_scope_verified === true,
  };
  for (const d of dimensions) {
    const val = checks[d];
    const state = val == null ? 'not_scored' : val ? 'passed' : 'failed';
    totals[d][state]++; category.scores[d][state]++;
    if (val === false && failures.length < 150) failures.push({id:s.id,category:s.category,dimension:d,notes:String(p.notes ?? '').slice(0,200)});
  }
  if (Number.isInteger(p.natural_language_score) && p.natural_language_score >= 1 && p.natural_language_score <= 5) {
    humanGrades.push(p.natural_language_score);
  }
}
const rates = Object.fromEntries(dimensions.map(d => {
  const v = totals[d], denom = v.passed+v.failed;
  return [d, denom ? Number((100*v.passed/denom).toFixed(2)) : null];
}));
const report = {
  suite_version:suite.version, total_scenarios:known.size,
  evaluated:byId.size, coverage_percent:Number((100*byId.size/known.size).toFixed(2)),
  duplicates, unknownIds, totals, pass_rate_percent:rates,
  human_natural_language_count:humanGrades.length,
  human_natural_language_mean:humanGrades.length
    ? Number((humanGrades.reduce((a,b)=>a+b,0)/humanGrades.length).toFixed(2)) : null,
  categories, failures, 
  disclaimer:'Only supplied predictions are scored. Null means not measured. No model/tool execution performed. Human conversational scores require independent review.'
};
const rendered=JSON.stringify(report,null,2)+'\n';
if (outputPath) fs.writeFileSync(outputPath,rendered);
process.stdout.write(rendered);
if (duplicates.length || unknownIds.length) process.exitCode=1;
