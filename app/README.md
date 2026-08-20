# 보훈데이터 아케이드

> 최초 기획서 이후 확정된 현행 규칙은 [현행 구현 기준](../docs/current-product-decisions.md)을 우선해 참고하세요.

React + TypeScript + Vite implementation of the `보훈데이터 아케이드 - 모바일 태블릿 웹`
design (see `../project/` and `../chats/` for the original Claude Design handoff).

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-checks (tsc -b) then builds to dist/
npm run lint      # oxlint
```

## Structure

```
src/
  data/            Mock content + the swap-in seam for real data (see below)
  lib/              Pure helpers: grade math, clock formatting, the match-game deck
  state/            GameContext - running total score, current grade, last result
  components/       Shared UI: BrandBar/TabBar/GameHud (nav), GradeHeroCard/List/ChipRow,
                     GameCard, MatchCard, ProgressBar, Button, icon glyphs, PlaceholderMap
  pages/            Home, Result, Grade, and pages/games/{LocationGame,JudgeGame,MatchGame}
```

Routes: `/`, `/games/location`, `/games/judge`, `/games/match`, `/result`, `/grade`.

The app is genuinely responsive (CSS media queries at 768px/1024px), not a fixed-size
device preview - mobile, tablet, and desktop share one implementation per screen.

## Real data / map API integration

Everything in `src/data/provider.ts` is placeholder content (병원 목록, 지도 좌표, 용어
짝맞추기 쌍) standing in for the real 한국보훈복지의료공단 공공데이터 feed. To connect
real data:

1. Replace the arrays in `provider.ts` with a real fetch (or hydrate them from an API
   response) - the exported `getGames`/`getGrades`/`getLocationTargets`/
   `getHospitalCandidates`/`getTermPairs` functions are what every page calls, so keep
   those signatures and nothing else needs to change.
2. For the map (게임 01: 위치감각게임), see the comment block at the top of
   `src/components/map/PlaceholderMap.tsx` - it documents exactly how to swap in a real
   map SDK (Kakao Maps / Google Maps) once real coordinates are available on
   `LocationTarget.coords`, and how the percent-space scoring math in
   `pages/games/LocationGame.tsx` would need to change to use real geographic distance.
