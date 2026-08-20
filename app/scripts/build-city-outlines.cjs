/**
 * 보훈병원 위치감각게임(FR-G1) 시/군/구 확대 지도용 경계 데이터를 만든다.
 *
 * 배경: 전국 지도 한 장으로는 병원 위치를 정밀하게 찍기 어렵다는 사용자 피드백에
 * 따라, 라운드마다 병원이 속한 시/군/구만 확대해서 보여준다(`LocationGame.tsx` +
 * `lib/cityOutline.ts` + `lib/geo.ts`의 `boundsForRegion`/`createProjection`).
 * 이 스크립트는 그 확대 지도에 쓸 실제 시/군/구 경계선을 만드는 1회성 빌드
 * 도구다 - 앱 런타임에서는 실행되지 않고, `public/data/hospital_locations.json`이
 * 바뀌어 새 지역이 추가될 때만 다시 돌리면 된다.
 *
 * 데이터 출처: southkorea/southkorea-maps 저장소의 2018년 시군구
 * TopoJSON(WGS84, 이미 위경도 좌표계라 별도 좌표변환 불필요).
 *   https://github.com/southkorea/southkorea-maps
 *   raw: kostat/2018/json/skorea-municipalities-2018-topo-simple.json
 * `skorea-municipalities-2018-topo-simple.json`으로 이 폴더에 받아두었다 -
 * 새로 받으려면 위 raw URL을 그대로 다시 받으면 된다.
 *
 * 실행: `node scripts/build-city-outlines.js` (app/ 안에서, topojson-client가
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
function bboxOfRings(rings) {
  let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (lon < lonMin) lonMin = lon;
      if (lon > lonMax) lonMax = lon;
      if (lat < latMin) latMin = lat;
      if (lat > latMax) latMax = lat;
    }
  }
  return { lonMin, lonMax, latMin, latMax };
}

const outDir = path.join(ROOT, 'public/data/city_outlines');
fs.mkdirSync(outDir, { recursive: true });
// 파일명은 원문(한글) 그대로 저장한다. percent-encoding한 문자열을 파일명으로
// 쓰면 디스크상 실제 이름이 "%EC%..." 리터럴이 되어, 브라우저가 URL을 디코드해
// 찾는 fetch 경로와 어긋나 404 -> SPA fallback(index.html)이 돌아온다.
const manifest = {};
let totalBytes = 0;
for (const [addr, features] of resolved) {
  const rings = collectRings(features);
  const bbox = bboxOfRings(rings);
  const roundedRings = rings.map((ring) => ring.map(([lon, lat]) => [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5]));
  const payload = JSON.stringify({ bbox, rings: roundedRings });
  const filename = `${addr}.json`;
  fs.writeFileSync(path.join(outDir, filename), payload);
  manifest[addr] = filename;
  totalBytes += payload.length;
}
fs.writeFileSync(path.join(outDir, '_manifest.json'), JSON.stringify(manifest));
console.log(`wrote ${Object.keys(manifest).length} city outline files, ${Math.round(totalBytes / 1024)} KB total -> ${outDir}`);
