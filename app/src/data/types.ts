/**
 * Shared data shapes for the arcade.
 *
 * `HospitalLocation` / `HospitalName` / `MedicalTermPair` mirror the static
 * JSON contract in the API 명세서 (B장) and DB 설계서 (05_정적JSON_명세) byte
 * for byte - field names must stay in sync with `build_game_data.py`'s output
 * and with `public/data/*.json`.
 */

export type GameId = 'location' | 'fake_hospital' | 'term_match';

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

/** 게임② 콘텐츠 - API 명세서 B-2 */
export interface HospitalName {
  id: string;
  name: string;
  is_real: boolean;
  /** is_real=false인 레코드는 반드시 true (원본 공단 병원명과의 자동 중복 대조 통과). */
  reviewed: boolean;
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
