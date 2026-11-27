import {
  StoryboardProject,
  StorageDeployLogEntry,
  GhostDataItem,
  DuplicateProjectGroup,
  DuplicateProjectMember,
  StorageLayerSnapshot,
  StorageAuditReport,
} from '../types';

export const LOCAL_PROJECTS_KEY = 'ugc_master_projects_v4';
export const LOCAL_ACTIVE_PROJECT_KEY = 'ugc_master_active_project_v4';
export const DEPLOY_LOGS_KEY = 'ugc_master_deploy_logs_v4';
export const AUTO_SAVE_INTERVAL_SECONDS = 10;

const MAX_DEPLOY_LOGS = 60;

const LEGACY_DRAFT_PREFIX = 'ugc_master_user_draft_v3_';
const LEGACY_CURRENT_PROJ_PREFIX = 'ugc_master_current_proj_v3_';
const LEGACY_SESSION_USER_KEY = 'ugc_master_session_user_v3';
const KNOWN_ACTIVE_KEYS = new Set([
  LOCAL_PROJECTS_KEY,
  LOCAL_ACTIVE_PROJECT_KEY,
  DEPLOY_LOGS_KEY,
  'ugc_studio_gate_auth_v3',
  'ugc_studio_talent_kits_v1',
]);

const IDB_NAME = 'ugc_master_studio_db';
const IDB_VERSION = 1;
const IDB_STORE = 'projects_store';
const IDB_KEY = 'projects_payload_v4';

export interface LocalSaveResult {
  success: boolean;
  timestamp: string;
  savedCount: number;
  trimmedLargeImages?: boolean;
  tier?: string;
  droppedCount?: number;
  error?: string;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function estimateStringBytes(str: string | null | undefined): number {
  if (!str) return 0;
  return str.length * 2; // UTF-16 in browser storage
}

export function getDeployLogs(): StorageDeployLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DEPLOY_LOGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StorageDeployLogEntry[]) : [];
  } catch {
    return [];
  }
}

export function appendDeployLog(
  entry: Omit<StorageDeployLogEntry, 'id' | 'timestamp'>
): StorageDeployLogEntry[] {
  if (typeof window === 'undefined') return [];
  const nextEntry: StorageDeployLogEntry = {
    ...entry,
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
  };
  try {
    const existing = getDeployLogs();
    const updated = [nextEntry, ...existing].slice(0, MAX_DEPLOY_LOGS);
    localStorage.setItem(DEPLOY_LOGS_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    // If localStorage is full, trim log history aggressively and retry
    try {
      const compact = [nextEntry];
      localStorage.setItem(DEPLOY_LOGS_KEY, JSON.stringify(compact));
      return compact;
    } catch {
      return [nextEntry];
    }
  }
}

export function clearDeployLogs(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(DEPLOY_LOGS_KEY);
  } catch {}
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

export function findStaleOrLegacyLocalKeys(): {
  key: string;
  bytes: number;
  reason: string;
}[] {
  if (typeof window === 'undefined') return [];
  const found: { key: string; bytes: number; reason: string }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (KNOWN_ACTIVE_KEYS.has(k)) continue;

      const isKnownLegacy =
        k === LEGACY_SESSION_USER_KEY ||
        k.startsWith(LEGACY_DRAFT_PREFIX) ||
        k.startsWith(LEGACY_CURRENT_PROJ_PREFIX);

      const isOtherUgcKey = k.startsWith('ugc_master_') || k.startsWith('ugc_studio_');

      if (isKnownLegacy || isOtherUgcKey) {
        const val = localStorage.getItem(k);
        found.push({
          key: k,
          bytes: estimateStringBytes(val),
          reason: isKnownLegacy
            ? 'Sisa key storage versi lama (v3) yang belum terhapus'
            : 'Key storage UGC tidak dikenal / sisa migrasi lama',
        });
      }
    }
  } catch {}
  return found;
}

