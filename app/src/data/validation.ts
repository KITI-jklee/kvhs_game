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
      && row.cost > 0;
  });
  if (rows.length !== value.length) throw new Error('medical_costs contains an invalid record');
  if (rows.length < 12) throw new Error('medical_costs requires at least 12 records');
  if (!hasUniqueIds(rows)) throw new Error('medical_costs contains duplicate ids');
  return rows;
}

export function validateTermPairs(value: unknown): MedicalTermPair[] {
  if (!Array.isArray(value)) throw new Error('medical_term_pairs must be an array');
  const rows = value.filter((row): row is MedicalTermPair => {
    if (!isRecord(row)) return false;
    return isNonEmptyString(row.id)
      && isNonEmptyString(row.item_name)
      && isNonEmptyString(row.kind_mid)
      && isFiniteNumber(row.cost)
      && row.cost >= 0;
  });
  if (rows.length !== value.length) throw new Error('medical_term_pairs contains an invalid record');
  if (rows.length < 24) throw new Error('medical_term_pairs requires at least 24 records');
  if (new Set(rows.map((row) => row.kind_mid)).size < 10) {
    throw new Error('medical_term_pairs requires at least 10 categories');
  }
  if (!hasUniqueIds(rows)) throw new Error('medical_term_pairs contains duplicate ids');
  if (new Set(rows.map((row) => row.item_name)).size !== rows.length) {
    throw new Error('medical_term_pairs contains duplicate item names');
  }
  return rows;
}
