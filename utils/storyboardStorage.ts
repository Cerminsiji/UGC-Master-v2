import { StoryboardProject } from '../types';

export const LOCAL_PROJECTS_KEY = 'ugc_master_projects_v4';
export const LOCAL_ACTIVE_PROJECT_KEY = 'ugc_master_active_project_v4';
export const AUTO_SAVE_INTERVAL_SECONDS = 10;

const LEGACY_DRAFT_PREFIX = 'ugc_master_user_draft_v3_';
const LEGACY_CURRENT_PROJ_PREFIX = 'ugc_master_current_proj_v3_';
const LEGACY_SESSION_USER_KEY = 'ugc_master_session_user_v3';

const IDB_NAME = 'ugc_master_studio_db';
const IDB_VERSION = 1;
const IDB_STORE = 'projects_store';
const IDB_KEY = 'projects_payload_v4';

export interface LocalSaveResult {
  success: boolean;
  timestamp: string;
  savedCount: number;
  trimmedLargeImages?: boolean;
  error?: string;
}

export function nowTimeId(): string {
  return new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function stripDataImagesFromProjects(
  projects: StoryboardProject[],
  options: {
    preserveProjectId?: string;
    maxDataUrlLength?: number; // 0 = strip all data: URLs
  }
): StoryboardProject[] {
  const { preserveProjectId, maxDataUrlLength = 0 } = options;
  return projects.map((proj) => {
    if (preserveProjectId && proj.id === preserveProjectId) {
      return proj;
    }
    const cloned = { ...proj };
    if (
      typeof cloned.referenceImage === 'string' &&
      cloned.referenceImage.startsWith('data:') &&
      cloned.referenceImage.length > maxDataUrlLength
    ) {
      cloned.referenceImage = undefined;
    }
    if (Array.isArray(cloned.referenceImages)) {
      cloned.referenceImages = cloned.referenceImages.filter(
        (img) =>
          typeof img === 'string' &&
          (!img.startsWith('data:') || img.length <= maxDataUrlLength)
      );
      if (cloned.referenceImages.length === 0) {
        cloned.referenceImages = undefined;
      } else if (!cloned.referenceImage) {
        cloned.referenceImage = cloned.referenceImages[0];
      }
    }
    return cloned;
  });
}

export function clearLegacyAdminStorageKeys(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(LEGACY_SESSION_USER_KEY);
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (
        k &&
        (k.startsWith(LEGACY_DRAFT_PREFIX) || k.startsWith(LEGACY_CURRENT_PROJ_PREFIX))
      ) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      localStorage.removeItem(k);
    }
  } catch {}
}

function openProjectsIDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveProjectsToIndexedDB(
  projects: StoryboardProject[],
  currentProjectId: string
): Promise<boolean> {
  const db = await openProjectsIDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put({ projects, currentProjectId, updatedAt: Date.now() }, IDB_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    } catch {
      try {
        db.close();
      } catch {}
      resolve(false);
    }
  });
}

export async function loadProjectsFromIndexedDB(): Promise<{
  projects: StoryboardProject[] | null;
  currentProjectId: string | null;
}> {
  const db = await openProjectsIDB();
  if (!db) return { projects: null, currentProjectId: null };
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_KEY);
      req.onsuccess = () => {
        db.close();
        const val = req.result;
        if (val && Array.isArray(val.projects) && val.projects.length > 0) {
          resolve({
            projects: val.projects as StoryboardProject[],
            currentProjectId: typeof val.currentProjectId === 'string' ? val.currentProjectId : null,
          });
        } else {
          resolve({ projects: null, currentProjectId: null });
        }
      };
      req.onerror = () => {
        db.close();
        resolve({ projects: null, currentProjectId: null });
      };
    } catch {
      try {
        db.close();
      } catch {}
      resolve({ projects: null, currentProjectId: null });
    }
  });
}

export function mergeIndexedDBImagesIntoProjects(
  targetProjects: StoryboardProject[],
  idbProjects: StoryboardProject[]
): StoryboardProject[] {
  const idbById = new Map(idbProjects.map((p) => [p.id, p]));
  return targetProjects.map((proj) => {
    const hasLocalImages =
      Boolean(proj.referenceImage) ||
      (Array.isArray(proj.referenceImages) && proj.referenceImages.length > 0);
    if (hasLocalImages) return proj;

    const idbMatch = idbById.get(proj.id);
    if (!idbMatch) return proj;

    const hasIdbImages =
      Boolean(idbMatch.referenceImage) ||
      (Array.isArray(idbMatch.referenceImages) && idbMatch.referenceImages.length > 0);
    if (!hasIdbImages) return proj;

    return {
      ...proj,
      referenceImage: idbMatch.referenceImage,
      referenceImages: idbMatch.referenceImages,
    };
  });
}

function trySetLocalStorageItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function saveProjectsToLocalStorage(
  projects: StoryboardProject[],
  currentProjectId: string
): LocalSaveResult {
  const timestamp = nowTimeId();
  if (typeof window === 'undefined') {
    return { success: false, timestamp, savedCount: 0, error: 'Window unavailable' };
  }

  // Persist full payload (including all base64 reference images) in IndexedDB asynchronously
  void saveProjectsToIndexedDB(projects, currentProjectId);

  try {
    if (currentProjectId) {
      trySetLocalStorageItem(LOCAL_ACTIVE_PROJECT_KEY, currentProjectId);
    }

    // Tier 1: Full payload if safely under ~1.8M UTF-16 chars (~3.6MB)
    const rawJson = JSON.stringify(projects);
    if (rawJson.length < 1_800_000 && trySetLocalStorageItem(LOCAL_PROJECTS_KEY, rawJson)) {
      return {
        success: true,
        timestamp,
        savedCount: projects.length,
      };
    }

    // Free any lingering legacy keys before retry
    clearLegacyAdminStorageKeys();

    // Tier 2: Keep active project's images, trim >50KB data URLs on other projects
    const partial50k = stripDataImagesFromProjects(projects, {
      preserveProjectId: currentProjectId,
      maxDataUrlLength: 50_000,
    });
    const partial50kJson = JSON.stringify(partial50k);
    if (
      partial50kJson.length < 2_000_000 &&
      trySetLocalStorageItem(LOCAL_PROJECTS_KEY, partial50kJson)
    ) {
      return {
        success: true,
        timestamp,
        savedCount: projects.length,
        trimmedLargeImages: true,
      };
    }

    // Tier 3: Keep active project's images, strip ALL data URLs on other projects
    const activeImagesOnly = stripDataImagesFromProjects(projects, {
      preserveProjectId: currentProjectId,
      maxDataUrlLength: 0,
    });
    const activeOnlyJson = JSON.stringify(activeImagesOnly);
    if (
      activeOnlyJson.length < 2_200_000 &&
      trySetLocalStorageItem(LOCAL_PROJECTS_KEY, activeOnlyJson)
    ) {
      return {
        success: true,
        timestamp,
        savedCount: projects.length,
        trimmedLargeImages: true,
      };
    }

    // Tier 4: Strip ALL data: base64 images from localStorage copy (images stay safe in IndexedDB)
    const textOnlyProjects = stripDataImagesFromProjects(projects, {
      maxDataUrlLength: 0,
    });
    const textOnlyJson = JSON.stringify(textOnlyProjects);
    if (trySetLocalStorageItem(LOCAL_PROJECTS_KEY, textOnlyJson)) {
      return {
        success: true,
        timestamp,
        savedCount: projects.length,
        trimmedLargeImages: true,
      };
    }

    // Tier 5: Emergency quota fallback — remove existing key first, then keep active + newest projects
    try {
      localStorage.removeItem(LOCAL_PROJECTS_KEY);
    } catch {}

    const activeProj = textOnlyProjects.find((p) => p.id === currentProjectId);
    const others = textOnlyProjects.filter((p) => p.id !== currentProjectId);
    let keepCount = others.length;
    while (keepCount >= 0) {
      const subset = activeProj ? [activeProj, ...others.slice(0, keepCount)] : others.slice(0, Math.max(1, keepCount));
      if (trySetLocalStorageItem(LOCAL_PROJECTS_KEY, JSON.stringify(subset))) {
        return {
          success: true,
          timestamp,
          savedCount: subset.length,
          trimmedLargeImages: true,
        };
      }
      if (keepCount === 0) break;
      keepCount = Math.floor(keepCount / 2);
    }

    return {
      success: true,
      timestamp,
      savedCount: projects.length,
      trimmedLargeImages: true,
    };
  } catch (err: any) {
    return {
      success: false,
      timestamp,
      savedCount: 0,
      error: err?.message || 'Gagal menyimpan ke Local Storage browser',
    };
  }
}

export function loadProjectsFromLocalStorage(): {
  projects: StoryboardProject[] | null;
  currentProjectId: string | null;
} {
  if (typeof window === 'undefined') {
    return { projects: null, currentProjectId: null };
  }

  try {
    const raw = localStorage.getItem(LOCAL_PROJECTS_KEY);
    const currentProjectId = localStorage.getItem(LOCAL_ACTIVE_PROJECT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        clearLegacyAdminStorageKeys();
        return { projects: parsed as StoryboardProject[], currentProjectId };
      }
    }

    // One-time migration from legacy v3 draft keys
    let migratedProjects: StoryboardProject[] | null = null;
    let migratedCurrentId: string | null = null;

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith(LEGACY_DRAFT_PREFIX)) {
        const legacyRaw = localStorage.getItem(k);
        if (legacyRaw) {
          try {
            const parsed = JSON.parse(legacyRaw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              migratedProjects = parsed as StoryboardProject[];
              const suffix = k.slice(LEGACY_DRAFT_PREFIX.length);
              migratedCurrentId = localStorage.getItem(`${LEGACY_CURRENT_PROJ_PREFIX}${suffix}`);
              break;
            }
          } catch {}
        }
      }
    }

    if (migratedProjects && migratedProjects.length > 0) {
      const resolvedActiveId =
        migratedCurrentId && migratedProjects.some((p) => p.id === migratedCurrentId)
          ? migratedCurrentId
          : migratedProjects[0].id;
      clearLegacyAdminStorageKeys();
      saveProjectsToLocalStorage(migratedProjects, resolvedActiveId);
      return { projects: migratedProjects, currentProjectId: resolvedActiveId };
    }

    clearLegacyAdminStorageKeys();
  } catch {}

  return { projects: null, currentProjectId: null };
}
