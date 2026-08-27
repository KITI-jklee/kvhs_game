/**
 * 위치 게임에서 강조할 읍/면/동 경계 데이터를 만든다.
 * 출처: southkorea/southkorea-maps의 2018년 읍면동 TopoJSON(WGS84).
 * 7자리 동 코드는 앞 5자리 시/군 코드로 `addr_hint`에 연결한다.
 * 실행: app/에서 `node scripts/build-dong-outlines.cjs`.
 */
const fs = require('fs');
const path = require('path');
const { feature } = require('topojson-client');

const ROOT = path.join(__dirname, '..');

// ---- 시/군 쪼개기·별칭 로직은 build-city-outlines.cjs와 동일 ----
const cityTopo = JSON.parse(fs.readFileSync(path.join(__dirname, 'skorea-municipalities-2018-topo-simple.json'), 'utf8'));
const cityObjKey = Object.keys(cityTopo.objects)[0];
const cityFc = feature(cityTopo, cityTopo.objects[cityObjKey]);

const hospitals = require(path.join(ROOT, 'public/data/hospital_locations.json'));
const hospitalList = Array.isArray(hospitals) ? hospitals : hospitals.locations || hospitals;
const addrList = [...new Set(hospitalList.map((h) => h.addr_hint))];

const groups = new Map();
for (const f of cityFc.features) {
  const name = f.properties.name;
  const code = f.properties.code;
  const m = name.match(/^(.+시)(.+구)$/);
  const key = m ? m[1] : name;
  if (!groups.has(key)) groups.set(key, { codePrefixes: new Set(), features: [] });
  const g = groups.get(key);
  g.codePrefixes.add(code.slice(0, 2));
  g.features.push(f);
}
groups.set('세종특별자치시', groups.get('세종시'));
groups.set('미추홀구', groups.get('남구'));
groups.set('진구', groups.get('부산진구'));

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

const resolved = new Map(); // addr -> 시/군 feature 목록
for (const addr of addrList) {
  const [prov, city0] = addr.split(' ');
  const city = city0 || addr;
  const g = groups.get(city);
  if (!g) continue;
  if (g.codePrefixes.size === 1) {
    resolved.set(addr, g.features);
    continue;
  }
  const expectedCp = provinceToCode.get(prov);
  const filtered = g.features.filter((f) => f.properties.code.slice(0, 2) === expectedCp);
  if (filtered.length) resolved.set(addr, filtered);
}

// 같은 지역의 별칭도 보존해야 하므로 코드 하나에 여러 addr을 연결한다.
const addrsByCityCode = new Map();
for (const [addr, features] of resolved) {
  for (const f of features) {
    const code = f.properties.code;
    if (!addrsByCityCode.has(code)) addrsByCityCode.set(code, new Set());
    addrsByCityCode.get(code).add(addr);
  }
}

// ---- 읍/면/동 데이터 ----
const dongTopo = JSON.parse(fs.readFileSync(path.join(__dirname, 'skorea-submunicipalities-2018-topo-simple.json'), 'utf8'));
const dongObjKey = Object.keys(dongTopo.objects)[0];
const dongFc = feature(dongTopo, dongTopo.objects[dongObjKey]);
console.log(`읍/면/동 ${dongFc.features.length}개 로드`);

function collectRings(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  return polys.map((poly) => poly[0]); // 외곽선만, 구멍은 실루엣 용도라 무시
}

function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}
function mainlandRing(rings) {
  return rings.reduce((best, ring) => (ringArea(ring) > ringArea(best) ? ring : best), rings[0]);
}
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
  const GRID = 40; // 읍면동은 시/군보다 작아서 격자를 좀 덜 촘촘히 해도 충분함
  let best = null;
  let bestDist = Infinity;
  for (let i = 0; i <= GRID; i++) {
    const lon = lonMin + ((lonMax - lonMin) * i) / GRID;
    for (let j = 0; j <= GRID; j++) {
      const lat = latMin + ((latMax - latMin) * j) / GRID;
      if (!pointInRing([lon, lat], ring)) continue;
      const d = (lon - centroid[0]) ** 2 + (lat - centroid[1]) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = [lon, lat];
      }
    }
  }
  return best ?? centroid;
}

// 추자면은 제주 본섬보다 완도가 가까워 게임 기대와 어긋나므로 제외한다.
const EXCLUDED_DONGS = new Set(['제주특별자치도 제주시:추자면']);

const byAddr = new Map();
let unmatched = 0;
for (const f of dongFc.features) {
  const cityCode = f.properties.code.slice(0, 5);
  const addrs = addrsByCityCode.get(cityCode);
  if (!addrs) {
    unmatched++;
    continue;
  }
  if ([...addrs].some((addr) => EXCLUDED_DONGS.has(`${addr}:${f.properties.name}`))) continue;
  const rings = collectRings(f.geometry);
  const [lng, lat] = landPointOfRing(mainlandRing(rings));
  const roundedRings = rings.map((ring) => ring.map(([lon, la]) => [Math.round(lon * 1e5) / 1e5, Math.round(la * 1e5) / 1e5]));
  const entry = {
    name: f.properties.name,
    center: { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 },
    rings: roundedRings,
  };
  for (const addr of addrs) {
    if (!byAddr.has(addr)) byAddr.set(addr, []);
    byAddr.get(addr).push(entry);
  }
}
console.log(`매칭됨: ${dongFc.features.length - unmatched} / ${dongFc.features.length} (미매칭 ${unmatched}개는 hospital_locations.json에 없는 시/군 소속)`);

const zeroDongAddrs = [...resolved.keys()].filter((addr) => !byAddr.has(addr));
if (zeroDongAddrs.length) console.log('동 데이터 0개인 addr(도로 인식 실패 가능성):', zeroDongAddrs);

const output = Object.fromEntries(byAddr);
const outPath = path.join(ROOT, 'public/data/dong_outlines.json');
fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
const totalDongs = Object.values(output).reduce((n, arr) => n + arr.length, 0);
console.log(`wrote dong_outlines.json - ${Object.keys(output).length}개 시/군, 동 ${totalDongs}개, ${Math.round(fs.statSync(outPath).size / 1024)} KB -> ${outPath}`);