export function clearLegacyAdminStorageKeys(): number {
  if (typeof window === 'undefined') return 0;
  let removedCount = 0;
  try {
    const staleKeys = findStaleOrLegacyLocalKeys();
    for (const item of staleKeys) {
      localStorage.removeItem(item.key);
      removedCount++;
    }
  } catch {}
  return removedCount;
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

export async function saveProjectsToIndexedDBWithStatus(
  projects: StoryboardProject[],
  currentProjectId: string
): Promise<{ success: boolean; error?: string }> {
  const db = await openProjectsIDB();
  if (!db) {
    return { success: false, error: 'IndexedDB tidak tersedia atau diblokir browser' };
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put({ projects, currentProjectId, updatedAt: Date.now() }, IDB_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve({ success: true });
      };
      tx.onerror = () => {
        const errMsg = tx.error?.message || 'Transaksi tulis IndexedDB gagal';
        db.close();
        resolve({ success: false, error: errMsg });
      };
      tx.onabort = () => {
        const errMsg = tx.error?.message || 'Transaksi IndexedDB dibatalkan (quota/lock)';
        db.close();
        resolve({ success: false, error: errMsg });
      };
    } catch (err: any) {
      try {
        db.close();
      } catch {}
      resolve({ success: false, error: err?.message || 'Gagal menulis ke IndexedDB' });
    }
  });
}

export async function saveProjectsToIndexedDB(
  projects: StoryboardProject[],
  currentProjectId: string
): Promise<boolean> {
  const res = await saveProjectsToIndexedDBWithStatus(projects, currentProjectId);
  return res.success;
}

