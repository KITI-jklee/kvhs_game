import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateLocations, validateMedicalCosts, validateTermPairs } from './validation';

function readPublicJson(name: string): unknown {
  return JSON.parse(readFileSync(resolve(process.cwd(), 'public', 'data', name), 'utf8'));
}

describe('배포용 정적 게임 데이터', () => {
  it('병원 위치 JSON이 런타임 계약을 만족한다', () => {
    expect(validateLocations(readPublicJson('hospital_locations.json')).length).toBeGreaterThanOrEqual(5);
  });

  it('의료비 JSON이 런타임 계약을 만족한다', () => {
    expect(validateMedicalCosts(readPublicJson('medical_costs.json')).length).toBeGreaterThanOrEqual(12);
  });

  it('용어 짝 JSON이 런타임 계약을 만족한다', () => {
    expect(validateTermPairs(readPublicJson('medical_term_pairs.json')).length).toBeGreaterThanOrEqual(24);
  });
});
