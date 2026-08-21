/**
 * "가장 가까운 위탁병원 찾기" 게임의 시/군/구 목록 + 대표 위치점(`_regions.json`)을
 * 만든다 - 라운드마다 지역을 뽑고, 그 안의 동을 무작위로 골라 원점으로 쓰고
 * (`LocationGame.tsx`), 오답 후보 병원이 어느 도에 속하는지 판단할 때 쓴다.
 *
 * 원래는 시/군/구를 확대해서 보여주는 지도 기능(개별 경계선 파일 + manifest)이
 * 있었는데, 그 화면이 "시/군 전체를 보여주면 후보가 다 그 안에 들어와 판단
 * 근거가 없다"는 이유로 도(道) 배경 + 동(洞) 강조 방식으로 바뀌면서
 * 필요 없어졌다(사용자 확인: "이거 이제 필요없는거야?" - 코드에서 실제로
 * 참조가 없음을 확인 후 제거) - 그래서 이 스크립트는 이제 `_regions.json`만
 * 만든다. 시/군/구 경계선 자체(도 배경용)는 `build-province-outlines.cjs`가
 * 이 스크립트와 같은 municipalities 데이터에서 도 단위로 합쳐 만든다.
 *
 * 앱 런타임에서는 실행되지 않고, `public/data/hospital_locations.json`이
 * 바뀌어 새 지역이 추가될 때만 다시 돌리면 된다.
 *
 * 데이터 출처: southkorea/southkorea-maps 저장소의 2018년 시군구
 * TopoJSON(WGS84, 이미 위경도 좌표계라 별도 좌표변환 불필요).
 *   https://github.com/southkorea/southkorea-maps
 *   raw: kostat/2018/json/skorea-municipalities-2018-topo-simple.json
 * `skorea-municipalities-2018-topo-simple.json`으로 이 폴더에 받아두었다 -
 * 새로 받으려면 위 raw URL을 그대로 다시 받으면 된다.
 *
 * 실행: `node scripts/build-city-outlines.cjs` (app/ 안에서, topojson-client가
 * devDependency로 설치되어 있어야 한다).
 *
 * 데이터셋이 2018년 기준이라 이후 행정구역 개편과는 이름이 다를 수 있어
 * (강원도→강원특별자치도, 전라북도→전북특별자치도, 인천 남구→미추홀구 등),
 * `hospital_locations.json`의 `addr_hint`와 맞춰주는 별칭 처리를 해 둔다. 새
 * 지역이 "unresolved"로 나오면 이 파일의 alias/그룹핑 로직에 케이스를 추가할 것.
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

/** 여러 링(본토 + 부속 도서) 중 면적이 가장 큰 것 - "위치" 표시용 중심점은
 * 이 본토 링만 기준으로 잡아야, 제주시(추자도 포함)처럼 멀리 떨어진 작은
 * 부속 섬이 bbox를 바다 쪽으로 끌고 가 중심점이 엉뚱한 해상에 찍히는 문제가
 * 생기지 않는다. */
function mainlandRing(rings) {
  return rings.reduce((best, ring) => (ringArea(ring) > ringArea(best) ? ring : best), rings[0]);
}

// 다각형 무게중심(signed area 가중 평균) - bbox 중심보다 실제 육지 위에 있을
// 확률이 훨씬 높다(오목한 해안선이라도 무게중심은 대체로 뭍 쪽으로 쏠림).
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

// ray casting - 점이 링(외곽선) 내부에 있는지. 신안군처럼 극단적으로 잘게
// 갈라진 다도해 섬은 무게중심조차 뭍 대신 만 안쪽 바다에 찍힐 수 있어서,
// 이 검사로 걸러내고 링 위의 실제 꼭짓점으로 대체한다(아래 landPointOfRing).
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

/** 반드시 그 링(육지) 안에 있는 점 하나 - 무게중심이 만이나 굴곡(사천시의
 * 사천만처럼 해안선이 심하게 갈라진 경우) 때문에 바다에 찍히면, bbox 안을
 * 격자로 훑어 실제로 링 "내부"인 점들 중 무게중심에 가장 가까운 점으로
 * 대체한다. (꼭짓점은 경계선 "위"라 판정이 애매해서 대신 쓰지 않는다 -
 * 격자점은 확실히 내부인 점만 후보로 삼는다.) 격자를 촘촘히 할수록 정확하지만
 * 빌드 1회성 스크립트라 정확도를 우선한다. */
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
  // 격자에서도 못 찾으면(극단적으로 얇은 지형) 무게중심을 그대로 쓴다 -
  // 바다에 찍힐 위험은 있지만 못 찾는 경우는 없어야 하며, 값이라도 있어야
  // 라운드가 아예 깨지지 않는다.
  return best ?? centroid;
}

const outDir = path.join(ROOT, 'public/data/city_outlines');
fs.mkdirSync(outDir, { recursive: true });

// ---- 도(道) 단위 4지선다 위치퀴즈용 인덱스 ----
// 라운드마다 "같은 도 안의 다른 도시들"을 오답 후보로 뽑으려면 시/군/구
// 230개를 전부 fetch하지 않고도 (1) 어느 도에 어떤 도시들이 있는지,
// (2) 각 도시의 대략적 위치(중심점)를 알아야 한다.
const provinces = {};
const centers = {};
for (const [addr, features] of resolved) {
  const rings = collectRings(features);
  const prov = addr.split(' ')[0];
  (provinces[prov] ??= []).push(addr);
  // bbox 중심이 아니라, 본토 링(위 mainlandRing) 위의 실제 육지 점(landPointOfRing)을
  // 쓴다 - bbox 중심은 신안군처럼 잘게 갈라진 다도해에서 만 안쪽 바다에 찍힐 수 있다.
  const [lng, lat] = landPointOfRing(mainlandRing(rings));
  centers[addr] = {
    lat: Math.round(lat * 1e5) / 1e5,
    lng: Math.round(lng * 1e5) / 1e5,
  };
}
fs.writeFileSync(path.join(outDir, '_regions.json'), JSON.stringify({ provinces, centers }));
console.log(`wrote _regions.json (${Object.keys(provinces).length} provinces, ${Object.keys(centers).length} city centers)`);
