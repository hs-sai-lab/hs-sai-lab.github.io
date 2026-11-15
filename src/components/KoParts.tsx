import { Fragment } from 'react';

/** A Hangul run: starts and ends with Hangul, may hold spaces, Latin letters, digits and ·/,- in between ("한신대학교 AI·SW대학"). */
const KO_RUN = /([ㄱ-ㆎ가-힣](?:[ㄱ-ㆎ가-힣A-Za-z0-9\s·/,\-]*[ㄱ-ㆎ가-힣])?)/;

/**
 * For English text with Korean parts, such as "Assistant Professor (조교수)": only the Korean parts get `lang="ko"`,
 * so screen readers switch voice for them alone. Text that is Korean as a whole should use `lang={langOf(text)}` instead.
 */
export function KoParts({ text }: { text: string }) {
  return <>{text.split(KO_RUN).map((part, i) => (i % 2 ? <span key={i} lang="ko">{part}</span> : <Fragment key={i}>{part}</Fragment>))}</>;
}
