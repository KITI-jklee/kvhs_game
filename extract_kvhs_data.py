#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
한국보훈복지의료공단(KVHS) 공공데이터포털 API 전체 데이터 추출 스크립트
================================================================

공공데이터포털(data.go.kr)에서 활용신청 승인받은 아래 3개 API의 전체 데이터를
페이지네이션을 순회하며 모두 내려받아 JSON / CSV 파일로 저장한다.

  1) witak  - 보훈병원 위탁병원정보
  2) witak2 - 보훈병원 위탁병원 정보(위도 경도 포함)
  3) suga   - 보훈병원 비급여 수가정보

사용법
------
    python extract_kvhs_data.py

서비스키는 `DATA_GO_KR_SERVICE_KEY` 환경변수로만 전달한다.
인코딩 키와 디코딩 키 모두 사용할 수 있다.

출력물은 이 스크립트와 같은 폴더의 data/ 하위에 API 별로
  - <name>.json  : 원본 필드를 그대로 유지한 전체 레코드 배열
  - <name>.csv   : 스프레드시트 등에서 바로 열어볼 수 있는 CSV
로 저장된다. 또한 data/_summary.json 에 각 API의 총 건수/페이지 수 등
메타 정보를 요약해 남긴다.
"""

import csv
import json
import math
import os
import time
import urllib.error
import urllib.parse
import urllib.request

# ------------------------------------------------------------------
# 설정
# ------------------------------------------------------------------

# 실제 키는 저장소와 소스 코드에 절대 기록하지 않는다.
SERVICE_KEY = os.environ.get("DATA_GO_KR_SERVICE_KEY", "").strip()
if not SERVICE_KEY:
    raise SystemExit(
        "DATA_GO_KR_SERVICE_KEY 환경변수가 필요합니다. "
        "실행 쉘에서 값을 설정한 뒤 다시 실행하세요."
    )

# 추출 대상 API 목록: (내부 식별자, 사람이 읽기 좋은 설명, 엔드포인트 경로)
APIS = [
    {
        "key": "witak",
        "title": "보훈병원_위탁병원정보",
        "path": "https://api.odcloud.kr/api/witak/v1/witak",
    },
    {
        "key": "witak2",
        "title": "보훈병원_위탁병원정보_위경도포함",
        "path": "https://api.odcloud.kr/api/witak2/v1/witak2",
    },
    {
        "key": "suga",
        "title": "보훈병원_비급여수가정보",
        "path": "https://api.odcloud.kr/api/suga/v1/suga",
    },
]

# 한 번에 요청할 페이지당 건수. odcloud 계열 API는 대체로 perPage=1000까지 허용됨.
# (API가 이보다 작은 값으로 응답을 잘라 보내면 스크립트가 실제 perPage를 읽어 자동 보정한다)
REQUEST_PER_PAGE = 1000

# 요청 사이 대기 시간(초). 공공 API에 과도한 부하를 주지 않기 위한 최소한의 지연.
SLEEP_BETWEEN_REQUESTS = 0.2

# 요청 실패 시 재시도 횟수/대기 시간
MAX_RETRIES = 3
RETRY_SLEEP = 2.0

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "data")


def fetch_page(base_url: str, page: int, per_page: int) -> dict:
    """odcloud API 한 페이지를 호출해서 파싱된 JSON(dict)을 반환한다."""
    query = urllib.parse.urlencode(
        {"page": page, "perPage": per_page}, safe=""
    )
    encoded_key = urllib.parse.quote(urllib.parse.unquote(SERVICE_KEY), safe="")
    url = f"{base_url}?{query}&serviceKey={encoded_key}"

    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": "Mozilla/5.0 (kvhs-data-extractor)"}
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read().decode("utf-8")
            return json.loads(raw)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
            last_error = exc
            print(f"    ! 요청 실패 (시도 {attempt}/{MAX_RETRIES}): {exc}")
            time.sleep(RETRY_SLEEP)
    raise RuntimeError(f"페이지 {page} 요청이 {MAX_RETRIES}회 모두 실패했습니다: {last_error}")


def fetch_all(api: dict) -> list:
    """해당 API의 모든 페이지를 순회하며 전체 레코드를 리스트로 반환한다."""
    print(f"\n[{api['key']}] {api['title']} 데이터 수집 시작")

    first = fetch_page(api["path"], page=1, per_page=REQUEST_PER_PAGE)
    total_count = first.get("totalCount", 0)
    actual_per_page = first.get("perPage", REQUEST_PER_PAGE)
    total_pages = max(1, math.ceil(total_count / actual_per_page)) if actual_per_page else 1

    print(
        f"  총 건수(totalCount): {total_count} / 페이지당 건수: {actual_per_page} "
        f"/ 총 페이지 수: {total_pages}"
    )

    records = list(first.get("data", []))

    for page in range(2, total_pages + 1):
        time.sleep(SLEEP_BETWEEN_REQUESTS)
        print(f"  -> 페이지 {page}/{total_pages} 요청 중...")
        result = fetch_page(api["path"], page=page, per_page=actual_per_page)
        records.extend(result.get("data", []))

    if len(records) != total_count:
        print(
            f"  ! 경고: 수집된 레코드 수({len(records)})가 totalCount({total_count})와 다릅니다."
        )
    else:
        print(f"  완료: {len(records)}건 수집")

    return {
        "key": api["key"],
        "title": api["title"],
        "total_count": total_count,
        "per_page": actual_per_page,
        "total_pages": total_pages,
        "records": records,
    }


def save_json(records: list, path: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)


def save_csv(records: list, path: str) -> None:
    if not records:
        # 빈 데이터라도 파일은 생성해 둔다.
        with open(path, "w", encoding="utf-8-sig", newline="") as f:
            f.write("")
        return

    # 레코드마다 필드 구성이 조금씩 다를 수 있으므로 전체 레코드의 키를 합집합으로 모은다.
    fieldnames = []
    seen = set()
    for rec in records:
        for k in rec.keys():
            if k not in seen:
                seen.add(k)
                fieldnames.append(k)

    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for rec in records:
            writer.writerow(rec)


def main() -> None:
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    summary = {}

    for api in APIS:
        result = fetch_all(api)
        records = result["records"]

        json_path = os.path.join(OUTPUT_DIR, f"{result['key']}_{result['title']}.json")
        csv_path = os.path.join(OUTPUT_DIR, f"{result['key']}_{result['title']}.csv")

        save_json(records, json_path)
        save_csv(records, csv_path)

        print(f"  저장 완료: {os.path.relpath(json_path, SCRIPT_DIR)}")
        print(f"  저장 완료: {os.path.relpath(csv_path, SCRIPT_DIR)}")

        summary[result["key"]] = {
            "title": result["title"],
            "total_count": result["total_count"],
            "per_page": result["per_page"],
            "total_pages": result["total_pages"],
            "collected": len(records),
            "json_file": os.path.basename(json_path),
            "csv_file": os.path.basename(csv_path),
        }

    summary_path = os.path.join(OUTPUT_DIR, "_summary.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print("\n=== 전체 요약 ===")
    for key, info in summary.items():
        print(
            f"  {key}: {info['collected']}/{info['total_count']}건 "
            f"(perPage={info['per_page']}, 총 {info['total_pages']}페이지) "
            f"-> {info['json_file']}, {info['csv_file']}"
        )
    print(f"\n요약 파일: {os.path.relpath(summary_path, SCRIPT_DIR)}")


if __name__ == "__main__":
    main()
