#!/usr/bin/env node
// 게임① "가장 가까운 위탁병원 찾기"의 decoy 선정 로직(lib/nearestHospital.ts)이
// 실제 전국 데이터에서 어떻게 동작하는지 재현하는 시뮬레이션.
//
// nearestHospital.ts의 GAP_TIERS/CLUSTER_RADIUS_FLOOR_KM/FINAL_FALLBACK_MAX_GAP_KM/
// FILL_ATTEMPTS 같은 상수들은 전부 이 스크립트로 뽑은 수치를 근거로 정해졌다
// (커밋 로그·코드 주석에 인용된 %들이 이 스크립트의 출력이다). 이 상수들을 바꾸거나
// hospital_locations.json/dong_outlines.json 데이터가 갱신되면, 다시 이 스크립트를
// 돌려서 주석에 적힌 수치가 아직도 맞는지 확인할 것.
//
// 실행: node app/scripts/simulate-location-decoys.cjs
// (nearestHospital.ts/geo.ts의 로직을 그대로 포팅했다 - 두 로직이 갈라지면 이
// 스크립트도 같이 갱신해야 한다.)
const fs = require('fs');
const path = require('path');
const DATA = path.join(__dirname, '..', 'public', 'data');

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
function pointInRing(px, py, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi === yj) continue;
    if (py < Math.min(yi, yj) || py >= Math.max(yi, yj)) continue;
    const xIntersect = xi + ((py - yi) / (yj - yi)) * (xj - xi);
    if (px < xIntersect) inside = !inside;
  }
  return inside;
}
function findDongName(dongList, point) {
  for (const dong of dongList) {
    if (dong.rings.some((ring) => pointInRing(point.lng, point.lat, ring))) return dong.name;
  }
  return null;
}
function pointToSegmentKm(p, a, b, kx, ky) {
  const ax = a.lng * kx, ay = a.lat * ky, bx = b.lng * kx, by = b.lat * ky, px = p.lng * kx, py = p.lat * ky;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
// geo.ts의 distanceToRegionKm과 동일.
function distanceToRegionKm(rings, point, regionCenter) {
  const inside = rings.some((ring) => pointInRing(point.lng, point.lat, ring));
  if (inside) return 0;
  const kx = 111.32 * Math.cos((regionCenter.lat * Math.PI) / 180);
  const ky = 111.32;
  let minKm = Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const [ax, ay] = ring[i];
      const [bx, by] = ring[(i + 1) % ring.length];
      const d = pointToSegmentKm(point, { lng: ax, lat: ay }, { lng: bx, lat: by }, kx, ky);
      if (d < minKm) minKm = d;
    }
  }
  return minKm;
}

