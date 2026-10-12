// İklim veri katmanı: önce backend (/api/climate/:city), yoksa statik anlık görüntü + tarayıcıda işleme.
import { climateBundle, CITIES, findCity, type ClimateBundle, type ClimateData } from '@viz/core';

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export { CITIES };

export function currentCity() {
  const id = new URLSearchParams(location.search).get('city') ?? 'istanbul';
  return findCity(id) ?? CITIES[0];
}

export async function loadClimate(cityId: string): Promise<{ bundle: ClimateBundle; source: 'api' | 'static' }> {
  try {
    const res = await fetch(`${API}/api/climate/${cityId}`);
    if (res.ok && res.headers.get('content-type')?.includes('json')) {
      return { bundle: (await res.json()) as ClimateBundle, source: 'api' };
    }
  } catch {
    /* backend yok: statik veriye düş */
  }
  const res = await fetch(`${import.meta.env.BASE_URL}data/climate-${cityId}.json`);
  if (!res.ok) throw new Error(`${cityId} için iklim verisi bulunamadı`);
  return { bundle: climateBundle((await res.json()) as ClimateData), source: 'static' };
}
