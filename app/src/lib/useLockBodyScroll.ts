import { useEffect } from 'react';

/**
 * 모달형 오버레이가 떠 있는 동안 배경 스크롤을 잠근다.
 * 배경 페이지에 세로 스크롤바가 남아 있으면 position:fixed 오버레이가
 * 뷰포트(스크롤바 제외 영역) 기준으로 중앙 정렬되어 좌우 여백이
 * 스크롤바 폭만큼 비대칭으로 보이는 문제가 생긴다. 오버레이가 열려
 * 있는 동안 스크롤을 없애면 이 비대칭이 사라진다.
 */
export function useLockBodyScroll() {
  useEffect(() => {
    const { body } = document;
    const prevOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = prevOverflow;
    };
  }, []);
}