// ---- nearestHospital.ts의 상수와 선택 로직 - 원본과 어긋나면 같이 고칠 것 ----
const GAP_TIERS = [[0.3, 1.5], [0.2, 2.5], [0.1, 5.0]];
const FINAL_FALLBACK_MAX_GAP_KM = 15;
const MIN_SEP_KM = 0.2;
// LocationGame.tsx의 SEARCH_POOL_SIZE와 동일 - 실제 게임은 정답 다음으로 가까운
// 40곳만 decoy 후보로 넘긴다. 이 슬라이스 없이 PRE_FILTER_N(250)개를 통째로
// attemptFill에 넘기면 실제보다 후보가 훨씬 많아져서 충족률·재추첨률이 낙관적으로 나온다.
const SEARCH_POOL_SIZE = 40;
const CLUSTER_RADIUS_FRACTION = 0.15;
const CLUSTER_RADIUS_FLOOR_KM = 2;
const DECOY_COUNT = 4;
const FILL_ATTEMPTS = 8;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function attemptFill(distancedAll) {
  const correct = distancedAll[0];
  const pool = distancedAll.slice(1).map((h) => ({ ...h, gapKm: h.km - correct.km }));
  const spanKmOf = (points) => {
    let max = 0;
    for (let i = 0; i < points.length; i++)
      for (let j = i + 1; j < points.length; j++) {
        const d = haversineKm(points[i].center, points[j].center);
        if (d > max) max = d;
      }
    return max;
  };
  const chosen = [correct];
  const tryFill = (candidates, respectSeparation) => {
    for (const candidate of candidates) {
      if (chosen.length - 1 >= DECOY_COUNT) break;
      if (chosen.some((c) => c.id === candidate.id)) continue;
      const tooClose = respectSeparation && chosen.some((c) => haversineKm(c.center, candidate.center) < MIN_SEP_KM);
      const tentative = [...chosen, candidate];
      const clusterRadiusKm = Math.max(spanKmOf(tentative) * CLUSTER_RADIUS_FRACTION, CLUSTER_RADIUS_FLOOR_KM);
      const wouldCluster = tentative.some((p) => tentative.filter((q) => q !== p && haversineKm(p.center, q.center) < clusterRadiusKm).length >= 2);
      if (!tooClose && !wouldCluster) chosen.push(candidate);
    }
  };
  for (const [gMin, gMax] of GAP_TIERS) {
    const tierPool = pool.filter((c) => c.gapKm >= gMin && c.gapKm <= gMax).sort((a, b) => a.gapKm - b.gapKm);
    tryFill(shuffle(tierPool), true);
    tryFill(tierPool, false);
  }
  if (chosen.length - 1 < DECOY_COUNT) {
    const capKm = correct.isRemoteArea ? Infinity : FINAL_FALLBACK_MAX_GAP_KM;
    const finalPool = pool.filter((c) => c.gapKm <= capKm).sort((a, b) => a.gapKm - b.gapKm);
    tryFill(finalPool, false);
  }
  return chosen;
}

function selectDecoys(distancedAll) {
  let best = attemptFill(distancedAll);
  for (let i = 1; i < FILL_ATTEMPTS && best.length - 1 < DECOY_COUNT; i++) {
    const candidate = attemptFill(distancedAll);
    const spanKmOf = (points) => {
      let max = 0;
      for (let a = 0; a < points.length; a++)
        for (let b = a + 1; b < points.length; b++) {
          const d = haversineKm(points[a].center, points[b].center);
          if (d > max) max = d;
        }
      return max;
    };
    if (candidate.length > best.length || (candidate.length === best.length && spanKmOf(candidate) < spanKmOf(best))) {
      best = candidate;
    }
  }
  const sorted = [...best].sort((a, b) => a.km - b.km);
  const maxGapAchieved = sorted.length > 1 ? sorted[sorted.length - 1].km - sorted[0].km : 0;
  return { decoysFilled: best.length - 1, maxGapAchieved };
}

// ---------------- 데이터 로드 ----------------
const hospitalsRaw = JSON.parse(fs.readFileSync(path.join(DATA, 'hospital_locations.json'), 'utf8'));
const dongsByAddr = JSON.parse(fs.readFileSync(path.join(DATA, 'dong_outlines.json'), 'utf8'));
const hospitals = hospitalsRaw.map((h) => {
  const dongName = findDongName(dongsByAddr[h.addr_hint] ?? [], { lat: h.latitude, lng: h.longitude });
  return {
    id: h.id,
    name: h.name,
    center: { lat: h.latitude, lng: h.longitude },
    addr: dongName ? `${h.addr_hint} ${dongName}` : h.addr_hint,
    isRemoteArea: h.is_remote_area,
  };
});
const dongOrigins = [];
for (const addr of Object.keys(dongsByAddr)) for (const dong of dongsByAddr[addr]) dongOrigins.push({ addr, dong });
console.log('전국 동 단위 출발점:', dongOrigins.length, '/ 병원 수:', hospitals.length);

