/**
 * 위치 게임의 도(道) 단위 배경 경계를 만든다.
 * 섬 누락을 피하려고 별도 도 데이터 대신 검증된 시/군 경계를 도별로 합친다.
 * 실행: app/에서 `node scripts/build-province-outlines.cjs`.
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

// 병원 데이터에 있는 시/군 링을 도 단위로 합친다.
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
fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`wrote ${Object.keys(output).length} provinces -> ${outPath} (${Math.round(fs.statSync(outPath).size / 1024)} KB)`);
