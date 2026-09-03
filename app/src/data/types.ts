/** 필드명은 정적 JSON 생성 스크립트의 출력과 일치해야 한다. */

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
  /** 공식 도서·벽지 지정 위탁병원 여부(odcloud 컬럼 확장분 기준). */
  is_remote_area: boolean;
  /** 의외성 있는 병원(최북단·최남단 등) - 도서·벽지는 위 is_remote_area로 따로 표시하므로 여기 안 섞는다. */
  region_note?: string;
}

/** build-medical-costs.cjs가 생성하는 의료비 항목. */
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

/** 게임③ 콘텐츠 - API 명세서 B-3
 * id는 큐레이션 후보의 고유 ID를 `term_XXXX`로 바꾼 값이다. 정답 판정은
 * 카드 텍스트(category)가 아니라 이 ID가 가리키는 같은 항목인지로 한다. */
export interface MedicalTermPair {
  id: string;
  /** 비급여 진료 항목 (카드 앞면) */
  item_name: string;
  /** 짝이 되는 세부 분류값 (카드 뒷면). 원본 분류를 참고해 사람이
   * medical_term_curation.json에서 항목별로 확정한다.
   * 정답은 표시 문자열이 아니라 항목 ID로 판정한다. */
  category: string;
  cost: number;
}