export async function loadProjectsFromIndexedDB(): Promise<{
  projects: StoryboardProject[] | null;
  currentProjectId: string | null;
  updatedAt?: number | null;
  error?: string;
}> {
  const db = await openProjectsIDB();
  if (!db) {
    return {
      projects: null,
      currentProjectId: null,
      updatedAt: null,
      error: 'IndexedDB tidak tersedia',
    };
  }
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
            updatedAt: typeof val.updatedAt === 'number' ? val.updatedAt : null,
          });
        } else {
          resolve({ projects: null, currentProjectId: null, updatedAt: null });
        }
      };
      req.onerror = () => {
        const errMsg = req.error?.message || 'Gagal membaca IndexedDB';
        db.close();
        resolve({ projects: null, currentProjectId: null, updatedAt: null, error: errMsg });
      };
    } catch (err: any) {
      try {
        db.close();
      } catch {}
      resolve({
        projects: null,
        currentProjectId: null,
        updatedAt: null,
        error: err?.message || 'Gagal membaca IndexedDB',
      });
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
  // and record a warning log if IndexedDB write fails (leaving stale/ghost data in IDB)
  void saveProjectsToIndexedDBWithStatus(projects, currentProjectId).then((idbRes) => {
    if (!idbRes.success) {
      appendDeployLog({
        action: 'save',
        status: 'warning',
        tier: 'IndexedDB Sync',
        localCount: projects.length,
        idbCount: null,
        memoryCount: projects.length,
        ghostCount: 1,
        duplicateCount: 0,
        message: 'Gagal menyinkronkan ke IndexedDB — data lama di IndexedDB berpotensi menjadi ghost.',
        details: [idbRes.error || 'IndexedDB write error'],
      });
    }
  });

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
        tier: 'Tier 1 (Full)',
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
        tier: 'Tier 2 (Trim Gambar >50KB)',
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
        tier: 'Tier 3 (Gambar Aktif Saja)',
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
        tier: 'Tier 4 (Teks Saja)',
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
          tier: 'Tier 5 (Subset Quota Darurat)',
          droppedCount: Math.max(0, projects.length - subset.length),
        };
      }
      if (keepCount === 0) break;
      keepCount = Math.floor(keepCount / 2);
    }

    return {
      success: false,
      timestamp,
      savedCount: 0,
      trimmedLargeImages: true,
      tier: 'Quota Penuh',
      error: 'Local Storage browser penuh; naskah hanya bertahan di Memory/IndexedDB.',
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

function normalizeTitleForDuplicateCheck(title: string): string {
  return (title || '')
    .replace(/\s*\(copy\)\s*/gi, '')
    .trim()
    .toLowerCase();
}

function toDuplicateMember(
  proj: StoryboardProject,
  source: 'memory' | 'localStorage' | 'indexedDB'
): DuplicateProjectMember {
  return {
    id: proj.id,
    title: proj.title || '(Tanpa Judul)',
    productName: proj.productName,
    updatedAt: proj.updatedAt,
    createdAt: proj.createdAt,
    sceneCount: Array.isArray(proj.scenes) ? proj.scenes.length : 0,
    source,
  };
}

export function detectDuplicateGroups(
  projects: StoryboardProject[],
  activeProjectId: string,
  source: 'memory' | 'localStorage' | 'indexedDB' = 'memory'
): DuplicateProjectGroup[] {
  const groups: DuplicateProjectGroup[] = [];
  const seenIds = new Map<string, StoryboardProject[]>();

  for (const proj of projects) {
    if (!proj || !proj.id) continue;
    const list = seenIds.get(proj.id) || [];
    list.push(proj);
    seenIds.set(proj.id, list);
  }

  for (const [id, members] of seenIds.entries()) {
    if (members.length > 1) {
      groups.push({
        signature: `id:${id}`,
        reason: 'duplicate_id',
        label: `ID Project Ganda: ${id}`,
        keepProjectId: id,
        duplicateProjects: members.map((m) => toDuplicateMember(m, source)),
      });
    }
  }

  // Group by normalized title + productName + categoryId (catching clones & repeated "(Copy)" leftovers)
  const contentBuckets = new Map<string, StoryboardProject[]>();
  for (const proj of projects) {
    if (!proj || !proj.id) continue;
    const normTitle = normalizeTitleForDuplicateCheck(proj.title);
    const normProd = (proj.productName || '').trim().toLowerCase();
    const normCat = (proj.categoryId || '').trim().toLowerCase();
    const key = `${normTitle}::${normProd}::${normCat}`;
    const list = contentBuckets.get(key) || [];
    list.push(proj);
    contentBuckets.set(key, list);
  }

  for (const [key, members] of contentBuckets.entries()) {
    // Only consider unique IDs here (exact duplicate IDs are already flagged above)
    const uniqueById: StoryboardProject[] = [];
    const seenMemberIds = new Set<string>();
    for (const m of members) {
      if (!seenMemberIds.has(m.id)) {
        seenMemberIds.add(m.id);
        uniqueById.push(m);
      }
    }
    if (uniqueById.length <= 1) continue;

    // Prefer keeping the currently active project, otherwise the most recently updated non-copy entry
    const sorted = [...uniqueById].sort((a, b) => {
      if (a.id === activeProjectId) return -1;
      if (b.id === activeProjectId) return 1;
      const aIsCopy = /\(copy\)/i.test(a.title || '');
      const bIsCopy = /\(copy\)/i.test(b.title || '');
      if (aIsCopy !== bIsCopy) return aIsCopy ? 1 : -1;
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });

    const hasCopyTitle = uniqueById.some((m) => /\(copy\)/i.test(m.title || ''));
    groups.push({
      signature: `content:${key}`,
      reason: hasCopyTitle ? 'copy_clone' : 'identical_title_product',
      label: `${sorted[0].title}${sorted[0].productName ? ` · ${sorted[0].productName}` : ''}`,
      keepProjectId: sorted[0].id,
      duplicateProjects: sorted.map((m) => toDuplicateMember(m, source)),
    });
  }

  return groups;
}

export async function auditProjectStorage(
  memoryProjects: StoryboardProject[],
  activeProjectId: string
): Promise<StorageAuditReport> {
  const auditedAt = new Date().toISOString();
  const ghostItems: GhostDataItem[] = [];

  // 1. Memory Snapshot
  const memJson = JSON.stringify(memoryProjects || []);
  const memorySnapshot: StorageLayerSnapshot = {
    available: true,
    projectCount: memoryProjects.length,
    activeProjectId: activeProjectId || null,
    bytesUsed: estimateStringBytes(memJson),
    updatedAt: auditedAt,
    projectIds: memoryProjects.map((p) => p.id),
  };

  // 2. LocalStorage Snapshot
  let lsProjects: StoryboardProject[] = [];
  let lsSnapshot: StorageLayerSnapshot = {
    available: false,
    projectCount: 0,
    activeProjectId: null,
    bytesUsed: 0,
    projectIds: [],
  };

  const staleKeys = findStaleOrLegacyLocalKeys();
  for (const sk of staleKeys) {
    ghostItems.push({
      id: `ghost_key_${sk.key}`,
      type: 'legacy_key',
      layer: 'localStorage',
      keyOrProjectId: sk.key,
      title: sk.key,
      reason: sk.reason,
      sizeBytes: sk.bytes,
    });
  }

  if (typeof window !== 'undefined') {
    try {
      const rawLs = localStorage.getItem(LOCAL_PROJECTS_KEY);
      const rawActive = localStorage.getItem(LOCAL_ACTIVE_PROJECT_KEY);
      lsSnapshot = {
        available: true,
        projectCount: 0,
        activeProjectId: rawActive,
        bytesUsed: estimateStringBytes(rawLs) + estimateStringBytes(rawActive),
        projectIds: [],
      };

      if (rawLs) {
        try {
          const parsed = JSON.parse(rawLs);
          if (Array.isArray(parsed)) {
            lsProjects = parsed.filter((item) => item && typeof item.id === 'string');
            lsSnapshot.projectCount = lsProjects.length;
            lsSnapshot.projectIds = lsProjects.map((p) => p.id);

            const invalidEntries = parsed.length - lsProjects.length;
            if (invalidEntries > 0) {
              ghostItems.push({
                id: 'ghost_ls_invalid_entries',
                type: 'broken_payload',
                layer: 'localStorage',
                keyOrProjectId: LOCAL_PROJECTS_KEY,
                title: `${invalidEntries} entri rusak di LocalStorage`,
                reason: 'Terdapat item project tanpa ID valid di dalam payload LocalStorage.',
              });
            }
          } else {
            lsSnapshot.error = 'Format JSON LocalStorage bukan array';
            ghostItems.push({
              id: 'ghost_ls_non_array',
              type: 'broken_payload',
              layer: 'localStorage',
              keyOrProjectId: LOCAL_PROJECTS_KEY,
              title: 'Payload LocalStorage korup',
              reason: 'Data pada key proyek bukan berupa array JSON yang valid.',
              sizeBytes: estimateStringBytes(rawLs),
            });
          }
        } catch {
          lsSnapshot.error = 'JSON LocalStorage tidak bisa di-parse';
          ghostItems.push({
            id: 'ghost_ls_corrupt_json',
            type: 'broken_payload',
            layer: 'localStorage',
            keyOrProjectId: LOCAL_PROJECTS_KEY,
            title: 'JSON LocalStorage rusak',
            reason: 'Payload gagal di-parse dan berpotensi meninggalkan sisa data tersangkut.',
            sizeBytes: estimateStringBytes(rawLs),
          });
        }
      }

      if (rawActive && lsProjects.length > 0 && !lsProjects.some((p) => p.id === rawActive)) {
        ghostItems.push({
          id: `ghost_ls_dangling_active_${rawActive}`,
          type: 'dangling_active_pointer',
          layer: 'localStorage',
          keyOrProjectId: rawActive,
          title: `Pointer aktif yatim: ${rawActive}`,
          reason: 'Key active project di LocalStorage menunjuk ke ID project yang sudah dihapus.',
        });
      }
    } catch (err: any) {
      lsSnapshot.error = err?.message || 'LocalStorage tidak dapat diakses';
    }
  }

  // 3. IndexedDB Snapshot
  const idbResult = await loadProjectsFromIndexedDB();
  const idbProjects = idbResult.projects || [];
  const idbJson = idbProjects.length > 0 ? JSON.stringify(idbProjects) : '';
  const idbSnapshot: StorageLayerSnapshot = {
    available: !idbResult.error || idbResult.error !== 'IndexedDB tidak tersedia',
    projectCount: idbProjects.length,
    activeProjectId: idbResult.currentProjectId,
    bytesUsed: estimateStringBytes(idbJson),
    updatedAt: idbResult.updatedAt ? new Date(idbResult.updatedAt).toISOString() : null,
    projectIds: idbProjects.map((p) => p.id),
    error: idbResult.error,
  };

  if (
    idbResult.currentProjectId &&
    idbProjects.length > 0 &&
    !idbProjects.some((p) => p.id === idbResult.currentProjectId)
  ) {
    ghostItems.push({
      id: `ghost_idb_dangling_active_${idbResult.currentProjectId}`,
      type: 'dangling_active_pointer',
      layer: 'indexedDB',
      keyOrProjectId: idbResult.currentProjectId,
      title: `Pointer aktif IDB yatim: ${idbResult.currentProjectId}`,
      reason: 'IndexedDB menyimpan pointer project aktif yang ID-nya sudah tidak ada.',
    });
  }

  // 4. Cross-layer Orphan / Ghost Comparison
  const memoryIdSet = new Set(memoryProjects.map((p) => p.id));
  const lsIdSet = new Set(lsProjects.map((p) => p.id));
  const idbIdSet = new Set(idbProjects.map((p) => p.id));

  for (const idbProj of idbProjects) {
    if (!memoryIdSet.has(idbProj.id)) {
      ghostItems.push({
        id: `ghost_idb_orphan_${idbProj.id}`,
        type: 'idb_orphan',
        layer: 'indexedDB',
        keyOrProjectId: idbProj.id,
        title: idbProj.title || idbProj.id,
        reason:
          'Data project masih tersangkut di IndexedDB padahal sudah dihapus dari Editor/Memory (berisiko muncul lagi saat reload).',
        sizeBytes: estimateStringBytes(JSON.stringify(idbProj)),
      });
    }
  }

  for (const lsProj of lsProjects) {
    if (!memoryIdSet.has(lsProj.id)) {
      ghostItems.push({
        id: `ghost_ls_orphan_${lsProj.id}`,
        type: 'ls_orphan',
        layer: 'localStorage',
        keyOrProjectId: lsProj.id,
        title: lsProj.title || lsProj.id,
        reason:
          'Data project masih tersangkut di LocalStorage padahal tidak ada di daftar aktif Editor.',
        sizeBytes: estimateStringBytes(JSON.stringify(lsProj)),
      });
    }
  }

  for (const memProj of memoryProjects) {
    if (lsSnapshot.available && lsProjects.length > 0 && !lsIdSet.has(memProj.id)) {
      ghostItems.push({
        id: `ghost_mem_not_in_ls_${memProj.id}`,
        type: 'memory_orphan',
        layer: 'memory',
        keyOrProjectId: memProj.id,
        title: memProj.title || memProj.id,
        reason:
          'Project ada di Editor namun belum tersimpan di LocalStorage (kemungkinan terpotong oleh quota fallback).',
      });
    } else if (idbSnapshot.available && idbProjects.length > 0 && !idbIdSet.has(memProj.id)) {
      ghostItems.push({
        id: `ghost_mem_not_in_idb_${memProj.id}`,
        type: 'memory_orphan',
        layer: 'memory',
        keyOrProjectId: memProj.id,
        title: memProj.title || memProj.id,
        reason: 'Project ada di Editor namun belum tersinkron ke IndexedDB.',
      });
    }
  }

  // 5. Duplicate Detection across active memory projects
  const duplicateGroups = detectDuplicateGroups(memoryProjects, activeProjectId, 'memory');

  const totalGhostCount = ghostItems.length;
  const totalDuplicateCount = duplicateGroups.reduce(
    (sum, g) => sum + Math.max(0, g.duplicateProjects.length - 1),
    0
  );

  const isSynced =
    totalGhostCount === 0 &&
    memorySnapshot.projectCount === lsSnapshot.projectCount &&
    (!idbSnapshot.available || memorySnapshot.projectCount === idbSnapshot.projectCount);

  const health: 'healthy' | 'warning' | 'critical' =
    ghostItems.some((g) => g.type === 'broken_payload' || g.type === 'idb_orphan') ||
    duplicateGroups.some((d) => d.reason === 'duplicate_id')
      ? 'critical'
      : totalGhostCount > 0 || totalDuplicateCount > 0 || !isSynced
      ? 'warning'
      : 'healthy';

  return {
    auditedAt,
    health,
    memory: memorySnapshot,
    localStorage: lsSnapshot,
    indexedDB: idbSnapshot,
    legacyKeys: staleKeys.map((s) => s.key),
    ghostItems,
    duplicateGroups,
    totalGhostCount,
    totalDuplicateCount,
    isSynced,
  };
}

export function buildDeduplicatedProjects(
  projects: StoryboardProject[],
  activeProjectId: string,
  options: { removeCopyClones?: boolean } = {}
): {
  cleaned: StoryboardProject[];
  removedProjects: StoryboardProject[];
} {
  const { removeCopyClones = true } = options;
  const seenIds = new Set<string>();
  const uniqueById: StoryboardProject[] = [];
  const removedProjects: StoryboardProject[] = [];

  for (const proj of projects) {
    if (!proj || !proj.id) continue;
    if (seenIds.has(proj.id)) {
      removedProjects.push(proj);
      continue;
    }
    seenIds.add(proj.id);
    uniqueById.push(proj);
  }

  const contentBestMap = new Map<string, StoryboardProject>();
  for (const proj of uniqueById) {
    const normTitle = normalizeTitleForDuplicateCheck(proj.title);
    const normProd = (proj.productName || '').trim().toLowerCase();
    const normCat = (proj.categoryId || '').trim().toLowerCase();
    const isCopyTitle = /\(copy\)/i.test(proj.title || '');
    const key = `${normTitle}::${normProd}::${normCat}`;

    const existing = contentBestMap.get(key);
    if (!existing) {
      contentBestMap.set(key, proj);
      continue;
    }

    if (!removeCopyClones && (isCopyTitle || /\(copy\)/i.test(existing.title || ''))) {
      // Keep copy clones if explicitly excluded
      contentBestMap.set(`${key}::${proj.id}`, proj);
      continue;
    }

    const keepCurrent =
      proj.id === activeProjectId ||
      (existing.id !== activeProjectId &&
        ((/\(copy\)/i.test(existing.title || '') && !isCopyTitle) ||
          (!(/\s*\(copy\)/i.test(proj.title || '')) &&
            (proj.updatedAt || '') > (existing.updatedAt || ''))));

    if (keepCurrent) {
      removedProjects.push(existing);
      contentBestMap.set(key, proj);
    } else {
      removedProjects.push(proj);
    }
  }

  const keepIdSet = new Set(Array.from(contentBestMap.values()).map((p) => p.id));
  const cleaned = uniqueById.filter((p) => keepIdSet.has(p.id));

  return { cleaned, removedProjects };
}

export async function cleanupGhostStorageData(
  memoryProjects: StoryboardProject[],
  activeProjectId: string
): Promise<{
  audit: StorageAuditReport;
  cleanedCount: number;
  repairedSync: boolean;
  error?: string;
}> {
  const beforeAudit = await auditProjectStorage(memoryProjects, activeProjectId);
  const removedLegacy = clearLegacyAdminStorageKeys();

  // Deduplicate exact duplicate IDs in canonical memory list
  const seenIds = new Set<string>();
  const canonicalProjects = memoryProjects.filter((p) => {
    if (!p || !p.id || seenIds.has(p.id)) return false;
    seenIds.add(p.id);
    return true;
  });

  const resolvedActiveId =
    activeProjectId && canonicalProjects.some((p) => p.id === activeProjectId)
      ? activeProjectId
      : canonicalProjects[0]?.id || '';

  const lsRes = saveProjectsToLocalStorage(canonicalProjects, resolvedActiveId);
  const idbRes = await saveProjectsToIndexedDBWithStatus(canonicalProjects, resolvedActiveId);

  const afterAudit = await auditProjectStorage(canonicalProjects, resolvedActiveId);
  const cleanedCount = Math.max(
    0,
    beforeAudit.totalGhostCount - afterAudit.totalGhostCount + removedLegacy
  );
  const repairedSync = lsRes.success && idbRes.success && afterAudit.totalGhostCount === 0;

  const details: string[] = [];
  if (removedLegacy > 0) details.push(`${removedLegacy} legacy/stale key LocalStorage dihapus`);
  if (beforeAudit.ghostItems.some((g) => g.type === 'idb_orphan')) {
    details.push(
      idbRes.success
        ? 'Data orphan di IndexedDB telah ditimpa & disinkronkan ulang'
        : `Gagal membersihkan IndexedDB: ${idbRes.error || 'error tidak diketahui'}`
    );
  }
  if (beforeAudit.ghostItems.some((g) => g.type === 'dangling_active_pointer')) {
    details.push(`Pointer project aktif diperbaiki ke: ${resolvedActiveId}`);
  }
  if (lsRes.trimmedLargeImages) {
    details.push(`LocalStorage disimpan dengan ${lsRes.tier || 'kompresi gambar'}`);
  }

  appendDeployLog({
    action: 'cleanup_ghosts',
    status: repairedSync ? 'success' : afterAudit.totalGhostCount > 0 ? 'error' : 'warning',
    tier: lsRes.tier,
    localCount: afterAudit.localStorage.projectCount,
    idbCount: afterAudit.indexedDB.available ? afterAudit.indexedDB.projectCount : null,
    memoryCount: canonicalProjects.length,
    ghostCount: afterAudit.totalGhostCount,
    duplicateCount: afterAudit.totalDuplicateCount,
    message: repairedSync
      ? `Pembersihan ghost selesai (${cleanedCount} sisa data dibersihkan, 3 layer tersinkron).`
      : `Pembersihan parsial: masih ada ${afterAudit.totalGhostCount} sisa ghost di storage.`,
    details: details.length > 0 ? details : undefined,
  });

  return {
    audit: afterAudit,
    cleanedCount,
    repairedSync,
    error: !idbRes.success ? idbRes.error : lsRes.error,
  };
}
