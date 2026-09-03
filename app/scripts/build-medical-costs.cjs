/**
 * Build a readable, deduplicated medical-cost quiz pool from the public source.
 * Run from app/: node scripts/build-medical-costs.cjs
 * 검토 파일 생성: node scripts/build-medical-costs.cjs --review
 *
 * 이 스크립트는 1차 후보와 검토 자료만 만든다. 사람이 확정한
 * ../data/medical_costs_base.json과 배포용 public/data/medical_costs.json은
 * 덮어쓰지 않는다 - 원본 데이터도
 * 스크립트 자체도 안 바뀌었는데 결과가 다르다. 이유는 확인됐다: 이 스크립트(Codex가
 * 작성)의 출력은 "1차 후보 풀"일 뿐이고, 실제 배포본은 그 후 별도의 긴 Claude Code
 * 세션(세션명 "카드 짝맞추기 게임 첫 라운드 레이아웃", 2026-08-25)에서 100턴 넘게
 * 대화하며 이상한 표기·중복·과도하게 세분화된 항목(테슬라 스펙별 MRI, 입원료 신구
 * 코드 중복 등)을 사람이 하나하나 검토해 555건까지 수동으로 골라낸 결과다 - 이
 * 스크립트의 필터 규칙만으로는 재현이 안 된다. 그 555건에서 이후 다시 소수 항목만
 * (예: "즉시 or 임시폐쇄장치"의 "or"→"또는" 표기 수정, 성기·성기능을 직접 지칭하는
 * 노골적 항목 11건 제거) 손으로 추가 수정하고 중복을 병합해 기준 540건이 됐다.
 * 따라서 이 스크립트를 재실행해도 수동 큐레이션 파일은 보존한다. 후보를
 * REVIEW_CSV_PATH에서 다시 검토해 필요한 항목만
 * 골라 반영해야 한다. 그 검토를 실제로 어떤 기준·순서로 했는지는
 * ../../docs/medical_costs_curation_guide.md 에 재현 가능하게 정리해뒀다 -
 * 재검토를 다시 하게 되면 이 문서부터 읽을 것.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE_PATH = path.join(ROOT, '..', 'data', 'suga_보훈병원_비급여수가정보.json');
const REVIEW_CSV_PATH = path.join(ROOT, '..', 'docs', 'medical_costs_review.csv');
const SUMMARY_PATH = path.join(ROOT, '..', 'docs', 'medical_costs_summary.md');
const WRITE_REVIEW = process.argv.includes('--review');

// These limits match the current logarithmic slider used by game 2.
const MIN_COST = 10_000;
const MAX_COST = 1_200_000;
const MIN_FINAL_ITEMS = 100;

const EXCLUDED_BIG_CATEGORIES = new Set(['제증명수수료', '제증명료', '치료재료']);
const EXCLUDED_NAME_PATTERNS = [
  /^(기타|재료대|약제비|처치료|검사료|수술료|시술료|치료비|검사비)$/,
  /(제증명|진단서|확인서|소견서|사본|복사|복사비|CD\s*(copy|복사)?|영상복사)/i,
  /(부가세|VAT|비급여|비감면|감면|국비|본인부담|별도|산정|수가|원내|처방|재료대)/i,
  /(유전자|염색체|분자병리|중합효소|대립유전자|면역글로불린|핵산증폭|세포병리|항[A-Z0-9]+항체)/i,
  /\d+(\.\d+)?\s*(ml|mg|mcg|iu|vial|syringe|cc|cm|mm|fr|ea|box)\b/i,
  /(단체협약|VIP|숙박형|원폭피해|치료\s*보조기구)/i,
  // 가벼운 아케이드 게임에서 큰 글씨로 보여주기엔 과하게 노골적인 성기·
  // 성기능 직접 지칭 항목만 제외한다(유방암·자궁경부암 검진, 요실금,
  // 전립선 MRI 같은 보편적 건강검진 주제는 성적인 내용이 아니므로 남긴다).
  /(생식기|음경|음낭|발기능|사정력|소음순\s*절제)/,
];

// A category cap prevents hundreds of MRI, ultrasound, and dental variants from
// crowding out the rest of the game. It is a ceiling, not a target to fill.
const CATEGORY_LIMITS = {
  치과: 160,
  '처치·수술': 160,
  MRI: 120,
  검사: 160,
  초음파: 120,
  '예방접종·주사': 100,
  '물리·재활치료': 80,
  영상진단: 80,
  입원: 50,
  한방: 50,
};

const CATEGORY_RULES = [
  ['MRI', /자기공명|\bMRI\b/i],
  ['초음파', /초음파|ultra\s*sound/i],
  ['치과', /치과|치아|치석|틀니|임플란트|크라운|레진|보철|교정|충전|근관/],
  ['예방접종·주사', /예방접종|백신|vaccin|주사료|주사제/i],
  ['물리·재활치료', /물리치료|재활|도수치료|이학요법|충격파|운동치료/],
  ['영상진단', /영상진단|방사선|촬영|\bCT\b|PET[- ]?CT|X[- ]?ray/i],
  ['검사', /검사|검진|내시경|기능검사|병리|진단검사/],
  ['입원', /입원|병실|상급병실/],
  ['한방', /한방|침술|약침|추나|부항/],
  ['처치·수술', /처치|수술|시술|마취|레이저|절제|봉합|치료/],
  ['약제', /약제|약품/],
];

function compact(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[ㆍ·]/g, '·')
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*([,;:/()[\]{}+])\s*/g, '$1')
    .trim();
}

