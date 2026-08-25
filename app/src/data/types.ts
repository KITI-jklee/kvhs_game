/**
 * Shared data shapes for the arcade.
 *
 * `HospitalLocation` / `MedicalTermPair` mirror the static JSON contract in
 * the API 명세서 (B장) and DB 설계서 (05_정적JSON_명세) byte for byte - field
 * names must stay in sync with `build_game_data.py`'s output and with
 * `public/data/*.json`. `MedicalCostItem`은 별도로 `scripts/build-medical-costs.cjs`가
 * 만든다(원본 명세서 이후 추가된 게임②).
 */

export type GameId = 'location' | 'medical_cost' | 'term_match';

export interface GameSummary {
  id: GameId;
  no: string;
  title: string;
  desc: string;
  tag: string;
  kicker: string;
  path: string;
}

/** One grade tier. `name` excludes the "보훈" prefix - screens prepend it (e.g. `보훈 ${grade.name}`). */
export interface Grade {
  icon: string;
  name: string;
  range: string;
  min: number;
  max: number;
}

/** 게임① 콘텐츠 - API 명세서 B-1 */
export interface HospitalLocation {
  id: string;
  name: string;
  addr_hint: string;
  latitude: number;
  longitude: number;
  /** 의외성 있는 병원(최북단·최남단 등). 있으면 회차당 최소 1회 출제 가중치 대상. */
  region_note?: string;
}

/** 게임② 콘텐츠(의료비 감각 테스트) - `scripts/build-medical-costs.cjs`가
 * 실제 비급여 수가 공개 데이터(`suga_보훈병원_비급여수가정보.json`)에서
 * 큐레이션해서 만든다. */
export interface MedicalCostItem {
  id: string;
  name: string;
  /** 실제 공개 비급여 수가(원). */
  cost: number;
  category: string;
  /** 같은 항목으로 통합된 공개 가격의 범위와 표본 수. */
  minCost?: number;
  maxCost?: number;
  sampleCount?: number;
  code?: string;
}

/** 게임③ 콘텐츠 - API 명세서 B-3 */
export interface MedicalTermPair {
  id: string;
  /** 비급여 진료 항목 (카드 앞면) */
  item_name: string;
  /** 짝이 되는 분류값 (카드 뒷면) */
  kind_mid: string;
  cost: number;
}
