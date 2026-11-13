import { ActivityLogEntry, PublicAppUser, StoryboardProject, UserRole } from '../types';

const DRAFT_PREFIX = 'ugc_master_user_draft_v3_';
const CURRENT_PROJ_PREFIX = 'ugc_master_current_proj_v3_';
export const SESSION_USER_KEY = 'ugc_master_session_user_v3';
export const SPREADSHEET_URL = '';

export function sanitizeTabName(raw: string): string {
  const cleaned = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'user';
}

export interface SheetsSyncResult {
  success: boolean;
  timestamp: string;
  savedCount?: number;
  sheetTabName?: string;
  needsReauth?: boolean;
  error?: string;
}

function nowTimeId(): string {
  return new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function stripHugeBase64ForDraft(projects: StoryboardProject[]): StoryboardProject[] {
  return projects.map((proj) => {
    const cloned = { ...proj };
    if (typeof cloned.referenceImage === 'string' && cloned.referenceImage.length > 200000) {
      cloned.referenceImage = undefined;
    }
    if (Array.isArray(cloned.referenceImages)) {
      cloned.referenceImages = cloned.referenceImages.filter(
        (img) => typeof img === 'string' && img.length <= 200000
      );
    }
    return cloned;
  });
}

export function saveUserDraftMirror(
  username: string,
  projects: StoryboardProject[],
  currentProjectId: string
): void {
  if (typeof window === 'undefined' || !username) return;
  const key = `${DRAFT_PREFIX}${sanitizeTabName(username)}`;
  const projKey = `${CURRENT_PROJ_PREFIX}${sanitizeTabName(username)}`;
  try {
    localStorage.setItem(projKey, currentProjectId);
    const json = JSON.stringify(projects);
    if (json.length < 3500000) {
      localStorage.setItem(key, json);
    } else {
      localStorage.setItem(key, JSON.stringify(stripHugeBase64ForDraft(projects)));
    }
  } catch {}
}

export function loadUserDraftMirror(username: string): {
  projects: StoryboardProject[] | null;
  currentProjectId: string | null;
} {
  if (typeof window === 'undefined' || !username) {
    return { projects: null, currentProjectId: null };
  }
  const key = `${DRAFT_PREFIX}${sanitizeTabName(username)}`;
  const projKey = `${CURRENT_PROJ_PREFIX}${sanitizeTabName(username)}`;
  try {
    const raw = localStorage.getItem(key);
    const currentProjectId = localStorage.getItem(projKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return { projects: parsed as StoryboardProject[], currentProjectId };
      }
    }
  } catch {}
  return { projects: null, currentProjectId: null };
}

export function mergeDraftImagesIntoSheetProjects(
  sheetProjects: StoryboardProject[],
  draftProjects: StoryboardProject[] | null
): StoryboardProject[] {
  if (!draftProjects || draftProjects.length === 0) return sheetProjects;
  const draftMap = new Map(draftProjects.map((d) => [d.id, d]));
  return sheetProjects.map((proj) => {
    const draft = draftMap.get(proj.id);
    if (!draft) return proj;
    const hasSheetImages =
      (proj.referenceImages && proj.referenceImages.length > 0) || Boolean(proj.referenceImage);
    if (hasSheetImages) return proj;
    return {
      ...proj,
      referenceImage: draft.referenceImage || proj.referenceImage,
      referenceImages: draft.referenceImages || proj.referenceImages,
    };
  });
}

export async function inspectSheetsMetadata(_token: string): Promise<{
  success: boolean;
  spreadsheetTitle?: string;
  spreadsheetUrl: string;
  tabs?: string[];
  isInitialized?: boolean;
  usersCount?: number;
  needsReauth?: boolean;
  error?: string;
}> {
  return {
    success: true,
    spreadsheetTitle: 'Local Studio Storage',
    spreadsheetUrl: SPREADSHEET_URL,
    tabs: [],
    isInitialized: true,
    usersCount: 1,
  };
}

export async function bootstrapSheetsDatabase(
  _token: string,
  _actorUsername = 'admin'
): Promise<{
  success: boolean;
  createdTabs?: string[];
  adminSeeded?: boolean;
  spreadsheetTitle?: string;
  needsReauth?: boolean;
  error?: string;
}> {
  return {
    success: true,
    createdTabs: [],
    adminSeeded: true,
    spreadsheetTitle: 'Local Studio Storage',
  };
}

export async function authenticateUserViaSheets(
  _token: string,
  username: string,
  _password: string
): Promise<{
  success: boolean;
  user?: PublicAppUser;
  needsReauth?: boolean;
  error?: string;
}> {
  const clean = sanitizeTabName(username || 'creator');
  return {
    success: true,
    user: {
      id: `usr_${clean}`,
      username: clean,
      displayName: clean === 'admin' ? 'Admin Studio' : clean,
      email: `${clean}@ugcmaster.studio`,
      role: clean === 'admin' ? 'admin' : 'user',
      sheetTabName: clean,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    },
  };
}

export async function fetchUserProjectsFromSheets(
  _token: string,
  user: PublicAppUser
): Promise<{
  success: boolean;
  projects: StoryboardProject[];
  sheetTabName: string;
  needsReauth?: boolean;
  error?: string;
}> {
  const draft = loadUserDraftMirror(user.username);
  return {
    success: true,
    projects: draft.projects || [],
    sheetTabName: user.sheetTabName || sanitizeTabName(user.username),
  };
}

export async function syncProjectsToSheets(
  _token: string,
  user: PublicAppUser,
  projects: StoryboardProject[],
  _saveMode: 'AUTO_SAVE_1M' | 'MANUAL_SAVE' | 'PROJECT_MUTATION' = 'MANUAL_SAVE'
): Promise<SheetsSyncResult> {
  const timestamp = nowTimeId();
  const currentProjectId = projects[0]?.id || '';
  saveUserDraftMirror(user.username, projects, currentProjectId);
  return {
    success: true,
    timestamp,
    savedCount: projects.length,
    sheetTabName: user.sheetTabName || sanitizeTabName(user.username),
  };
}

export async function logActivityToSheets(
  _token: string | null,
  _params: {
    userId: string;
    username: string;
    role: UserRole;
    action: string;
    target: string;
    details: string;
    status?: 'success' | 'error' | 'info';
  }
): Promise<void> {
  return;
}

export async function fetchAdminUsers(): Promise<{
  success: boolean;
  users?: Array<PublicAppUser & { hasPassword?: boolean }>;
  needsReauth?: boolean;
  error?: string;
}> {
  return { success: true, users: [] };
}

export async function fetchAdminActivityLogs(): Promise<{
  success: boolean;
  logs?: ActivityLogEntry[];
  needsReauth?: boolean;
  error?: string;
}> {
  return { success: true, logs: [] };
}
