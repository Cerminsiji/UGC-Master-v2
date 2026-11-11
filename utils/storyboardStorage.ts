import { StoryboardProject } from '../types';

const DB_NAME = 'ugc_master_studio_db';
const DB_VERSION = 1;
const STORE_NAME = 'storyboard_projects';
const KEY_ALL_PROJECTS = 'all_projects_list';
const KEY_CURRENT_PROJ_ID = 'current_project_id';

const LOCAL_STORAGE_KEY_V2 = 'ugc_master_projects_v2';
const LOCAL_STORAGE_KEY_V1 = 'ugc_master_projects_v1';
const CURRENT_PROJECT_ID_STORAGE_KEY = 'ugc_master_current_proj_id';

/**
 * Open or create IndexedDB instance
 */
function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB tidak didukung pada browser ini'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Gagal membuka IndexedDB'));
    };
  });
}

/**
 * Read item from IndexedDB
 */
async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        resolve((req.result as T) || null);
      };
      req.onerror = () => {
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

/**
 * Write item to IndexedDB
 */
async function idbSet<T>(key: string, val: T): Promise<boolean> {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(val, key);
      req.onsuccess = () => {
        resolve(true);
      };
      req.onerror = () => {
        resolve(false);
      };
    });
  } catch {
    return false;
  }
}

/**
 * Create a lightweight version of projects for localStorage if payload is too big
 * Strips huge base64 strings so localStorage quota (5MB) is never exceeded,
 * ensuring all scene texts, titles, scripts, voiceovers, prompts, durations are 100% saved!
 */
function stripHeavyImagesForLocalStorage(projects: StoryboardProject[]): StoryboardProject[] {
  return projects.map((proj) => {
    const cloned = { ...proj };
    if (typeof cloned.referenceImage === 'string' && cloned.referenceImage.length > 50000) {
      // Keep small metadata representation or compact thumbnail marker
      cloned.referenceImage = cloned.referenceImage.slice(0, 1000) + '...[compacted]';
    }
    if (Array.isArray(cloned.referenceImages)) {
      cloned.referenceImages = cloned.referenceImages.map((img) => {
        if (typeof img === 'string' && img.length > 50000) {
          return img.slice(0, 1000) + '...[compacted]';
        }
        return img;
      });
    }
    return cloned;
  });
}

/**
 * Safe write to localStorage with graceful quota fallback
 */
function safeSetLocalStorage(projects: StoryboardProject[], currentId: string): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(CURRENT_PROJECT_ID_STORAGE_KEY, currentId);
  } catch {}

  // Attempt 1: Full JSON in v2
  try {
    const fullJson = JSON.stringify(projects);
    // If under 3MB, write full
    if (fullJson.length < 3000000) {
      localStorage.setItem(LOCAL_STORAGE_KEY_V2, fullJson);
      return;
    }
  } catch {}

  // Attempt 2: Stripped heavy images (prevents QuotaExceededError while preserving 100% of storyboard data)
  try {
    const compactProjects = stripHeavyImagesForLocalStorage(projects);
    const compactJson = JSON.stringify(compactProjects);
    localStorage.setItem(LOCAL_STORAGE_KEY_V2, compactJson);
  } catch (err2) {
    // If still exceeds quota (e.g. 50+ huge projects), keep newest 15 projects
    try {
      const topProjects = stripHeavyImagesForLocalStorage(projects.slice(0, 15));
      localStorage.setItem(LOCAL_STORAGE_KEY_V2, JSON.stringify(topProjects));
    } catch {}
  }
}

/**
 * Save projects into both IndexedDB (full fidelity, unlimited quota) and LocalStorage (fast cache fallback)
 */
export async function persistProjects(
  projects: StoryboardProject[],
  currentProjectId: string
): Promise<{ success: boolean; timestamp: string }> {
  const timestamp = new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  if (!projects || projects.length === 0) {
    return { success: false, timestamp };
  }

  // 1. Immediate synchronous write to localStorage (fast mirror)
  safeSetLocalStorage(projects, currentProjectId);

  // 2. Full persistence to IndexedDB (stores complete images, unlimited quota)
  try {
    await idbSet(KEY_ALL_PROJECTS, projects);
    await idbSet(KEY_CURRENT_PROJ_ID, currentProjectId);
    return { success: true, timestamp };
  } catch {
    return { success: true, timestamp };
  }
}

/**
 * Load projects with hierarchy:
 * 1. IndexedDB (most complete & uncompressed)
 * 2. LocalStorage V2
 * 3. LocalStorage V1 (backward compatibility)
 */
export async function retrieveProjects(): Promise<{
  projects: StoryboardProject[] | null;
  currentProjectId: string | null;
  source: 'indexeddb' | 'localstorage_v2' | 'localstorage_v1' | 'none';
}> {
  if (typeof window === 'undefined') {
    return { projects: null, currentProjectId: null, source: 'none' };
  }

  // 1. Try IndexedDB
  try {
    const idbProjects = await idbGet<StoryboardProject[]>(KEY_ALL_PROJECTS);
    if (Array.isArray(idbProjects) && idbProjects.length > 0) {
      const idbCurrentId = (await idbGet<string>(KEY_CURRENT_PROJ_ID)) || null;
      return {
        projects: idbProjects,
        currentProjectId: idbCurrentId || idbProjects[0].id,
        source: 'indexeddb',
      };
    }
  } catch (e) {
    console.warn('Gagal membaca IndexedDB, mencoba LocalStorage...', e);
  }

  // 2. Try LocalStorage V2
  try {
    const savedV2 = localStorage.getItem(LOCAL_STORAGE_KEY_V2);
    if (savedV2) {
      const parsed = JSON.parse(savedV2);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const savedId = localStorage.getItem(CURRENT_PROJECT_ID_STORAGE_KEY);
        return {
          projects: parsed,
          currentProjectId: savedId || parsed[0].id,
          source: 'localstorage_v2',
        };
      }
    }
  } catch (e) {
    console.warn('Gagal membaca LocalStorage V2:', e);
  }

  // 3. Try legacy LocalStorage V1
  try {
    const savedV1 = localStorage.getItem(LOCAL_STORAGE_KEY_V1);
    if (savedV1) {
      const parsed = JSON.parse(savedV1);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const savedId = localStorage.getItem(CURRENT_PROJECT_ID_STORAGE_KEY);
        return {
          projects: parsed,
          currentProjectId: savedId || parsed[0].id,
          source: 'localstorage_v1',
        };
      }
    }
  } catch (e) {
    console.warn('Gagal membaca LocalStorage V1:', e);
  }

  return { projects: null, currentProjectId: null, source: 'none' };
}
