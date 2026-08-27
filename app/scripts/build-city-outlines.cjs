/**
 * 위치 게임용 시/군/구 목록과 대표 육지점(`_regions.json`)을 만든다.
 * 출처: southkorea/southkorea-maps의 2018년 시군구 TopoJSON(WGS84).
 * 실행: app/에서 `node scripts/build-city-outlines.cjs`.
 * 새 지역이 unresolved라면 2018년 이후 개편명을 아래 별칭에 추가한다.
 */
const fs = require('fs');
const path = require('path');
const { feature } = require('topojson-client');

const ROOT = path.join(__dirname, '..');
const topo = JSON.parse(fs.readFileSync(path.join(__dirname, 'skorea-municipalities-2018-topo-simple.json'), 'utf8'));
const objKey = Object.keys(topo.objects)[0];
const fc = feature(topo, topo.objects[objKey]);

const hospitals = require(path.join(ROOT, 'public/data/hospital_locations.json'));
const hospitalList = Array.isArray(hospitals) ? hospitals : hospitals.locations || hospitals;
const addrList = [...new Set(hospitalList.map((h) => h.addr_hint))];

// ---- 분구된 시(고양시덕양구 등)를 부모 시 이름으로 묶는다 ----
const groups = new Map();
for (const f of fc.features) {
  const name = f.properties.name;
  const code = f.properties.code;
  const m = name.match(/^(.+시)(.+구)$/);
  const key = m ? m[1] : name;
  if (!groups.has(key)) groups.set(key, { codePrefixes: new Set(), features: [] });
  const g = groups.get(key);
  g.codePrefixes.add(code.slice(0, 2));
  g.features.push(f);
}
// 2018년 이후 개편/오타로 이름이 달라진 것들의 별칭
groups.set('세종특별자치시', groups.get('세종시'));
groups.set('미추홀구', groups.get('남구')); // 인천 남구 -> 미추홀구 개칭, 아래서 지역코드로 확정
groups.set('진구', groups.get('부산진구')); // hospital_locations.json 원본 데이터의 오타

// ---- addr_hint의 "province city" 쌍 중 city 이름이 유일한 것들로 지역코드(2자리) -> 도 이름을 역산 ----
const cityNameToProvinces = new Map();
for (const addr of addrList) {
  const [prov, city0] = addr.split(' ');
  const key = city0 || addr;
  if (!cityNameToProvinces.has(key)) cityNameToProvinces.set(key, new Set());
  cityNameToProvinces.get(key).add(prov);
}
const codeToProvince = new Map();
for (const addr of addrList) {
  const [prov, city0] = addr.split(' ');
  const city = city0 || addr;
  const g = groups.get(city);
  if (!g) continue;
  if (cityNameToProvinces.get(city).size === 1 && g.codePrefixes.size === 1) {
    const cp = [...g.codePrefixes][0];
    if (!codeToProvince.has(cp)) codeToProvince.set(cp, prov);
  }
}
const provinceToCode = new Map([...codeToProvince].map(([c, p]) => [p, c]));

// ---- 각 addr_hint를 feature 목록으로 확정한다 ----
const resolved = new Map();
const unresolved = [];
for (const addr of addrList) {
  const [prov, city0] = addr.split(' ');
  const city = city0 || addr;
  const g = groups.get(city);
  if (!g) {
    unresolved.push(addr);
    continue;
  }
  if (g.codePrefixes.size === 1) {
    resolved.set(addr, g.features);
    continue;
  }
  // 여러 도에 같은 이름(중구/서구/동구/남구/북구/강서구 등)이 있으면 도 코드로 확정
  const expectedCp = provinceToCode.get(prov);
  const filtered = g.features.filter((f) => f.properties.code.slice(0, 2) === expectedCp);
  if (filtered.length) resolved.set(addr, filtered);
  else unresolved.push(addr);
}

console.log(`resolved ${resolved.size} / ${addrList.length}`);
if (unresolved.length) console.log('UNRESOLVED (need alias/그룹핑 추가):', unresolved);

function collectRings(features) {
  const rings = [];
  for (const f of features) {
    const geom = f.geometry;
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    for (const poly of polys) rings.push(poly[0]); // 외곽선만 사용, 구멍(섬 안 호수 등)은 실루엣 용도라 무시
  }
  return rings;
}
// (shoelace 공식) 링의 면적 - 어느 링이 "본토"인지 가려낼 때 쓴다.
function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** 부속 섬 때문에 대표점이 바다로 밀리지 않도록 가장 큰 육지 링을 고른다. */
function mainlandRing(rings) {
  return rings.reduce((best, ring) => (ringArea(ring) > ringArea(best) ? ring : best), rings[0]);
}

// bbox 중심보다 육지에 있을 확률이 높은 다각형 무게중심.
function ringCentroid(ring) {
  let a6 = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    const cross = x1 * y2 - x2 * y1;
    a6 += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  const a = a6 / 2;
  if (Math.abs(a) < 1e-12) return ring[0];
  return [cx / (6 * a), cy / (6 * a)];
}

// Ray casting으로 점이 링 내부인지 검사한다.
function pointInRing([px, py], ring) {
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

/** 무게중심이 바다에 있으면 격자 내부점 중 가장 가까운 점을 반환한다. */
function landPointOfRing(ring) {
  const centroid = ringCentroid(ring);
  if (pointInRing(centroid, ring)) return centroid;

  let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
  for (const [lon, lat] of ring) {
    if (lon < lonMin) lonMin = lon;
    if (lon > lonMax) lonMax = lon;
    if (lat < latMin) latMin = lat;
    if (lat > latMax) latMax = lat;
  }

  const GRID = 60;
  let best = null;
  let bestDist = Infinity;
  for (let i = 0; i <= GRID; i++) {
    const lon = lonMin + ((lonMax - lonMin) * i) / GRID;
    for (let j = 0; j <= GRID; j++) {
      const lat = latMin + ((latMax - latMin) * j) / GRID;
      const pt = [lon, lat];
      if (!pointInRing(pt, ring)) continue;
      const d = (lon - centroid[0]) ** 2 + (lat - centroid[1]) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = pt;
      }
    }
  }
  // 극단적으로 얇은 지형에서도 값은 유지해 라운드 생성을 보장한다.
  return best ?? centroid;
}

const outDir = path.join(ROOT, 'public/data/city_outlines');
fs.mkdirSync(outDir, { recursive: true });

// 도별 도시 목록과 대표점을 묶은 위치 퀴즈 인덱스.
const provinces = {};
const centers = {};
for (const [addr, features] of resolved) {
  const rings = collectRings(features);
  const prov = addr.split(' ')[0];
  (provinces[prov] ??= []).push(addr);
  // 다도해 지역에서도 바다를 피하도록 가장 큰 링의 육지점을 쓴다.
  const [lng, lat] = landPointOfRing(mainlandRing(rings));
  centers[addr] = {
    lat: Math.round(lat * 1e5) / 1e5,
    lng: Math.round(lng * 1e5) / 1e5,
  };
}
fs.writeFileSync(path.join(outDir, '_regions.json'), JSON.stringify({ provinces, centers }));
console.log(`wrote _regions.json (${Object.keys(provinces).length} provinces, ${Object.keys(centers).length} city centers)`);
