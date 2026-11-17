'use client';

import { useEffect, useState, type SyntheticEvent } from 'react';
import { HOME_ALBUM_PICKS } from '@/lib/site';
import { METEORS, NIGHT_MS, SLIDE_MS } from './heroSky';
import styles from './Hero.module.css';

/** Renders "e^{jωn}" with a real superscript. */
function Formula({ text }: { text: string }) {
  const parts = text.split(/\^\{([^}]*)\}/);
  return <>{parts.map((part, i) => (i % 2 === 1 ? <sup key={i}>{part}</sup> : part))}</>;
}

type Props = {
  name: string; institution: string; quote: string[]; poemTitle: string;
  /** Photos picked in the 관리 화면 (Home → 슬라이드, content/home.yml): always shown first, in their order. */
  slides: string[];
  /** Album photos that may appear on Home (not marked `home: false`); a few are drawn at random on each visit, after the picked slides. */
  albumPhotos: string[];
};

/** Fisher–Yates on a copy. */
function shuffled<T>(list: T[]): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Home first screen: a full-width photo hero of the lab. Photos: the slides picked in the 관리 화면 first, then a few
 * album photos drawn at random on every visit (in the browser, after the page has loaded, so a static page still
 * changes per visit). The page itself is drawn with a fixed first photo (the first picked slide, else the newest
 * album's cover) so it shows a photo without JavaScript and matches the server render; the random photo then
 * fades in over it once loaded. Only the photo on screen and the next one are downloaded.
 * On every full page load (refresh or typed URL, wide screens, motion allowed) it opens as a night sky with
 * falling formulas, then the sky fades away to the photos after NIGHT_MS. The inline script in the root layout
 * sets html[data-hero="night"] before paint; returning to Home through the menu skips the night phase.
 */
export function Hero({ name, institution, quote, poemTitle, slides: picked, albumPhotos }: Props) {
  const [slides, setSlides] = useState<string[]>(() => (picked.length ? picked : albumPhotos.slice(0, 1)));
  const [slide, setSlide] = useState(0);
  const [night, setNight] = useState(true);
  /** Photos whose file may be downloaded: the one on screen, ones already shown, and the next one. */
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0]));
  /** Portrait photos crop from their upper part (faces), landscape ones from the middle. */
  const [tall, setTall] = useState<Set<string>>(() => new Set());

  // Draw the album photos for this visit. With no picked slides the fixed first photo stays until the drawn one has
  // loaded, then fades over to it (the usual slide fade); on wide screens this happens behind the night sky.
  useEffect(() => {
    const drawn = shuffled(albumPhotos.filter((src) => !picked.includes(src))).slice(0, HOME_ALBUM_PICKS);
    if (picked.length) { setSlides([...picked, ...drawn]); return; }
    if (!drawn.length) return;
    const first = slides[0];
    const rest = drawn.filter((src) => src !== first);
    if (!rest.length) return;
    setSlides([first, ...rest]);
    const img = new Image();
    img.onload = () => { setSeen((s) => new Set(s).add(1)); setSlide((i) => (i === 0 ? 1 : i)); };
    img.src = rest[0];
  }, []); // once per visit

  useEffect(() => {
    const root = document.documentElement;
    const isNight = root.dataset.hero === 'night';
    setNight(isNight);
    const timer = isNight ? window.setTimeout(() => { root.dataset.hero = 'day'; setNight(false); }, NIGHT_MS) : undefined;
    return () => {
      window.clearTimeout(timer);
      root.dataset.hero = 'day';
    };
  }, []);

  useEffect(() => {
    if (night || slides.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setSlide((s) => (s + 1) % slides.length), SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [night, slide, slides.length]);

  // Keep the photo on screen and the next one downloadable; the rest wait for their turn.
  useEffect(() => {
    if (slides.length < 2) return;
    setSeen((s) => (s.has(slide) && s.has((slide + 1) % slides.length) ? s : new Set(s).add(slide).add((slide + 1) % slides.length)));
  }, [slide, slides.length]);

  const onPhotoLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget, src = img.getAttribute('src') ?? '';
    if (img.naturalHeight > img.naturalWidth) setTall((t) => (t.has(src) ? t : new Set(t).add(src)));
  };

  return (
    <section className={styles.hero} aria-label={name}>
      <div className={styles.slides} aria-hidden="true">
        {slides.map((src, i) => (
          <img key={src} src={seen.has(i) ? src : undefined} alt="" className={styles.slide} data-active={i === slide}
            data-tall={tall.has(src) || undefined} onLoad={onPhotoLoad} />
        ))}
      </div>
      <div className={styles.shade} aria-hidden="true" />
      <div className={styles.sky} aria-hidden="true" />

      <div className={`container ${styles.inner}`}>
        <div className={styles.field} aria-hidden="true">
          {METEORS.map((m) => (
            <span key={m.text} className={styles.meteor} style={{ left: m.left, top: m.top, fontSize: m.size, animationDuration: `${m.duration}s`, animationDelay: `${m.delay}s` }}>
              <Formula text={m.text} />
            </span>
          ))}
        </div>

        <div className={styles.text}>
          <h1 className={styles.title}>{name}</h1>
          {institution && <p className={styles.institution}>{institution}</p>}
          {quote.length > 0 && (
            <blockquote className={styles.quote} lang="ko">
              {quote.map((line) => <p key={line}>{line}</p>)}
            </blockquote>
          )}
          {poemTitle && <a href="#poem" className={styles.poemLink} lang="ko">「{poemTitle}」 전문 읽기</a>}
        </div>

        {slides.length > 1 && (
          <div className={styles.dots}>
            {slides.map((src, i) => (
              <button key={src} type="button" className={styles.dot} aria-label={`Photo ${i + 1}`} aria-pressed={i === slide} onClick={() => setSlide(i)} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
