/** Tunisian governorate capitals. The person picks one; nothing is ever detected or tracked. */
export const CITIES = {
  tunis: { lat: 36.8065, lon: 10.1815 },
  ariana: { lat: 36.8665, lon: 10.1647 },
  ben_arous: { lat: 36.7531, lon: 10.2189 },
  manouba: { lat: 36.8101, lon: 10.0863 },
  nabeul: { lat: 36.4561, lon: 10.7376 },
  zaghouan: { lat: 36.4029, lon: 10.1429 },
  bizerte: { lat: 37.2744, lon: 9.8739 },
  beja: { lat: 36.7256, lon: 9.1817 },
  jendouba: { lat: 36.5012, lon: 8.7802 },
  le_kef: { lat: 36.1676, lon: 8.7049 },
  siliana: { lat: 36.0849, lon: 9.3708 },
  sousse: { lat: 35.8256, lon: 10.6369 },
  monastir: { lat: 35.7643, lon: 10.8113 },
  mahdia: { lat: 35.5047, lon: 11.0622 },
  sfax: { lat: 34.7406, lon: 10.7603 },
  kairouan: { lat: 35.6781, lon: 10.0963 },
  kasserine: { lat: 35.1676, lon: 8.8365 },
  sidi_bouzid: { lat: 35.0382, lon: 9.4849 },
  gabes: { lat: 33.8815, lon: 10.0982 },
  medenine: { lat: 33.3549, lon: 10.5055 },
  tataouine: { lat: 32.9297, lon: 10.4518 },
  gafsa: { lat: 34.425, lon: 8.7842 },
  tozeur: { lat: 33.9197, lon: 8.1335 },
  kebili: { lat: 33.7044, lon: 8.969 },
} as const;

export type CityKey = keyof typeof CITIES;
export const CITY_KEYS = Object.keys(CITIES) as CityKey[];
export const isCity = (v: unknown): v is CityKey => typeof v === "string" && v in CITIES;
