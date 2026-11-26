import { useEffect, useRef } from 'react';
import { hideTestBanner, placeTestBanner, adsOnAndroid } from '../lib/ads';
import { PRO_UI_ENABLED } from '../lib/proFlag';

/** A small banner under the live list, never beside a Copy button. Android loads Google's test unit. Nothing pops up. */
export function AdSlot() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!PRO_UI_ENABLED || !adsOnAndroid()) return;
    const node = ref.current;
    if (!node) return;
    let stop = false;
    const place = () => {
      const box = node.getBoundingClientRect();
      if (stop) return;
      if (box.width < 40 || box.bottom < 0 || box.top > window.innerHeight) {
        void hideTestBanner();
        return;
      }
      void placeTestBanner({ x: box.left, y: box.top, width: box.width, height: box.height });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      stop = true;
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      void hideTestBanner();
    };
  }, []);
  if (!PRO_UI_ENABLED) return null;
  return <div className="ad-slot ad-banner" ref={ref} role="complementary" aria-label="Advertisement" />;
}
