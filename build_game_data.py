#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
보훈데이터 아케이드 - 데이터 정제 파이프라인
==========================================
기능설계서 7장 / API 명세서 A·B장 / DB 설계서 05·07 시트에 따라
data/ 아래의 원본 공공데이터를 게임용 정적 JSON으로 변환한다.

입력 (data/):
  - witak2_보훈병원_위탁병원정보_위경도포함.json (게임①: 위치)
  - witak3_보훈병원_위탁병원정보_도서지역포함.json (게임①: 공식 도서·벽지 여부, pid로 join)
  - medical_costs_base.json (게임②·③: 수작업 검토를 마친 불변 기준 항목)
  - medical_term_curation.json (게임②·③: 이름·분류·제외·추가 결정)

출력 (app/public/data/):
  - hospital_locations.json   { id, name, addr_hint, latitude, longitude, is_remote_area, region_note? }[]
  - medical_costs.json        { id, name, category, cost, ... }[]
  - medical_term_pairs.json   { id, item_name, category, cost }[]

원천 데이터가 갱신되면 이 스크립트를 재실행해 출력을 교체한다
(런타임 자동 동기화 없음 — FR-DT-07).

불변 기준 파일에 큐레이션의 이름·제외·추가 결정을 적용해 두 게임이 같은
이름·가격을 사용하게 한다. 단, 게임②는 슬라이더 범위인 1만~120만원 밖의
항목을 제외한다. 게임③의 카드 분류도 큐레이션 파일에서 항목별로 관리한다.

