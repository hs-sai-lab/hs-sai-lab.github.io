/**
 * 공개 사이트 페이지를 캐시 없이 여는 주소. GitHub Pages(와 그 앞의 CDN)는 HTML을 몇 분 동안 캐시하므로, 반영 직후에
 * 열면 예전 페이지가 보일 수 있습니다. 누른 시각을 ?v=로 붙이면 다른 주소가 되어 그 페이지를 새로 받습니다.
 * 반영 시각이 아니라 누른 시각을 쓰는 것은, 배포가 끝나기 전에 한 번 연 주소가 예전 페이지로 다시 캐시되기 때문입니다.
 * 공개 사이트는 모르는 쿼리를 무시합니다.
 */
export function freshLink(href: string, now: number = Date.now()): string {
  const url = new URL(href);
  url.searchParams.set('v', now.toString(36));
  return url.toString();
}
