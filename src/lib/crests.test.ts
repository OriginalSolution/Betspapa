import { describe, expect, it } from 'vitest';
import { crestUrlFromSummary, pickCrestPage, rememberCrest, cachedCrest, setCrestStore, type WikiPage } from './crests';

describe('crest choice', () => {
  it('picks the football club badge and skips the city page', () => {
    const pages: WikiPage[] = [
      { title: 'Eibar', description: 'Municipality in Basque Country, Spain', thumbnail: { source: 'https://upload.wikimedia.org/eibar-town.jpg' } },
      { title: 'SD Eibar', description: 'Spanish association football club', thumbnail: { source: 'https://upload.wikimedia.org/en/thumb/3/3b/SD_Eibar_logo.svg/120px-SD_Eibar_logo.svg.png' } },
    ];
    expect(pickCrestPage('Eibar', pages)?.title).toBe('SD Eibar');
    expect(
      crestUrlFromSummary(
        { title: 'Manchester City F.C.', description: 'Association football club in England', thumbnail: { source: 'https://upload.wikimedia.org/en/thumb/e/eb/Manchester_City_FC_badge.svg/330px-Manchester_City_FC_badge.svg.png' } },
        'Man City',
      ),
    ).toContain('250px-');
  });

  it('rejects a stadium photo and remembers a miss without blocking later play', () => {
    expect(
      crestUrlFromSummary(
        { title: 'Pamplona', description: 'Municipality in Navarre, Spain', thumbnail: { source: 'https://upload.wikimedia.org/commons/pamplona.jpg' } },
        'CD Pamplona',
      ),
    ).toBeNull();
    const box = new Map<string, string>();
    setCrestStore({ getItem: (key) => box.get(key) ?? null, setItem: (key, value) => box.set(key, value) });
    rememberCrest('CD Pamplona', null, 1_000);
    expect(cachedCrest('CD Pamplona', 1_000 + 1000)).toBeNull();
    setCrestStore(null);
  });
});
