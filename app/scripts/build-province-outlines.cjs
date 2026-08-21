/**
 * "가장 가까운 위탁병원 찾기" 게임의 지도 배경용 도(道) 단위 경계 데이터를 만든다.
 *
 * 배경: 병원 후보는 실제 최단거리 기준으로 뽑히기 때문에 종종 시작 지점의
 * 시/군/구 경계 밖(이웃 시/군, 드물게 이웃 도)에 위치한다. 시작 지점이 속한
 * 시/군 경계만 배경으로 그리면 그 밖의 후보가 빈 그리드 위에 덩그러니 떠
 * 있는 것처럼 보인다 - 그래서 배경은 시/군이 아니라 도 단위로 그린다.
 *
 * 원래는 별도의 "도" 단위 TopoJSON(skorea-provinces-2018-topo-simple.json)을
 * 썼는데, 그 데이터셋 자체가 부산 영도구처럼 다리로만 연결된 작은 섬을
 * 통째로 빼먹은 게 있었다(사용자 피드백: "왜 바다처럼 나오는거야?" - 동삼3동
 * 강조 영역이 진짜 배경 땅 없이 빈 바다 위에 떠 있었음) - 단순화 과정에서
 * 누락된 것으로 보인다. 그래서 이미 시/군 단위로 검증해 둔
 * `build-city-outlines.cjs`의 시/군 경계(skorea-municipalities-2018-topo-simple.json,
 * 영도구 포함해서 정상 확인됨)를 도 단위로 합쳐서 배경을 만든다 - 시/군을
 * 다 모으면 그 도가 되므로 별도 데이터셋이 필요 없고, 누락도 없다.
 *
 * 실행: `node scripts/build-province-outlines.cjs` (app/ 안에서).
 */
const fs = require('fs');
const path = require('path');
const { feature } = require('topojson-client');

const ROOT = path.join(__dirname, '..');
const topo = JSON.parse(fs.readFileSync(path.join(__dirname, 'skorea-municipalities-2018-topo-simple.json'), 'utf8'));
const objKey = Object.keys(topo.objects)[0];
const fc = feature(topo, topo.objects[objKey]);

// ---- 시/군 쪼개기·별칭 로직은 build-city-outlines.cjs와 동일 ----
const hospitals = require(path.join(ROOT, 'public/data/hospital_locations.json'));
const hospitalList = Array.isArray(hospitals) ? hospitals : hospitals.locations || hospitals;
const addrList = [...new Set(hospitalList.map((h) => h.addr_hint))];

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

function collectRings(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  return polys.map((poly) => poly[0]); // 외곽선만, 구멍은 실루엣 용도라 무시
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

// addr(시/군)들을 도 단위로 묶어 그 도에 속한 모든 시/군의 링을 합친다.
// hospital_locations.json에 실린 addr만 다루므로, 실제로 배경으로 그려질
// 도들은 전부 빠짐없이 커버된다.
const ringsByProvince = new Map();
for (const [addr, features] of resolved) {
  const prov = addr.split(' ')[0];
  if (!ringsByProvince.has(prov)) ringsByProvince.set(prov, []);
  const bucket = ringsByProvince.get(prov);
  for (const f of features) bucket.push(...collectRings(f.geometry));
}

const output = {};
for (const [prov, rings] of ringsByProvince) {
  const roundedRings = rings.map((ring) => ring.map(([lon, lat]) => [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5]));
  output[prov] = { bbox: bboxOfRings(roundedRings), rings: roundedRings };
}

const outPath = path.join(ROOT, 'public/data/province_outlines.json');
fs.writeFileSync(outPath, JSON.stringify(output));
console.log(`wrote ${Object.keys(output).length} provinces -> ${outPath} (${Math.round(fs.statSync(outPath).size / 1024)} KB)`);
