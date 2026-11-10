import { describe, expect, it } from 'vitest';
import { crestSearches, crestUrlFromSummary, pickCrestPage, rememberCrest, cachedCrest, setCrestStore, titleFitsClub, type WikiPage } from './crests';

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

  it('accepts a club jpeg and a short local name, and keeps a women side off the men page', () => {
    expect(
      crestUrlFromSummary(
        { title: 'CF Trival Valderas', description: 'Association football club in Spain', thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/en/3/3f/Trival_Valderas.jpg' } },
        'CF Trival Valderas Alcoron',
      ),
    ).toContain('Trival_Valderas.jpg');
    expect(titleFitsClub('UE Tavernes', 'CF UE Tavernes de la Valldigna')).toBe(true);
    expect(titleFitsClub('Olimpico EC SE', 'Olímpico Esporte Clube')).toBe(true);
    expect(titleFitsClub('Olimpico EC SE', 'Esporte Clube Olímpico')).toBe(false);
    expect(titleFitsClub('AD Carmopolis SE', 'Associação Desportiva Carmópolis')).toBe(true);
    expect(titleFitsClub('Eibar', 'Sociedad Deportiva Eibar')).toBe(true);
    expect(titleFitsClub('Hacken Gothenburg W', 'BK Häcken FF')).toBe(true);
    const pages: WikiPage[] = [
      { title: 'Real Madrid CF', description: "Men's association football club in Spain", thumbnail: { source: 'https://upload.wikimedia.org/men.svg' } },
      { title: 'Real Madrid Femenino', description: "Women's association football club in Madrid", thumbnail: { source: 'https://upload.wikimedia.org/en/thumb/5/56/Real_Madrid_CF.svg/330px-Real_Madrid_CF.svg.png' } },
    ];
    expect(pickCrestPage('Real Madrid W', pages)?.title).toBe('Real Madrid Femenino');
    expect(pickCrestPage('Odense Q', [{ title: 'Odense Boldklub Q', description: "Danish women's association football team in Odense, Denmark", thumbnail: { source: 'https://upload.wikimedia.org/commons/thumb/0/0b/Odense_Boldklub.svg/120px-Odense_Boldklub.svg.png' } }])?.title).toBe('Odense Boldklub Q');
    expect(crestSearches('AD Carmopolis SE', { area: 'Brazil', competition: 'Sergipano' }).some((item) => item.lang === 'pt' && /Carmopolis/i.test(item.query))).toBe(true);
    expect(crestSearches('Real Madrid W').some((item) => /femenino|women/i.test(item.query))).toBe(true);
  });
});
