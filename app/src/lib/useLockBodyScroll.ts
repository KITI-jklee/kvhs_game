import { useEffect } from 'react';

/** 오버레이가 열린 동안 배경 스크롤과 스크롤바로 인한 중앙 정렬 오차를 막는다. */
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
