import type { HospitalLocation, MedicalCostItem, MedicalTermPair } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasUniqueIds(rows: Array<{ id: string }>): boolean {
  return new Set(rows.map((row) => row.id)).size === rows.length;
}

export function validateLocations(value: unknown): HospitalLocation[] {
  if (!Array.isArray(value)) throw new Error('hospital_locations must be an array');
  const rows = value.filter((row): row is HospitalLocation => {
    if (!isRecord(row)) return false;
    return isNonEmptyString(row.id)
      && isNonEmptyString(row.name)
      && isNonEmptyString(row.addr_hint)
      && isFiniteNumber(row.latitude)
      && row.latitude >= 32.5
      && row.latitude <= 38.9
      && isFiniteNumber(row.longitude)
      && row.longitude >= 124
      && row.longitude <= 132
      && typeof row.is_remote_area === 'boolean'
      && (row.region_note === undefined || isNonEmptyString(row.region_note));
  });
  if (rows.length !== value.length) throw new Error('hospital_locations contains an invalid record');
  if (rows.length < 5) throw new Error('hospital_locations requires at least 5 records');
  if (!rows.some((row) => row.region_note)) throw new Error('hospital_locations requires a region_note record');
  if (!rows.some((row) => row.is_remote_area)) throw new Error('hospital_locations requires an is_remote_area record');
  if (!hasUniqueIds(rows)) throw new Error('hospital_locations contains duplicate ids');
  return rows;
}

export function validateMedicalCosts(value: unknown): MedicalCostItem[] {
  if (!Array.isArray(value)) throw new Error('medical_costs must be an array');
  const rows = value.filter((row): row is MedicalCostItem => {
    if (!isRecord(row)) return false;
    return isNonEmptyString(row.id)
      && isNonEmptyString(row.name)
      && isNonEmptyString(row.category)
      && isFiniteNumber(row.cost)
      && row.cost > 0
      // 게임의 가격 슬라이더가 120만원까지만 올라간다(medicalCost.ts의 SLIDER_MAX) -
      // 빌드 스크립트가 이 상한을 어기고 더 비싼 항목을 내보내면 그 라운드는
      // 정답을 슬라이더로 표현할 수 없어 절대 못 맞추게 된다. 파이프라인을
      // 우회해 medical_costs.json이 직접 수정되는 경우까지 대비해 여기서도 막는다.
      && row.cost <= 1_200_000;
  });
  if (rows.length !== value.length) throw new Error('medical_costs contains an invalid record');
  if (rows.length < 12) throw new Error('medical_costs requires at least 12 records');
  if (!hasUniqueIds(rows)) throw new Error('medical_costs contains duplicate ids');
  const sortedCosts = rows.map((row) => row.cost).sort((a, b) => a - b);
  const canBuildBudgetRound = sortedCosts.some((budget) => {
    const fittingCount = sortedCosts.filter((cost) => cost <= budget).length;
    const excludedCount = sortedCosts.length - fittingCount;
    return (fittingCount >= 1 && excludedCount >= 4) || (fittingCount >= 2 && excludedCount >= 3);
  });
  if (!canBuildBudgetRound) {
    throw new Error('medical_costs cannot build a budget round with exactly 1 or 2 fitting items');
  }
  return rows;
}

export function validateTermPairs(value: unknown): MedicalTermPair[] {
  if (!Array.isArray(value)) throw new Error('medical_term_pairs must be an array');
  const rows = value.filter((row): row is MedicalTermPair => {
    if (!isRecord(row)) return false;
    return isNonEmptyString(row.id)
      && isNonEmptyString(row.item_name)
      && isNonEmptyString(row.category)
      && isFiniteNumber(row.cost)
      && row.cost >= 0;
  });
  if (rows.length !== value.length) throw new Error('medical_term_pairs contains an invalid record');
  if (rows.length < 24) throw new Error('medical_term_pairs requires at least 24 records');
  if (new Set(rows.map((row) => row.category)).size < 10) {
    throw new Error('medical_term_pairs requires at least 10 categories');
  }
  // 정답 판정은 항목 id로 하므로 id만 전량 고유하면 된다 - item_name은
  // 서로 다른 분류에 걸쳐 중복될 수 있고(원본 데이터의 특성), 한 라운드
  // 안에서 카드 텍스트가 겹치지 않는 건 MatchGame의 라운드 뽑기가 보장한다.
  if (!hasUniqueIds(rows)) throw new Error('medical_term_pairs contains duplicate ids');
  return rows;
}
