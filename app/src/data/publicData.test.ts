import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateLocations, validateMedicalCosts, validateTermPairs } from './validation';

function readPublicJson(name: string): unknown {
  return JSON.parse(readFileSync(resolve(process.cwd(), 'public', 'data', name), 'utf8'));
}

describe('배포용 정적 게임 데이터', () => {
  it('병원 위치 JSON이 런타임 계약을 만족한다', () => {
    expect(validateLocations(readPublicJson('hospital_locations.json')).length).toBeGreaterThanOrEqual(5);
  });

  it('의료비 JSON이 런타임 계약을 만족한다', () => {
    const costs = validateMedicalCosts(readPublicJson('medical_costs.json'));
    const pairs = validateTermPairs(readPublicJson('medical_term_pairs.json'));
    expect(costs.length).toBeGreaterThanOrEqual(12);
    expect(costs.every((item) => item.cost >= 10_000 && item.cost <= 1_200_000)).toBe(true);
    expect(costs.map(({ id, name, cost }) => ({
      id: id.replace(/^mc_/, 'term_'), item_name: name, cost,
    }))).toEqual(pairs.filter((pair) => pair.cost >= 10_000 && pair.cost <= 1_200_000)
      .map(({ id, item_name, cost }) => ({ id, item_name, cost })));
    expect(costs.filter((item) => item.id.startsWith('mc_extra_'))).toHaveLength(14);
  });

  it('용어 짝 JSON이 런타임 계약을 만족한다', () => {
    const pairs = validateTermPairs(readPublicJson('medical_term_pairs.json'));
    expect(pairs.length).toBeGreaterThanOrEqual(24);
    expect(pairs.filter((pair) => pair.item_name.includes('종합검진'))
      .every((pair) => pair.category === '종합검진')).toBe(true);
    expect(pairs.some((pair) => pair.category === '기타')).toBe(false);
    expect(pairs.filter((pair) => pair.id.startsWith('term_extra_'))).toHaveLength(24);
    expect(pairs.some((pair) => pair.cost > 1_200_000)).toBe(true);
    expect(pairs.some((pair) =>
      /주블리아\s*외용액|^(추가식대|보호자식대)|유구치|자율훈련/i.test(pair.item_name),
    )).toBe(false);
    expect(pairs.filter((pair) => /\bMRI\b/i.test(pair.item_name))
      .every((pair) => pair.category === 'MRI')).toBe(true);
    expect(pairs.find((pair) => pair.id === 'term_0643')?.item_name).toBe('고관절 MRI');
    expect(pairs.find((pair) => pair.id === 'term_0724')?.item_name).toBe('흉추 MRI');
    expect(pairs.find((pair) => pair.id === 'term_0691')?.item_name).toBe('안와 MRI');
    expect(pairs.filter((pair) => pair.item_name.includes('초음파'))
      .every((pair) => pair.category === '초음파')).toBe(true);
    expect(pairs.some((pair) => ['보철', '치과보철료', '치과의 보철료']
      .includes(pair.category))).toBe(false);
    expect(pairs.some((pair) => pair.category === '치과보철')).toBe(true);
    expect(pairs.filter((pair) => pair.item_name.includes('예방접종'))
      .every((pair) => pair.category === '예방접종')).toBe(true);
    expect(pairs.filter((pair) => pair.category.startsWith('예방접종'))
      .every((pair) => pair.category === '예방접종')).toBe(true);
    const deprecatedCategoryLabels = new Set([
      '검사료', '보조기류 (의치창 제작)', '물리치료료', '이학요법료',
      '기능검사료(시기능검사)', '기능 검사료(신경계기능검사)',
      '기능 검사료(평형 및 청각 기능검사)', '평형 및 청각기능검사',
      '기능 검사료(호흡기기능검사)', '기능 검사료(외피,근골 기능 검사)',
      '외피,근골기능검사', '기능검사료', '기능검사(기타)', '치과 처치',
      '치과 처치· 수술료', '치아질환 처치', '생식,임신 및 분만',
      '여성 생식기,임신과 분만', '1인실 입원료(병실차액)', '입원료',
      '처치 및 수술료', '처치 및 수술료(기타)', '처치 및 수술료(순환기)', '수술료',
      '내시경 천자 및 생검료', '감염증 기타 검사', '기타검사', '교육상담료',
      '방사선치료료', '약물 및 독물검사',
    ]);
    expect(pairs.some((pair) => deprecatedCategoryLabels.has(pair.category))).toBe(false);
    expect(pairs.filter((pair) => /^(1인실 추가요금|특실 입원료)/.test(pair.item_name))
      .every((pair) => pair.category === '상급병실료')).toBe(true);
    expect(pairs.find((pair) => pair.id === 'term_0097')).toMatchObject({
      item_name: '입체적 유방절제생검술',
      category: '검사',
    });
    expect(pairs.find((pair) => pair.id === 'term_0210')?.item_name)
      .toBe('디프테리아·파상풍·백일해 예방접종');
    expect(pairs.find((pair) => pair.id === 'term_0246')?.item_name)
      .toBe('디프테리아·파상풍·백일해·소아마비·뇌수막염 예방접종(펜탁심)');
    expect(pairs.find((pair) => pair.id === 'term_0283')?.item_name).toBe('난관 결찰술(양측)');
    expect(pairs.find((pair) => pair.id === 'term_0332')?.item_name).toBe('충수절제술');
    const reviewedNames = new Map([
      ['term_0002', '관절계를 이용한 무릎관절인대검사'],
      ['term_0003', '광범위 선천성대사이상검사-Y'],
      ['term_0008', '다중수면잠복기검사'],
      ['term_0012', '동적 균형 검사'],
      ['term_0005', '레이저 눈 계측검사(한쪽)'],
      ['term_0006', '레이저 눈 계측검사'],
      ['term_0116', '땀 분비 자율신경 검사'],
      ['term_0117', '정량적감각기능검사'],
      ['term_0153', '캘리포니아 언어학습검사'],
      ['term_0155', '침 분비·점도·산도 검사'],
      ['term_0157', '항뮬러관호르몬(AMH) 검사'],
      ['term_0158', '항뮬러관호르몬(AMH) 정밀검사'],
      ['term_0183', '기본 체외조사(2.5~5.0Gy 미만·1회당)'],
      ['term_0184', '기본 체외조사(2.5Gy 미만·1회당)'],
      ['term_0185', '기본 체외조사(5.0Gy 이상·1회당)'],
      ['term_0190', '안구 광학단층촬영'],
      ['term_0272', '반복적 경두개 자기자극술'],
      ['term_0273', '척추 신경 주변 유착 완화 시술'],
      ['term_0274', '풍선확장 척추 신경 주변 유착 완화 시술'],
      ['term_0294', '산부인과 충수절제술'],
      ['term_0295', '색소 레이저(소)'],
      ['term_0345', '하지정맥류 고주파 정맥내막 폐쇄술'],
      ['term_0488', '교합안정장치 관리'],
      ['term_0489', '턱관절 교합안정장치(단순)'],
      ['term_0490', '턱관절 교합안정장치(복잡)'],
      ['term_0525', '비변형 교정술(대)'],
      ['term_0526', '비변형 교정술(소)'],
      ['term_0527', '비변형 교정술(중)'],
      ['term_0532', '안면 체형'],
      ['term_0586', '치아 매식 진단료(단순)'],
      ['term_0587', '치아 매식 진단료(복잡)'],
      ['term_0630', '치과 자가 혈소판 풍부혈장(PRP) 치료'],
    ]);
    reviewedNames.forEach((name, id) => {
      expect(pairs.find((pair) => pair.id === id)?.item_name).toBe(name);
    });
    const reviewedCategories = new Map([
      ['term_0004', '처치·수술'],
      ['term_0102', '종합검진'],
      ['term_0117', '신경계기능검사'],
      ['term_0143', '내시경'],
      ['term_0144', '내시경'],
      ['term_0145', '내시경'],
      ['term_0146', '내시경'],
      ['term_0169', '언어치료'],
      ['term_0273', '처치·수술'],
      ['term_0274', '처치·수술'],
      ['term_0327', '처치·수술'],
      ['term_0328', '처치·수술'],
      ['term_0329', '처치·수술'],
      ['term_0631', '한방 시술'],
    ]);
    reviewedCategories.forEach((category, id) => {
      expect(pairs.find((pair) => pair.id === id)?.category).toBe(category);
    });
    const normalizedProcedureIds = [
      'term_0300', 'term_0304', 'term_0305', 'term_0306', 'term_0307', 'term_0308',
      'term_0318', 'term_0319', 'term_0322', 'term_0347',
    ];
    expect(normalizedProcedureIds.every((id) =>
      pairs.find((pair) => pair.id === id)?.category === '처치·수술')).toBe(true);
    expect(pairs.some((pair) =>
      ['순환기', '신경', '감각기', '감각기-시기(눈)', '비뇨기'].includes(pair.category),
    )).toBe(false);
    expect(pairs.some((pair) => /여성.*생식기|임신.*분만/.test(pair.category))).toBe(false);
    expect(pairs.find((pair) => pair.id === 'term_0193')?.category).toBe('검사');
    expect(pairs.find((pair) => pair.id === 'term_0276')?.category).toBe('정신치료');
    expect(pairs.find((pair) => pair.id === 'term_0095')?.category).toBe('감염검사');
    expect(pairs.find((pair) => pair.id === 'term_0098')?.category).toBe('검사');
    expect(pairs.filter((pair) => /방사선.*치료/.test(pair.item_name))
      .every((pair) => pair.category === '방사선치료')).toBe(true);
    expect(pairs.filter((pair) => ['당뇨병 교육·상담', '만성신부전 환자교육'].includes(pair.item_name))
      .every((pair) => pair.category === '교육·상담')).toBe(true);
    expect(pairs.find((pair) => pair.item_name === '약물검사')?.category).toBe('약물검사');
    const dentalProstheticIds = [
      'term_0473', 'term_0474', 'term_0476', 'term_0477', 'term_0488', 'term_0489',
      'term_0496', 'term_0508', 'term_0534', 'term_0535', 'term_0542', 'term_0543',
      'term_0544', 'term_0545', 'term_0559', 'term_0599', 'term_0600', 'term_0601',
      'term_0617', 'term_0624', 'term_0625',
    ];
    expect(dentalProstheticIds.every((id) =>
      pairs.find((pair) => pair.id === id)?.category === '치과보철')).toBe(true);
    const dentalExamIds = [
      'term_0492', 'term_0517', 'term_0532', 'term_0586', 'term_0587', 'term_0602',
    ];
    expect(dentalExamIds.every((id) =>
      pairs.find((pair) => pair.id === id)?.category === '치아검사')).toBe(true);
    expect(pairs.find((pair) => pair.id === 'term_0570')?.category).toBe('치과');
    expect(['term_0181', 'term_0330', 'term_0331'].every((id) =>
      pairs.find((pair) => pair.id === id)?.category === '근골격계')).toBe(true);
    expect(pairs.some((pair) => pair.category === '근골')).toBe(false);
    expect(pairs.some((pair) => [
      '치아교정 월 관리비', '나선형 고정', '임플란트 코핑 스크류 교체(재료비)',
    ].includes(pair.item_name))).toBe(false);
    expect(pairs.find((pair) => pair.id === 'term_0333')?.category).toBe('처치·수술');
    expect(pairs.find((pair) => pair.id === 'term_0335')?.category).toBe('처치·수술');
    expect(pairs.find((pair) => pair.id === 'term_0154')?.category).toBe('신경계기능검사');
    expect(pairs.some((pair) => pair.id === 'term_0159')).toBe(false);
    expect(pairs.some((pair) => pair.id === 'term_0021')).toBe(false);
    expect(pairs.find((pair) => pair.id === 'term_0160')).toMatchObject({
      item_name: '후각 기능검사(인지·역치)',
      category: '기능검사',
    });
    expect(pairs.filter((pair) => /쌍[꺼커]풀/.test(pair.item_name))
      .every((pair) => pair.category === '성형')).toBe(true);
    expect(pairs.filter((pair) => pair.item_name.includes('여드름'))
      .every((pair) => pair.category === '피부 및 연부조직')).toBe(true);
  });
});