// 운영 코드(nearestHospital.ts의 selectNearestChoices)는 중심점 거리로 사전 필터링하지
// 않고 전체 병원의 distanceToRegionKm을 계산한 뒤 정렬한다 - 길쭉한 시/군이나 여러
// 섬으로 나뉜 지역은 중심점 기준으로는 멀어도 경계 안/경계 근처인 병원이 있을 수
// 있어서(도서·벽지 정답은 특히 15km 상한도 없다), 여기서도 똑같이 전체를 계산해야
// 한다. 예전에는 속도를 위해 중심점 거리 상위 250개만 추린 뒤 경계 거리를 계산했는데,
// 그러면 그 250개 밖에 있는 병원은 애초에 후보에서 누락될 수 있었다.
const t0 = Date.now();
const perDong = [];
for (const { addr, dong } of dongOrigins) {
  const byRegion = hospitals.map((h) => ({ ...h, km: distanceToRegionKm(dong.rings, h.center, dong.center) })).sort((a, b) => a.km - b.km);
  perDong.push({ addr, dongName: dong.name, distanced: byRegion });
}
console.log(`거리 계산 완료 (${((Date.now() - t0) / 1000).toFixed(1)}초)\n`);

// ===== 선택지 개수 분포 =====
let total = 0;
const fillDist = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
const maxGaps = [];
let redrawCount = 0;

for (const d of perDong) {
  if (d.distanced.length < 2) continue;
  total++;
  const r = selectDecoys(d.distanced.slice(0, 1 + SEARCH_POOL_SIZE));
  fillDist[r.decoysFilled]++;
  maxGaps.push(r.maxGapAchieved);
  if (r.decoysFilled < 2) redrawCount++; // LocationGame.tsx: ranked.length<3(=decoy<2)면 재추첨
}

console.log('=== 선택지 개수 분포 (전국', total, '개 동 기준) ===');
console.log(`5지선다: ${fillDist[4]} (${((fillDist[4] / total) * 100).toFixed(1)}%)`);
console.log(`4지선다: ${fillDist[3]} (${((fillDist[3] / total) * 100).toFixed(1)}%)`);
console.log(`3지선다: ${fillDist[2]} (${((fillDist[2] / total) * 100).toFixed(1)}%)`);
console.log(`2지선다(재추첨 대상): ${fillDist[1]} (${((fillDist[1] / total) * 100).toFixed(1)}%)`);
console.log(`0개(재추첨 대상): ${fillDist[0]} (${((fillDist[0] / total) * 100).toFixed(1)}%)`);
console.log(`-> 실제 게임에서 재추첨(스킵)되는 비율: ${redrawCount} (${((redrawCount / total) * 100).toFixed(1)}%)`);

maxGaps.sort((a, b) => a - b);
console.log('\n=== 거리폭(정답~가장 먼 선택지) 분포 ===');
console.log(`평균 ${(maxGaps.reduce((a, b) => a + b, 0) / total).toFixed(2)}km · 중앙값 ${maxGaps[Math.floor(total * 0.5)].toFixed(2)}km · p90 ${maxGaps[Math.floor(total * 0.9)].toFixed(2)}km · p99 ${maxGaps[Math.floor(total * 0.99)].toFixed(2)}km · 최댓값 ${maxGaps[total - 1].toFixed(2)}km`);

// ===== 도서·벽지 지정 병원이 정답인 동 중 스킵되는 곳 =====
let remoteCorrectTotal = 0, remoteCorrectSkipped = 0;
for (const d of perDong) {
  if (d.distanced.length < 1 || !d.distanced[0].isRemoteArea) continue;
  remoteCorrectTotal++;
  const r = selectDecoys(d.distanced.slice(0, 1 + SEARCH_POOL_SIZE));
  if (r.decoysFilled < 2) remoteCorrectSkipped++;
}
console.log(`\n=== 도서·벽지 지정 병원이 정답인 동: ${remoteCorrectTotal}곳 중 스킵: ${remoteCorrectSkipped}곳 ===`);
console.log('(도서·벽지 정답은 15km 상한을 적용하지 않으므로 0에 가까워야 정상 - 격리된 섬처럼 진짜 후보 자체가 없는 경우만 남는다)');
