# 보훈데이터 아케이드

> 최초 기획서 이후 확정된 현행 규칙은 [현행 구현 기준](../docs/current-product-decisions.md)을 우선해 참고하세요.

`보훈데이터 아케이드 - 모바일 태블릿 웹` 디자인을 React + TypeScript + Vite로 구현한 앱입니다.
(원본 Claude Design 핸드오프 자료는 원래 `../project/`, `../chats/`에 있었지만, 실데이터 연동이
끝난 뒤 더 이상 쓰지 않는 디자인 산출물·대화 로그로 판단해 삭제했습니다 — 커밋 `32ea32b` 참고.)

## 실행하기

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 타입 검사(tsc -b) 후 빌드
npm run lint      # oxlint
npm run test      # vitest
```

## 구조

```
src/
  data/            실데이터 로딩: loader.tsx(시작 시 app/public/data/*.json을 불러옴)
                    + validation.ts(필드/좌표/ID 검증) + types.ts
                    provider.ts는 이제 정적 게임 목록/등급표(getGames/getGrades)만 담당
  lib/              순수 함수 모음: 등급 계산, 게임별 채점(nearestHospital, medicalCost,
                    matchScore), 짝맞추기 카드 덱, 지도 경계선(geo/outline) 헬퍼
  state/            GameContext - 누적 점수, 현재 등급, 마지막 결과
  components/       공통 UI: BrandBar/TabBar/GameHud(내비게이션), GradeHeroCard/List/ChipRow,
                    GameCard, MatchCard, ProgressBar, Button, PauseOverlay, ShareOverlay,
                    아이콘 글리프, map/KoreaMap(과거 placeholder를 대체한 실제 SVG 지도)
  pages/            Home, Result, Grade, pages/games/{LocationGame,MedicalCostGame,MatchGame}
```

라우트: `/`, `/games/location`, `/games/medical-cost`, `/games/match`, `/result`, `/grade`.

특정 화면 크기 미리보기가 아니라 실제로 반응형(768px/1024px 기준 CSS 미디어 쿼리)입니다 —
모바일·태블릿·데스크톱이 화면마다 하나의 구현을 공유합니다.

## 데이터

세 게임 모두 한국보훈복지의료공단 실제 공공데이터를 사용하며, `public/data/`에 정적 JSON으로
배포됩니다(`locations.json`, `medical_costs.json`, `medical_term_pairs.json`, 지도용
`city_outlines/`). `src/data/loader.tsx`가 시작 시 이 파일들을 한 번 불러오고,
`src/data/validation.ts`가 화면을 그리기 전에 필드 타입·좌표 범위·ID 중복·최소 수량을
검증합니다 — 자세한 내용은 [현행 구현 기준](../docs/current-product-decisions.md#배포·데이터)
참고.

공공데이터포털 원본으로부터 이 데이터를 다시 생성하려면 루트
[README의 게임 데이터 갱신 절차](../README.md#게임-데이터-갱신)를 참고하세요. 특히 의료비
데이터는 자동 스크립트가 1차 후보 풀만 만들어줄 뿐이라, 실제 배포 중인
`medical_costs.json`이 어떤 과정으로 사람이 직접 다듬어졌는지는
[docs/medical_costs_curation_guide.md](../docs/medical_costs_curation_guide.md)에 남아
있습니다.
