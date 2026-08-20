#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
보훈데이터 아케이드 - 데이터 정제 파이프라인
==========================================
기능설계서 7장 / API 명세서 A·B장 / DB 설계서 05·07 시트에 따라
data/ 아래의 원본 공공데이터 3종(1회성 수집 결과)을 게임용 정적 JSON
3종으로 변환한다.

입력 (data/):
  - witak_보훈병원_위탁병원정보.json          (게임②: 진짜 병원명)
  - witak2_보훈병원_위탁병원정보_위경도포함.json (게임①: 위치)
  - suga_보훈병원_비급여수가정보.json           (게임③: 용어 짝맞추기)

출력 (app/public/data/):
  - hospital_locations.json   { id, name, addr_hint, latitude, longitude, region_note? }[]
  - hospital_names.json       { id, name, is_real, reviewed }[]
  - medical_term_pairs.json   { id, item_name, kind_mid, cost }[]

원천 데이터가 갱신되면 이 스크립트를 재실행해 출력 3종을 교체한다
(런타임 자동 동기화 없음 — FR-DT-07).
"""

import json
import random
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
OUT_DIR = ROOT / "app" / "public" / "data"
OUT_DIR.mkdir(parents=True, exist_ok=True)

random.seed(20260819)  # 재현 가능한 산출물을 위한 고정 시드


def load(name: str):
    with open(DATA_DIR / name, encoding="utf-8") as f:
        return json.load(f)


def dump(name: str, records):
    path = OUT_DIR / name
    with open(path, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    print(f"[write] {path.relative_to(ROOT)}  ({len(records)} records)")


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

    # 의외성 있는 병원 태깅: 4극단 + 도서·벽지(울릉/제주/서귀포/옹진) 보너스
    notes = {}

    def tag(idx, note):
        v = valid[idx]
        key = v["pid"]
        notes[key] = notes.get(key, []) + [note]

    tag(max(range(len(valid)), key=lambda i: valid[i]["lat"]), "최북단")
    tag(min(range(len(valid)), key=lambda i: valid[i]["lat"]), "최남단")
    tag(max(range(len(valid)), key=lambda i: valid[i]["lng"]), "최동단")
    tag(min(range(len(valid)), key=lambda i: valid[i]["lng"]), "최서단")

    island_markers = ["울릉", "독도", "서귀포", "제주", "옹진", "백령"]
    for v in valid:
        if v["pid"] in notes:
            continue
        if any(m in v["addr1"] or m in v["name"] for m in island_markers):
            notes[v["pid"]] = ["도서·벽지"]

    out = []
    for v in valid:
        item = {
            "id": f"hosp_{v['pid']:04d}",
            "name": v["name"],
            "addr_hint": expand_addr_hint(v["addr1"]),
            "latitude": round(v["lat"], 6),
            "longitude": round(v["lng"], 6),
        }
        if v["pid"] in notes:
            item["region_note"] = "·".join(dict.fromkeys(notes[v["pid"]])) + " 위탁병원"
        out.append(item)

    dump("hospital_locations.json", out)
    print(f"  region_note tagged: {sum(1 for o in out if 'region_note' in o)}")


# ---------------------------------------------------------------------------
# 게임② : hospital_names.json  (원본: witak, 위탁병원정보)
# ---------------------------------------------------------------------------
# 실제 병원명은 원본에서 그대로 가져오고, 가짜 병원명은 실제 데이터에서 관찰된
# "지역명 + 흔한 병원 접미어" 패턴을 재조합해 생성한 뒤 원본 공단 병원명
# 목록과 정확히 겹치지 않는지 자동 대조한다. 현재 `reviewed=true`는 사람의
# 수동 승인이 아니라 이 자동 대조를 통과했다는 의미다.

FAKE_STEMS = [
    "참사랑", "새사랑", "열린", "새롬", "한빛", "행복한", "다정", "은혜", "하나",
    "새하늘", "온누리", "푸른", "늘봄", "미래", "우리", "제일", "중앙제일", "365",
    "연합", "굿모닝", "365연합", "참좋은", "함께", "튼튼", "밝은",
]
FAKE_SUFFIXES = ["병원", "의료원", "종합병원", "요양병원", "한방병원"]

REGION_TOKEN_RE = re.compile(r"^[가-힣]{2,4}(?:시|군|구|읍|면)?")


def build_names():
    raw = load("witak_보훈병원_위탁병원정보.json")
    real_names = []
    seen = set()
    for rec in raw:
        name = (rec.get("name") or "").strip()
        region = (rec.get("region_small") or rec.get("region_big") or "").strip()
        if not name or name in seen:
            continue
        seen.add(name)
        real_names.append({"name": name, "region": region})

    # 지역 접두어 후보: 실제 데이터의 region_small에서 추출(각 지역당 1개 이상 확보)
    region_prefixes = sorted({r["region"] for r in real_names if r["region"]})
    # region_small이 비어 있으면 병원명 앞부분에서 유사 접두어를 뽑아 보강
    for r in real_names:
        if not r["region"]:
            m = REGION_TOKEN_RE.match(r["name"])
            if m:
                region_prefixes.append(m.group(0))
    region_prefixes = sorted(set(region_prefixes)) or ["대한"]

    FAKE_TARGET = 90
    fakes = []
    fake_names_seen = set()
    attempts = 0
    while len(fakes) < FAKE_TARGET and attempts < FAKE_TARGET * 50:
        attempts += 1
        prefix = random.choice(region_prefixes)
        stem = random.choice(FAKE_STEMS)
        suffix = random.choice(FAKE_SUFFIXES)
        candidate = f"{prefix}{stem}{suffix}"
        if candidate in seen or candidate in fake_names_seen:
            continue
        fake_names_seen.add(candidate)
        fakes.append(candidate)

    # 실제 병원명 풀: 70:30 비율에 수렴하도록 표본 추출(전체 1000여 건 중 일부)
    real_target = round(len(fakes) * 70 / 30)
    real_sample = random.sample(real_names, min(real_target, len(real_names)))

    out = []
    for i, r in enumerate(real_sample, start=1):
        out.append({"id": f"name_{i:04d}", "name": r["name"], "is_real": True, "reviewed": True})
    for i, name in enumerate(fakes, start=1):
        # reviewed=true: 원본 공단 병원명과의 자동 중복 대조를 통과함.
        out.append({"id": f"fake_{i:04d}", "name": name, "is_real": False, "reviewed": True})

    random.shuffle(out)
    dump("hospital_names.json", out)
    real_ct = sum(1 for o in out if o["is_real"])
    print(f"  real={real_ct} fake={len(out) - real_ct} ratio={real_ct / len(out):.0%}/{(len(out) - real_ct) / len(out):.0%}")


# ---------------------------------------------------------------------------
# 게임③ : medical_term_pairs.json  (원본: suga, 비급여 수가정보)
# ---------------------------------------------------------------------------
# item_name(카드 앞면)과 kind_mid(카드 뒷면 분류)가 1:1로 대응하도록 이름
# 기준 중복을 제거하고, 지나치게 전문적인 항목(영문 병기·과도하게 긴 이름)은
# 카드 풀에서 제외한다.

TOO_TECHNICAL_RE = re.compile(r"[.\[\]/,_-]|[A-Za-z]{4,}")
HANGUL_RE = re.compile(r"[가-힣]")

# 표기가 갈라져 있는 회계상 분류를 하나의 카드 뒷면 문구로 통일
KIND_MID_NORMALIZE = {
    "치과 처치·수술료": "치과 처치·수술료",
    "치과 처치ㆍ수술료": "치과 처치·수술료",
    "치과 처치 및 수술료": "치과 처치·수술료",
    "치과처치 및 수술료": "치과 처치·수술료",
    "처치 및 수술료": "처치 및 수술료",
    "처치 및 수술료 등": "처치 및 수술료",
    "처치·수술료": "처치 및 수술료",
    "영상진단 및 방사선 치료료": "영상진단·방사선료",
    "영상진단 및 방사선치료료": "영상진단·방사선료",
    "자기공명영상 진단료(MRI)": "자기공명영상진단료(MRI)",
    "자기공명영상진단료(MRI)": "자기공명영상진단료(MRI)",
    "이학요법료(물리치료료)": "이학요법료(물리치료료)",
    "이학요법료": "이학요법료(물리치료료)",
}
# 카드 짝맞추기 분류로 쓰기에 지나치게 포괄적/행정적인 값은 제외
KIND_MID_EXCLUDE = {"", "기타", "제증명수수료"}


def clean_item_name(raw_name: str) -> str:
    name = raw_name.split(" / ")[0].split("/")[0].strip()
    name = re.sub(r"\([^)]*\)", "", name).strip()
    return name


def build_term_pairs():
    raw = load("suga_보훈병원_비급여수가정보.json")
    by_name = {}
    for rec in raw:
        name = clean_item_name(rec.get("name") or "")
        kind_mid_raw = (rec.get("kind_mid") or "").strip()
        kind_mid = KIND_MID_NORMALIZE.get(kind_mid_raw, kind_mid_raw)
        cost = rec.get("cost")
        if not name or kind_mid in KIND_MID_EXCLUDE or not isinstance(cost, (int, float)):
            continue
        if not (3 <= len(name) <= 16):
            continue
        if not HANGUL_RE.search(name):
            continue
        if TOO_TECHNICAL_RE.search(name):
            continue
        if name in by_name:
            continue  # item_name ↔ kind_mid 1:1 대응을 위해 최초 등장만 채택
        by_name[name] = {"item_name": name, "kind_mid": kind_mid, "cost": int(cost)}

    # 특정 분류에 카드가 몰리지 않도록 kind_mid별로 고르게 표본 추출
    by_kind = {}
    for item in by_name.values():
        by_kind.setdefault(item["kind_mid"], []).append(item)
    for bucket in by_kind.values():
        random.shuffle(bucket)

    PER_KIND_CAP = 6
    TOTAL_TARGET = 80
    pool = []
    idx = 0
    kinds = list(by_kind.keys())
    while len(pool) < TOTAL_TARGET and kinds:
        progressed = False
        for k in list(kinds):
            bucket = by_kind[k]
            taken = sum(1 for p in pool if p["kind_mid"] == k)
            if taken >= PER_KIND_CAP or not bucket:
                kinds.remove(k) if not bucket else None
                continue
            pool.append(bucket.pop())
            progressed = True
            if len(pool) >= TOTAL_TARGET:
                break
        if not progressed:
            break
        idx += 1

    random.shuffle(pool)
    out = [
        {"id": f"term_{i:04d}", "item_name": p["item_name"], "kind_mid": p["kind_mid"], "cost": p["cost"]}
        for i, p in enumerate(pool, start=1)
    ]
    dump("medical_term_pairs.json", out)
    print(f"  distinct kind_mid used: {len({o['kind_mid'] for o in out})}")


if __name__ == "__main__":
    build_locations()
    build_names()
    build_term_pairs()
    print("done.")
