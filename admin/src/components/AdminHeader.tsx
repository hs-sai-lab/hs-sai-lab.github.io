'use client';

import type { MouseEvent } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { freshLink } from '@admin/lib/freshLink';
import { currentMenu } from '@admin/lib/menu';
import styles from './AdminHeader.module.css';
import { useSession } from './Session';

/**
 * 관리 화면 헤더. 왼쪽에는 연구실 로고, 오른쪽에는 공개 사이트 링크와 계정 동작을 둡니다.
 * "공개 사이트"(새 탭)는 지금 화면이 고치는 공개 사이트 페이지를 엽니다(Seminars → /seminars/, Album → /album/, 그 밖에는 첫 화면).
 * 누르는 순간(왼쪽·가운데 단추, 오른쪽 단추의 "새 탭에서 열기") 주소에 누른 시각을 붙여 캐시를 건너뜁니다(lib/freshLink).
 * 권한을 확인한 뒤에는 오른쪽에 "나가기"가 붙습니다(이 컴퓨터의 임시 입력을 지움, lib Session).
 */
export function AdminHeader({ siteUrl }: { siteUrl: string }) {
  const { state, logout } = useSession();
  const path = usePathname();
  const siteHref = `${siteUrl}${currentMenu(path)?.site ?? '/'}`;
  const loggedIn = state === 'in';
  const fresh = (event: MouseEvent<HTMLAnchorElement>) => { event.currentTarget.href = freshLink(siteHref); };
  return (
    <header className={styles.header}>
      <div className={`container container-header ${styles.inner}`}>
        <a href="/" className={styles.brand} aria-label="SAI Lab 관리 화면 첫 화면">
          <span className={styles.brandLogo}>
            <Image src="/images/admin/sai-lab-black.png" width={1778} height={885} alt="SAI Lab" className={styles.logoImage} />
          </span>
          <span className={styles.divider} aria-hidden="true" />
          <span className={styles.area}>관리</span>
        </a>
        <ul className={styles.actions}>
          <li><a className={styles.link} href={siteHref} target="_blank" rel="noopener noreferrer"
            onClick={fresh} onAuxClick={fresh} onContextMenu={fresh}>공개 사이트</a></li>
          {loggedIn && <li><button type="button" className={`${styles.link} ${styles.button}`} onClick={() => void logout()}>나가기</button></li>}
        </ul>
      </div>
    </header>
  );
}
