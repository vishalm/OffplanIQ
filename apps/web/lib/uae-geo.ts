// apps/web/lib/uae-geo.ts
// UAE-wide area → emirate mapping. Single source of truth — used by every
// page that groups projects by emirate. Add new areas here, not in pages.

export type Emirate =
  | 'Dubai'
  | 'Abu Dhabi'
  | 'Sharjah'
  | 'Ajman'
  | 'Ras Al Khaimah'
  | 'Fujairah'
  | 'Umm Al Quwain'
  | 'Other'

export const EMIRATES: Emirate[] = [
  'Dubai',
  'Abu Dhabi',
  'Sharjah',
  'Ajman',
  'Ras Al Khaimah',
  'Fujairah',
  'Umm Al Quwain',
]

const DUBAI_AREAS = [
  'Business Bay', 'Downtown Dubai', 'Dubai Marina', 'Dubai Hills', 'Dubai Hills Estate',
  'JVC', 'Jumeirah Village Circle', 'JLT', 'Jumeirah Lake Towers',
  'Creek Harbour', 'Dubai Creek Harbour', 'Dubai Creek Harbour (The Lagoons)',
  'Dubai Harbour', 'Palm Jumeirah', 'Meydan', 'Arjan', 'Damac Hills',
  'Sobha Hartland', 'Dubai South', 'Dubai South (Dubai World Central)',
  'Expo City', 'Madinat Al Mataar', 'Expo Valley',
  'Al Furjan', 'Motor City', 'Sports City', 'Arabian Ranches',
  'Mohammed Bin Rashid City', 'Dubai Design District', 'Mina Rashid',
  'The Valley', 'Nad Al Sheba', 'Bukadra', 'Dubailand', 'Dubai Land',
  'Discovery Gardens', 'Al Barsha', 'Town Square', 'DIFC',
  'Jumeirah', 'Umm Suqeim', 'Al Wasl', 'Tecom', 'Al Quoz',
]

const ABU_DHABI_AREAS = [
  'Saadiyat Island', 'Yas Island', 'Al Reem Island', 'Al Raha Beach',
  'Ghantoot', 'Al Hudayriat Island', 'Al Maryah Island', 'Khalifa City',
  'Al Reef', 'Mussafah', 'Al Shamkha', 'Masdar City', 'Al Ghadeer',
  'Al Jurf', 'Al Falah', 'Al Bateen', 'Corniche',
]

const SHARJAH_AREAS = [
  'Aljada', 'Al Mamsha', 'Tilal City', 'Al Khan', 'Al Majaz',
  'Al Nahda Sharjah', 'Sharjah Sustainable City', 'Maryam Island',
  'Al Suyoh', 'Sharjah Waterfront City', 'Sharjah Garden City',
  'Al Zahia', 'Muweilah', 'Al Tay',
]

const AJMAN_AREAS = [
  'Al Nuaimiya', 'Al Helio', 'Emirates City', 'Ajman One',
  'Al Rashidiya', 'Al Mowaihat', 'Al Yasmeen', 'Al Zorah',
]

const RAK_AREAS = [
  'Al Marjan Island', 'Mina Al Arab', 'Al Hamra Village', 'RAK Central',
  'Al Hamra', 'Julphar', 'Al Rams', 'Khuzam',
]

const FUJAIRAH_AREAS = [
  'Dibba', 'Al Faseel', 'Al Aqah', 'Al Bidiyah', 'Mirbah',
]

const UAQ_AREAS = [
  'Al Salamah', 'Al Khor', 'Falaj Al Mualla', 'UAQ Marina',
]

const AREA_TO_EMIRATE = new Map<string, Emirate>()
for (const a of DUBAI_AREAS)      AREA_TO_EMIRATE.set(a, 'Dubai')
for (const a of ABU_DHABI_AREAS)  AREA_TO_EMIRATE.set(a, 'Abu Dhabi')
for (const a of SHARJAH_AREAS)    AREA_TO_EMIRATE.set(a, 'Sharjah')
for (const a of AJMAN_AREAS)      AREA_TO_EMIRATE.set(a, 'Ajman')
for (const a of RAK_AREAS)        AREA_TO_EMIRATE.set(a, 'Ras Al Khaimah')
for (const a of FUJAIRAH_AREAS)   AREA_TO_EMIRATE.set(a, 'Fujairah')
for (const a of UAQ_AREAS)        AREA_TO_EMIRATE.set(a, 'Umm Al Quwain')

// Some PF rows store the emirate name itself in `area` when no neighbourhood
// is parsed (especially smaller emirates). Treat those as a self-mapping.
for (const e of EMIRATES) AREA_TO_EMIRATE.set(e, e)
AREA_TO_EMIRATE.set('RAK', 'Ras Al Khaimah')
AREA_TO_EMIRATE.set('UAQ', 'Umm Al Quwain')

export function emirateForArea(area: string | null | undefined): Emirate {
  if (!area) return 'Other'
  return AREA_TO_EMIRATE.get(area.trim()) ?? 'Other'
}
