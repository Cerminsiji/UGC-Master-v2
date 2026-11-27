import type { TalentKitPreset } from '../types';

export const TALENT_KITS_STORAGE_KEY = 'ugc_studio_talent_kits_v1';

export function loadTalentKits(): TalentKitPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TALENT_KITS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TalentKitPreset[]) : [];
  } catch {
    return [];
  }
}

export function saveTalentKit(
  kit: Omit<TalentKitPreset, 'id' | 'createdAt'>
): TalentKitPreset[] {
  if (typeof window === 'undefined') return [];
  const existing = loadTalentKits();
  const nextKit: TalentKitPreset = {
    ...kit,
    id: `kit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  const updated = [nextKit, ...existing].slice(0, 16);
  try {
    localStorage.setItem(TALENT_KITS_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    // Fallback without heavy images if localStorage quota is tight
    const compactKit: TalentKitPreset = {
      ...nextKit,
      talentImage: nextKit.talentImage?.startsWith('data:') ? undefined : nextKit.talentImage,
      environmentImage: nextKit.environmentImage?.startsWith('data:')
        ? undefined
        : nextKit.environmentImage,
    };
    const compactUpdated = [compactKit, ...existing].slice(0, 16);
    try {
      localStorage.setItem(TALENT_KITS_STORAGE_KEY, JSON.stringify(compactUpdated));
      return compactUpdated;
    } catch {
      return existing;
    }
  }
}

export function deleteTalentKit(id: string): TalentKitPreset[] {
  if (typeof window === 'undefined') return [];
  const existing = loadTalentKits();
  const updated = existing.filter((k) => k.id !== id);
  try {
    localStorage.setItem(TALENT_KITS_STORAGE_KEY, JSON.stringify(updated));
  } catch {}
  return updated;
}

export function replaceTalentKits(kits: TalentKitPreset[]): TalentKitPreset[] {
  if (typeof window === 'undefined') return [];
  const valid = Array.isArray(kits) ? kits.slice(0, 16) : [];
  try {
    localStorage.setItem(TALENT_KITS_STORAGE_KEY, JSON.stringify(valid));
  } catch {}
  return valid;
}
