import { FullScreenNotice } from './FullScreenNotice';

interface DataLoadErrorNoticeProps {
  onRetry: () => void;
  onHome: () => void;
  variant?: 'page' | 'modal';
}

/** 정적 데이터(JSON) 로드 실패 공통 안내 - "네트워크 요청 하나가 실패하면
 * 재시도/메인 복귀 버튼을 보여준다" 패턴이 App.tsx의 게임 데이터 게이트와
 * LocationGame.tsx의 지역/동 경계 로드 등 여러 곳에서 똑같은 문구로 반복돼서
 * 하나로 모았다 - 문구가 바뀌면 여기 한 곳만 고치면 된다. */
export function DataLoadErrorNotice({ onRetry, onHome, variant }: DataLoadErrorNoticeProps) {
  return (
    <FullScreenNotice
      variant={variant}
      icon="⚠️"
      title="게임 데이터를 불러오지 못했어요"
      subtitle="네트워크 상태를 확인한 뒤 다시 시도해 주세요."
      actionLabel="다시 시도"
      onAction={onRetry}
      secondaryLabel="메인으로 돌아가기"
      onSecondary={onHome}
    />
  );
}