"""

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
OUT_DIR = ROOT / "app" / "public" / "data"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def load(name: str):
    with open(DATA_DIR / name, encoding="utf-8") as f:
        return json.load(f)


def dump(name: str, records):
    path = OUT_DIR / name
    with open(path, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    print(f"[write] {path.relative_to(ROOT)}  ({len(records)} records)")


def require_non_empty_string(value, field: str):
    if not isinstance(value, str) or not value.strip():
        raise SystemExit(f"medical_term_curation: {field}는 비어 있지 않은 문자열이어야 합니다")


def validate_term_curation(curation):
    required_fields = {"excluded_base_ids", "categories", "name_overrides", "additions"}
    if not isinstance(curation, dict) or set(curation) != required_fields:
        raise SystemExit(
            "medical_term_curation: 최상위 필드는 "
            f"{', '.join(sorted(required_fields))}만 있어야 합니다"
        )

    excluded_ids = curation["excluded_base_ids"]
    categories = curation["categories"]
    name_overrides = curation["name_overrides"]
    additions = curation["additions"]
    if not isinstance(excluded_ids, list):
        raise SystemExit("medical_term_curation: excluded_base_ids는 배열이어야 합니다")
    if not isinstance(categories, dict) or not isinstance(name_overrides, dict):
        raise SystemExit("medical_term_curation: categories와 name_overrides는 객체여야 합니다")
    if not isinstance(additions, list):
        raise SystemExit("medical_term_curation: additions는 배열이어야 합니다")

    for index, item_id in enumerate(excluded_ids):
        require_non_empty_string(item_id, f"excluded_base_ids[{index}]")
    if len(excluded_ids) != len(set(excluded_ids)):
        raise SystemExit("medical_term_curation: excluded_base_ids에 중복 ID가 있습니다")
    for item_id, category in categories.items():
        require_non_empty_string(item_id, "categories의 ID")
        require_non_empty_string(category, f"categories[{item_id}]")
    for item_id, name in name_overrides.items():
        require_non_empty_string(item_id, "name_overrides의 ID")
        require_non_empty_string(name, f"name_overrides[{item_id}]")

    addition_fields = {"id", "item_name", "category", "cost"}
    addition_ids = []
    for index, addition in enumerate(additions):
        if not isinstance(addition, dict) or set(addition) != addition_fields:
            raise SystemExit(
                f"medical_term_curation: additions[{index}]는 "
                f"{', '.join(sorted(addition_fields))} 필드만 가져야 합니다"
            )
        for field in ("id", "item_name", "category"):
            require_non_empty_string(addition[field], f"additions[{index}].{field}")
        if not addition["id"].startswith("term_extra_"):
            raise SystemExit(f"medical_term_curation: additions[{index}].id는 term_extra_로 시작해야 합니다")
        addition_ids.append(addition["id"])
        cost = addition["cost"]
        if isinstance(cost, bool) or not isinstance(cost, (int, float)) or not math.isfinite(cost) or cost <= 0:
            raise SystemExit(f"medical_term_curation: additions[{index}].cost는 0보다 큰 유한한 숫자여야 합니다")
    if len(addition_ids) != len(set(addition_ids)):
        raise SystemExit("medical_term_curation: additions에 중복 ID가 있습니다")

    return excluded_ids, categories, name_overrides, additions


# ---------------------------------------------------------------------------
# 게임① : hospital_locations.json  (원본: witak2, 위경도포함)
# ---------------------------------------------------------------------------
# region_big/region_small은 명세와 실제가 뒤바뀌어 있어 사용하지 않는다(API
# 명세서 A-2, FR-DT-04). addr_hint는 addr1(예: "전남 강진군")을 사용하되
# 축약된 광역명은 정식 명칭으로 펼쳐 표시한다.

PROVINCE_EXPAND = {
    "서울": "서울특별시", "부산": "부산광역시", "대구": "대구광역시", "인천": "인천광역시",
    "광주": "광주광역시", "대전": "대전광역시", "울산": "울산광역시", "세종": "세종특별자치시",
    "경기": "경기도", "강원": "강원특별자치도", "충북": "충청북도", "충남": "충청남도",
    "전북": "전북특별자치도", "전남": "전라남도", "경북": "경상북도", "경남": "경상남도",
    "제주": "제주특별자치도",
}


def expand_addr_hint(addr1: str) -> str:
    parts = addr1.split(" ", 1)
    if not parts:
        return addr1
    head = parts[0]
    rest = parts[1] if len(parts) > 1 else ""
    full = PROVINCE_EXPAND.get(head) or PROVINCE_EXPAND.get(head[:2], head)
    return f"{full} {rest}".strip()


def build_locations():
    raw = load("witak2_보훈병원_위탁병원정보_위경도포함.json")
    # 공식 도서·벽지 여부(odcloud 컬럼 확장분) - pid로 원본과 1:1 매칭된다.
    # 예전엔 이름/주소에 "울릉·제주·옹진" 같은 문자열이 들어있는지로 대충
    # 추측했는데(24건), 실제 공식 데이터는 63건 - 완도·신안·흑산도·강화·
    # 정선·화천·철원·영월처럼 이름만 봐선 알 수 없던 곳이 훨씬 많았다.
    island_raw = load("witak3_보훈병원_위탁병원정보_도서지역포함.json")
    remote_pids = {rec["pid"] for rec in island_raw if rec.get("island_area") == "포함"}

    valid = []
    for rec in raw:
        try:
            lat = float(rec["latitude"])
            lng = float(rec["longitude"])
        except (KeyError, TypeError, ValueError):
            continue
        # 대한민국 영토 대략 범위(이어도·독도 근해 여유 포함) 밖은 이상치로 제외
        if not (32.5 <= lat <= 38.9 and 124.0 <= lng <= 132.0):
            continue
        name = (rec.get("name") or "").strip()
        addr1 = (rec.get("addr1") or "").strip()
        if not name or not addr1:
            continue
        valid.append({"pid": rec.get("pid"), "name": name, "addr1": addr1, "lat": lat, "lng": lng})

    if not valid:
        raise SystemExit("hospital_locations: no valid records after filtering")

    # 의외성 있는 병원 태깅(4극단) - 도서·벽지는 이제 위 공식 데이터로 별도
    # 필드(is_remote_area)에 정확히 표시하므로, 여기 region_note에는 섞지 않는다.
    notes = {}

    def tag(idx, note):
        v = valid[idx]
        key = v["pid"]
        notes[key] = notes.get(key, []) + [note]

    tag(max(range(len(valid)), key=lambda i: valid[i]["lat"]), "최북단")
    tag(min(range(len(valid)), key=lambda i: valid[i]["lat"]), "최남단")
    tag(max(range(len(valid)), key=lambda i: valid[i]["lng"]), "최동단")
    tag(min(range(len(valid)), key=lambda i: valid[i]["lng"]), "최서단")

    out = []
    for v in valid:
        item = {
            "id": f"hosp_{v['pid']:04d}",
            "name": v["name"],
            "addr_hint": expand_addr_hint(v["addr1"]),
            "latitude": round(v["lat"], 6),
            "longitude": round(v["lng"], 6),
            "is_remote_area": v["pid"] in remote_pids,
        }
        if v["pid"] in notes:
            item["region_note"] = "·".join(dict.fromkeys(notes[v["pid"]])) + " 위탁병원"
        out.append(item)

    dump("hospital_locations.json", out)
    print(f"  region_note tagged: {sum(1 for o in out if 'region_note' in o)}")


# ---------------------------------------------------------------------------
# 게임②·③ 공통 의료 항목
# 불변 기준에 큐레이션을 적용해 두 출력 파일을 새로 만든다.
# ---------------------------------------------------------------------------
def build_medical_data():
    base_costs = load("medical_costs_base.json")
    curation = load("medical_term_curation.json")
    excluded_list, categories, name_overrides, additions = validate_term_curation(curation)
    excluded_ids = set(excluded_list)

    cost_ids = {item["id"] for item in base_costs}
    addition_by_cost_id = {
        addition["id"].replace("term_", "mc_", 1): addition
        for addition in additions
    }
    configured_ids = excluded_ids | set(categories)
    missing = sorted(cost_ids - configured_ids)
    unknown = sorted(configured_ids - cost_ids)
    if missing or unknown:
        raise SystemExit(
            "medical_term_curation: medical_costs ID 불일치"
            f" (누락={missing[:10]}, 알 수 없음={unknown[:10]})"
        )
    if set(name_overrides) - set(categories):
        raise SystemExit("medical_term_curation: 제외되거나 알 수 없는 ID에 이름 변경이 있습니다")

    shared_items = [
        {
            **item,
            "name": name_overrides.get(item["id"], item["name"]),
        }
        for item in base_costs
        if item["id"] not in excluded_ids
    ]
    shared_items.extend({
        "id": cost_id,
        "name": addition["item_name"],
        "cost": addition["cost"],
        "category": addition["category"],
        "minCost": addition["cost"],
        "maxCost": addition["cost"],
        "sampleCount": 1,
    } for cost_id, addition in addition_by_cost_id.items())

    # 게임②의 가격 슬라이더 범위 밖 항목은 게임②에서만 제외한다.
    medical_costs = [item for item in shared_items if 10_000 <= item["cost"] <= 1_200_000]
    dump("medical_costs.json", medical_costs)

    out = []
    for item in shared_items:
        addition = addition_by_cost_id.get(item["id"])
        out.append({
            "id": item["id"].replace("mc_", "term_", 1),
            "item_name": item["name"],
            "category": addition["category"] if addition else categories[item["id"]],
            "cost": item["cost"],
        })

    ids = [item["id"] for item in out]
    if len(ids) != len(set(ids)):
        raise SystemExit("medical_term_curation: 중복 ID가 있습니다")
    dump("medical_term_pairs.json", out)
    print(f"  distinct categories used: {len({item['category'] for item in out})}")


if __name__ == "__main__":
    build_locations()
    build_medical_data()
    print("done.")
