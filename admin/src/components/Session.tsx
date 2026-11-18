'use client';

import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Section } from '@/components/Section';
import { api, ApiError, setUnauthenticatedHandler, signedOut } from '@admin/lib/api';
import { errorBody } from '@admin/lib/errors';
import { onOutdated } from '@admin/lib/appsScript';
import { clearLocalWork } from '@admin/lib/edit';
import { useDialog } from './Dialog';
import formStyles from './Field.module.css';

/**
 * 로그인 상태 (apps-script-transition-contract.md). 관리 화면은 접속한 Google 계정으로 권한을 확인합니다(비밀번호 없음).
 * - 화면을 열면 GET /session으로 권한을 묻습니다. 권한이 없거나 확인하지 못하면 메뉴 대신 그 자리에 안내가 나옵니다.
 *   세션이 만료됐을 때는 각 폼의 임시 입력을 이어서 씁니다.
 * - 헤더의 "나가기"는 Google 로그아웃이 아니라 이 컴퓨터의 임시 입력을 지우고 계정 전환 방법을 알리는 것입니다.
 * - 열어 둔 동안 30초마다(창으로 돌아올 때도) 권한을 다시 확인해, 허용 목록에서 빠진 계정은 바로 막습니다.
 */
type State = 'checking' | 'in' | 'out';
/** 'out'인 까닭. forbidden: 허용 목록에 없는 계정, closed: 나가기를 누름. */
type OutReason = 'signed-out' | 'forbidden' | 'closed';
type Session = { state: State; reason: OutReason; logout: () => Promise<void>; check: () => Promise<void> };

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside <SessionProvider>');
  return session;
}

type SessionData = { logged_in: boolean };

export function SessionProvider({ children }: { children: ReactNode }) {
  const dialog = useDialog();
  // 새 배포 전에 연 탭: 한 번만 알립니다. 새 화면의 수정은 새로고침해야 적용됩니다.
  useEffect(() => {
    onOutdated(() => void dialog.error('관리 화면 새 버전이 있습니다',
      '쓰던 내용을 저장하거나 정리한 뒤 브라우저에서 이 페이지를 새로고침해 주세요.'));
  }, [dialog]);
  const [state, setState] = useState<State>('checking');
  const [reason, setReason] = useState<OutReason>('signed-out');
  const lastValidatedAt = useRef(0);

  const apply = (data: SessionData) => {
    lastValidatedAt.current = Date.now();
    setReason('signed-out');
    setState(data.logged_in ? 'in' : 'out');
  };

  const check = useCallback(async () => {
    try {
      apply((await api.get<SessionData>('/session')).data);
    } catch (err) {
      if (signedOut(err)) return;
      if (err instanceof ApiError && err.code === 'FORBIDDEN') { setReason('forbidden'); setState('out'); return; }
      if (await dialog.error('불러오지 못했습니다', errorBody(err), { retry: true })) void check();
    }
  }, [dialog]);

  useEffect(() => {
    // 로그인이 풀리면 안내를 보입니다. /session 자체가 UNAUTHENTICATED로 답하므로 바로 다시 묻지 않고(끝없이 되풀이됨) "다시 열기"로 묻습니다.
    setUnauthenticatedHandler(() => setState('out'));
    void check();
  }, [check]);

  useEffect(() => {
    if (state !== 'in') return;
    let refreshing = false;
    let cancelled = false;
    const refresh = async () => {
      if (document.visibilityState !== 'visible' || refreshing || Date.now() - lastValidatedAt.current < 30_000) return;
      refreshing = true;
      try {
        const data = (await api.get<SessionData>('/session')).data;
        if (!cancelled) apply(data);
      } catch (err) {
        if (!cancelled && err instanceof ApiError && err.code === 'FORBIDDEN') {
          setReason('forbidden');
          setState('out');
        }
        // A transient read failure is retried on the next check or navigation.
      } finally {
        refreshing = false;
      }
    };
    const timer = window.setInterval(() => void refresh(), 30_000);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [state]);

  const logout = async () => {
    clearLocalWork();
    setReason('closed');
    setState('out');
  };

  return (
    <SessionContext.Provider value={{ state, reason, logout, check }}>
      {children}
    </SessionContext.Provider>
  );
}

/** 권한을 확인하지 못했을 때 각 화면 본문 자리에 나오는 안내. 제목 아래 선도 폼 폭(40rem)까지만 둡니다. */
export function LoginForm() {
  return <GoogleAccountNotice />;
}

const NOTICE: Record<OutReason, { title: string; body: string }> = {
  'signed-out': { title: 'Google 계정 확인', body: 'Google 계정을 확인하지 못했습니다. Google에 로그인한 뒤 이 주소를 다시 열어 주세요.' },
  forbidden: { title: '권한 없음', body: '이 Google 계정에는 관리 권한이 없습니다. 다른 계정으로 쓰려면 Google에서 계정을 바꾼 뒤 이 주소를 다시 열어 주세요.' },
  closed: { title: '나갔습니다', body: '이 컴퓨터에 남은 임시 입력을 지웠습니다. Google 계정은 로그인된 채로 남아 있습니다. 공용 컴퓨터라면 Google에서도 로그아웃해 주세요.' },
};

/** Google 계정 상태를 알리고, 다시 확인할 수 있게 합니다. */
function GoogleAccountNotice() {
  const { reason, check } = useSession();
  const [busy, setBusy] = useState(false);
  const { title, body } = NOTICE[reason];
  const again = async () => { setBusy(true); try { await check(); } finally { setBusy(false); } };
  return (
    <div className={formStyles.narrow}>
    <Section title={title}>
      <div className="admin-form">
        <p>{body}</p>
        <div className="admin-actions">
          <button type="button" className="admin-button" onClick={() => void again()} disabled={busy}>{busy ? '확인 중' : '다시 열기'}</button>
        </div>
      </div>
    </Section>
    </div>
  );
}
