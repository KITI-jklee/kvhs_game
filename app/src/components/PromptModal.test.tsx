// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PromptModal } from './PromptModal';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

describe('PromptModal', () => {
  it('접근 가능한 대화상자와 액션을 렌더링한다', () => {
    const action = vi.fn();
    render(
      <PromptModal icon={<span>!</span>} title="확인" desc="설명" ariaLabel="확인 대화상자">
        <button type="button" onClick={action}>계속</button>
      </PromptModal>,
    );
    expect(screen.getByRole('dialog', { name: '확인 대화상자' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '계속' }));
    expect(action).toHaveBeenCalledOnce();
  });

  it('마운트 중 본문 스크롤을 잠그고 해제 시 원래 값으로 복원한다', () => {
    document.body.style.overflow = 'scroll';
    const view = render(
      <PromptModal icon={null} title="확인" desc="설명" ariaLabel="확인"><button>닫기</button></PromptModal>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    view.unmount();
    expect(document.body.style.overflow).toBe('scroll');
  });
});
