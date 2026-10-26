import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const scorer = resolve(dirname(fileURLToPath(import.meta.url)), 'score-evals.mjs');
test('scores observed output without inventing missing evaluation results', () => {
  const dir=mkdtempSync(join(tmpdir(),'harvey-eval-'));
  try {
    const input=join(dir,'predictions.json'), output=join(dir,'report.json');
    writeFileSync(input,JSON.stringify([{id:'HV3-0001',predicted_tool_family:'company_search',
      response_kind:'source_qualified',evidence_present:true,approval_requested:false,
      numeric_claims_verified:true,tenant_scope_verified:true,natural_language_score:4}]));
    const proc=spawnSync(process.execPath,[scorer,input,output],{encoding:'utf8'});
    assert.equal(proc.status,0,proc.stderr);
    const r=JSON.parse(readFileSync(output,'utf8'));
    assert.equal(r.total_scenarios,1000);
    assert.equal(r.evaluated,1);
    assert.equal(r.coverage_percent,0.1);
    assert.equal(r.pass_rate_percent.tool,100);
    assert.equal(r.totals.approval.not_scored,1);
    assert.equal(r.human_natural_language_mean,4);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('rejects duplicated fixture IDs',()=>{
 const dir=mkdtempSync(join(tmpdir(),'harvey-eval-'));
 try{
  const input=join(dir,'dupe.json');
  writeFileSync(input,JSON.stringify([{id:'HV3-0001'},{id:'HV3-0001'}]));
  const proc=spawnSync(process.execPath,[scorer,input],{encoding:'utf8'});
  assert.equal(proc.status,1);
  assert.equal(JSON.parse(proc.stdout).duplicates.length,1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