function displayName(value) {
  return compact(value)
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/<[^>]*>|\/?td>/gi, '')
    // These suffixes are billing notes, not part of the medical item name.
    .split(/\s+(?:주:|미용\s*목적|국비\s*대상|국비\/|감면\s*환자)/)[0]
    .replace(/^[-·,;:/]+|[-·,;:/]+$/g, '')
    .replace(/\(([A-Za-z][^()]*)\)/g, '')
    .replace(/\s*\/\s*[A-Za-z][A-Za-z0-9 ,.+()\-[\]]{3,}$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function comparisonName(value) {
  return displayName(value)
    .toLowerCase()
    .replace(/[\s.,;:'"`~!@#$%^&*_=+|\\/()[\]{}<>?-]/g, '');
}

function simplifyGameName(value, category) {
  let name = value
    .replace(/\s*[-([]?\s*비급여\s*[)\]]?\s*$/i, '')
    .replace(/\((?:테슬라\s*)?3\.0\s*이상[^)]*\)/g, '')
    .replace(/\[(?:테슬라\s*)?3\.0\s*이상[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (category === 'MRI') {
    name = name
      .replace(/자기공명영상(?:진단)?[- ]*/g, '')
      .replace(/-?조영제\s*주입\s*전\s*[,/?·]?\s*후\s*촬영판독/g, ' MRI(조영제)')
      .replace(/-일반$/g, ' MRI(일반)');
    if (!/MRI/i.test(name)) name = `${name} MRI`;
  }

  return name.replace(/\s+/g, ' ').trim();
}

function categoryFor(row, name) {
  const source = [row.kind_big, row.kind_mid, row.kind_small, row.kind, name]
    .map(compact)
    .filter(Boolean)
    .join(' ');
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(source)) return category;
  }
  if (compact(row.kind_big) === '약제') return '약제';
  if (compact(row.kind_big) === '치료재료') return '치료재료';
  return '기타';
}

function isReadableName(name) {
  if (name.length < 3 || name.length > 45) return false;
  const koreanCount = (name.match(/[가-힣]/g) ?? []).length;
  if (koreanCount < 3) return false;
  if (EXCLUDED_NAME_PATTERNS.some((pattern) => pattern.test(name))) return false;
  const meaningful = name.replace(/[^가-힣A-Za-z0-9]/g, '');
  if (!meaningful) return false;
  const digits = (meaningful.match(/[0-9]/g) ?? []).length;
  if (digits / meaningful.length > 0.3) return false;
  const withoutCommonAbbreviations = meaningful.replace(/MRI|PETCT|CT|HPV|OCT/gi, '');
  const englishCount = (withoutCommonAbbreviations.match(/[A-Za-z]/g) ?? []).length;
  if (englishCount / Math.max(koreanCount + englishCount, 1) > 0.25) return false;
  return ([...name.matchAll(/[[(]/g)]).length <= 2;
}

function qualityScore(item) {
  const koreanCount = (item.name.match(/[가-힣]/g) ?? []).length;
  const englishCount = (item.name.match(/[A-Za-z]/g) ?? []).length;
  const priceRatio = item.maxCost / Math.max(item.minCost, 1);
  return Math.min(item.sampleCount, 5) * 6
    + Math.min(koreanCount, 20)
    - englishCount * 2
    - Math.max(0, item.name.length - 24)
    - Math.max(0, priceRatio - 1) * 5;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function roundPrice(value) {
  return Math.round(value / 100) * 100;
}

const raw = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8'));
const rejected = { invalidPrice: 0, category: 0, name: 0 };
const candidates = [];

for (const row of raw) {
  const cost = Number(row.cost);
  if (!Number.isFinite(cost) || cost < MIN_COST || cost > MAX_COST) {
    rejected.invalidPrice += 1;
    continue;
  }

  const bigCategory = compact(row.kind_big);
  if (!bigCategory || EXCLUDED_BIG_CATEGORIES.has(bigCategory)) {
    rejected.category += 1;
    continue;
  }

  const rawName = displayName(row.name);
  const category = categoryFor(row, rawName);
  const name = simplifyGameName(rawName, category);
  // Medicines are mostly product/volume records. Retain only recognizable
  // vaccination entries, and exclude vague catch-all categories entirely.
  if (!CATEGORY_LIMITS[category]
      || (bigCategory === '약제' && category !== '예방접종·주사')
      || !isReadableName(name)) {
    rejected.name += 1;
    continue;
  }

  candidates.push({ row, name, cost, category });
}

const groups = new Map();
for (const candidate of candidates) {
  const key = `${candidate.category}|${comparisonName(candidate.name)}`;
  const group = groups.get(key) ?? [];
  group.push(candidate);
  groups.set(key, group);
}

const groupedItems = [...groups.values()]
  .map((group) => {
    const names = [...new Set(group.map((entry) => entry.name))]
      .sort((a, b) => a.length - b.length || a.localeCompare(b, 'ko'));
    const costs = group.map((entry) => entry.cost);
    const codes = [...new Set(group.map((entry) => compact(entry.row.code)).filter(Boolean))];
    return {
      name: names[0],
      cost: roundPrice(median(costs)),
      category: group[0].category,
      minCost: Math.min(...costs),
      maxCost: Math.max(...costs),
      sampleCount: group.length,
      ...(codes.length === 1 ? { code: codes[0] } : {}),
    };
  });

const items = Object.entries(
  Object.groupBy(groupedItems, (item) => item.category),
)
  .flatMap(([category, categoryItems]) => categoryItems
    .sort((a, b) => qualityScore(b) - qualityScore(a) || a.name.localeCompare(b.name, 'ko'))
    .slice(0, CATEGORY_LIMITS[category]))
  .sort((a, b) => a.category.localeCompare(b.category, 'ko') || a.name.localeCompare(b.name, 'ko'))
  .map((item, index) => ({ id: `mc_${String(index + 1).padStart(4, '0')}`, ...item }));

if (items.length < MIN_FINAL_ITEMS) {
  throw new Error(`정제 결과가 ${items.length}건으로 목표(${MIN_FINAL_ITEMS}건)보다 적습니다.`);
}

const categoryCounts = Object.entries(
  items.reduce((counts, item) => {
    counts[item.category] = (counts[item.category] ?? 0) + 1;
    return counts;
  }, {}),
).sort((a, b) => b[1] - a[1]);

function csvCell(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

const csvHeader = ['ID', '분류', '표시 이름', '대표 가격', '최저 가격', '최고 가격', '통합 표본 수', '의료 코드'];
const csvRows = items.map((item) => [
  item.id,
  item.category,
  item.name,
  item.cost,
  item.minCost,
  item.maxCost,
  item.sampleCount,
  item.code ?? '',
]);
// BOM makes Korean text open correctly in Excel on Windows.
if (WRITE_REVIEW) {
  fs.writeFileSync(
    REVIEW_CSV_PATH,
    `\uFEFF${[csvHeader, ...csvRows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`,
    'utf8',
  );
}

const priceBands = [
  ['1만~5만원 미만', 10_000, 50_000],
  ['5만~10만원 미만', 50_000, 100_000],
  ['10만~30만원 미만', 100_000, 300_000],
  ['30만~60만원 미만', 300_000, 600_000],
  ['60만원 이상', 600_000, Number.POSITIVE_INFINITY],
].map(([label, min, max]) => [label, items.filter((item) => item.cost >= min && item.cost < max).length]);
const mergedItems = items.filter((item) => item.sampleCount > 1);
const wideRangeItems = items
  .filter((item) => item.sampleCount > 1 && item.maxCost / Math.max(item.minCost, 1) >= 3)
  .sort((a, b) => b.maxCost / b.minCost - a.maxCost / a.minCost);
const won = (value) => `${Number(value).toLocaleString('ko-KR')}원`;
const table = (rows) => rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
const summary = `# 의료비 게임 정제 데이터 요약

생성 명령: \`node app/scripts/build-medical-costs.cjs\`

## 전체 현황

| 항목 | 건수 |
| --- | ---: |
| 원본 | ${raw.length.toLocaleString('ko-KR')} |
| 가격·분류·이름 필터 통과 | ${candidates.length.toLocaleString('ko-KR')} |
| 최종 고유 항목 | ${items.length.toLocaleString('ko-KR')} |
| 여러 원본을 하나로 통합한 항목 | ${mergedItems.length.toLocaleString('ko-KR')} |

## 분류별 건수

| 분류 | 건수 | 비율 |
| --- | ---: | ---: |
${table(categoryCounts.map(([name, count]) => [name, count.toLocaleString('ko-KR'), `${(count / items.length * 100).toFixed(1)}%`]))}

## 대표 가격대별 건수

| 가격대 | 건수 | 비율 |
| --- | ---: | ---: |
${table(priceBands.map(([label, count]) => [label, count.toLocaleString('ko-KR'), `${(count / items.length * 100).toFixed(1)}%`]))}

## 우선 검토 권장 항목

아래는 같은 이름으로 합쳐진 원본 가격의 최고가가 최저가의 3배 이상인 항목입니다. 통합 기준이나 대표 가격을 사람이 먼저 확인하기 좋습니다.

| ID | 분류 | 이름 | 대표 가격 | 공개 범위 | 표본 수 |
| --- | --- | --- | ---: | ---: | ---: |
${table(wideRangeItems.map((item) => [item.id, item.category, item.name.replace(/\|/g, '\\|'), won(item.cost), `${won(item.minCost)}~${won(item.maxCost)}`, item.sampleCount])) || '| - | - | 해당 없음 | - | - | - |'}
`;
if (WRITE_REVIEW) {
  fs.writeFileSync(SUMMARY_PATH, summary, 'utf8');
}

console.log(`원본 ${raw.length}건 -> 후보 ${candidates.length}건 -> 고유 항목 ${items.length}건`);
console.log(`제외: 가격 ${rejected.invalidPrice}, 분류 ${rejected.category}, 이름 ${rejected.name}`);
console.log(`가격 범위: ${Math.min(...items.map((item) => item.cost))} ~ ${Math.max(...items.map((item) => item.cost))}`);
console.log(`분류: ${categoryCounts.map(([name, count]) => `${name} ${count}`).join(', ')}`);
if (WRITE_REVIEW) {
  console.log(`검토용 CSV: ${REVIEW_CSV_PATH}`);
  console.log(`요약 문서: ${SUMMARY_PATH}`);
}
