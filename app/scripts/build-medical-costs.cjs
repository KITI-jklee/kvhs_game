/**
 * "의료비 감각 테스트"(게임②, 구 "찐병원 가짜병원")용 비급여 항목 데이터를
 * 만든다.
 *
 * 원본(`../../data/suga_보훈병원_비급여수가정보.json`, 5,077건)은 실제 항목명이
 * 영문 병기·괄호·슬래시가 섞여 있어 그대로 쓰면 게임 카드에 나오는 이름이
 * 지저분하다(예: "MRI Abdomen　[테슬라1.5-3.0미만+품질관리적합]"). 자동
 * 필터링만으로는 "복부 MRI"처럼 깔끔한 이름을 만들기 어려워서, 대신 실제
 * 원본 레코드에서 가격만 그대로 가져오고 화면에 보여줄 이름은 직접 다듬어
 * 큐레이션했다 - 가격은 100% 실제 공개 데이터, 이름만 사람이 다시 썼다.
 *
 * 항목은 슬라이더/가격대/순서 맞추기/예산/하이로우 5개 라운드에 두루 쓰이므로
 * 가격이 1.5만원~120만원 사이에 넓게 퍼지도록, 그리고 영상진단·검사·예방접종·
 * 치과·처치·입원·한방 등 카테고리가 고르게 섞이도록 골랐다.
 *
 * 실행: `node scripts/build-medical-costs.cjs` (app/ 안에서).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const raw = require(path.join(ROOT, '..', 'data', 'suga_보훈병원_비급여수가정보.json'));

// { 화면에 보여줄 이름, 원본 데이터에서 찾을 실제 항목명, 카테고리 } - cost는
// rawName으로 원본에서 직접 찾아온다(하드코딩 없이 실제 데이터와 항상 맞물림).
const CURATED = [
  ['복부 MRI', 'MRI Abdomen　[테슬라3.0이상+품질관리적합]', '영상진단'],
  ['뇌 MRI', 'MRI Brain Diffusion　[단독촬영]', '영상진단'],
  ['종합검진 PET-CT', '토르소+뇌 PET-CT 촬영(종합검진용)', '영상진단'],
  ['뇌혈류 초음파', '진단초음파-혈관-뇌혈류', '초음파'],
  ['연부조직 초음파(정밀)', '진단초음파-연부조직-정밀', '초음파'],
  ['연부조직 초음파(일반)', '진단초음파-연부조직-일반', '초음파'],
  ['하지혈관 초음파', '진단초음파-혈관-(하지 정맥류 검사를 실시)사지혈관 도플러', '초음파'],
  ['기본 초음파(단순)', '기본초음파-단순초음파(Ⅰ)', '초음파'],
  ['수면다원검사', '수면다원검사', '검사'],
  ['간이 수면검사(코골이)', '코골이검사(간이수면다원검사)', '검사'],
  ['간섬유화검사', '간섬유화검사(Liver Fibroscan)', '검사'],
  ['안구광학단층촬영', '안구광학단층촬영OCT [편측]', '검사'],
  ['자궁경부암 예방접종', '가다실 9 프리필드시린지(자궁경부암 백신)', '예방접종'],
  ['대상포진 예방접종', '조스타박스주(대상포진생바이러스백신)', '예방접종'],
  ['폐렴구균 예방접종', '[성인]폐렴구균(프리베나 13주:와이어스)-예방접종', '예방접종'],
  ['인플루엔자 예방접종', '보령플루Ⅷ테트라백신주(인플루엔자분할백신)', '예방접종'],
  ['완전틀니(레진)', 'F.D., resin plate,G (완전틀니-레진)', '치과'],
  ['세라믹 크라운', '캐드캠 세라믹 크라운', '치과'],
  ['기성 금관', '기성금관', '치과'],
  ['광중합 레진 충전', '광중합형 복합레진 충전 (1치당 1면, 2면, 3면이상)', '치과'],
  ['임플란트 상악동거상술', '임플란트목적/상악동거상술(편측)', '치과'],
  ['도수치료(1일)', '도수치료 [1일당]', '처치'],
  ['체외충격파치료', '체외충격파치료[근골격계질환]', '처치'],
  ['코골이수술(고주파)', '코골이수술-고주파온열이용(Somnoplasty)', '처치'],
  ['하지정맥류 레이저폐쇄술', '하지정맥류레이저정맥폐쇄술', '처치'],
  ['전산화 인지재활치료', '전산화인지 재활치료', '처치'],
  ['1인실 입원료(1일)', '입원료(1인실:병실차액)-내소정 입원료', '입원'],
  ['약침술', '약침술', '한방'],
];

function findCost(rawName) {
  const hit = raw.find((r) => r.name === rawName && typeof r.cost === 'number' && r.cost > 0);
  return hit ? hit.cost : null;
}

const items = [];
const missing = [];
CURATED.forEach(([name, rawName, category], i) => {
  const cost = findCost(rawName);
  if (cost === null) {
    missing.push(rawName);
    return;
  }
  items.push({ id: `mc_${String(i + 1).padStart(3, '0')}`, name, cost, category });
});

if (missing.length) {
  console.error('원본에서 못 찾은 항목:', missing);
  process.exit(1);
}

const outPath = path.join(ROOT, 'public/data/medical_costs.json');
fs.writeFileSync(outPath, JSON.stringify(items));
console.log(`wrote ${items.length} medical cost items -> ${outPath}`);
console.log('가격 범위:', Math.min(...items.map((i) => i.cost)), '~', Math.max(...items.map((i) => i.cost)));
