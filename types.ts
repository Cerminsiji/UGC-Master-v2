export interface SceneMotionControl {
  danceStyle?: string;
  cameraMovement?: string;
  aestheticEffect?: string;
  motionIntensity?: 'Subtle' | 'Medium' | 'Dynamic' | 'High Energy';
  beatTempo?: 'Slow (70-90 BPM)' | 'Medium (100-120 BPM)' | 'Fast (125-140 BPM)';
  aspectRatio?: '9:16' | '16:9' | '1:1';
  customMotionNotes?: string;
}

export interface Scene {
  id: string;
  order: number;
  cameraAngle: string;
  visualAction: string;
  popupText: string;
  soundEffect: string;
  dialogVO: string;
  notesMood: string;
  duration: number; // in seconds
  googleFlowPrompt?: string; // Prompt Google Flow Video UGC yang selalu mengikuti referensi image
  imageReferenceNote?: string; // Catatan kepatuhan visual terhadap referensi image
  motionControl?: SceneMotionControl;
}

export interface UGCTemplateCategory {
  id: string;
  name: string;
  iconName: string;
  badgeText: string;
  description: string;
  recommendedDuration: number;
  categoryHashtags?: string[];
  defaultScenes: Omit<Scene, 'id' | 'order'>[];
}

export interface VoiceToneOption {
  id: string;
  name: string;
  badge: string;
  pacing: string;
  description: string;
  directive: string;
  sampleOpener: string;
}

export interface HookVariant {
  id: string;
  name: string; // e.g. "Hook A (Utama)", "Hook B (Visual Shock)"
  type: string;
  dialogVO: string;
  visualAction: string;
  popupText: string;
  soundEffect: string;
  notesMood?: string;
  duration: number;
}

export interface ShotItem {
  id: string;
  type: 'A-Roll (Talent/Muka)' | 'B-Roll (Produk/Tangan)' | 'Detail Tekstur/Unboxing' | 'Audio Foley/SFX';
  description: string;
  sceneRef: number; // e.g. Adegan 1
  propsNeeded?: string;
  isCompleted: boolean;
}

export type UGCPersona =
  | 'Wanita Muda / Gen Z'
  | 'Hijaber Trendy / Muslimah Modern'
  | 'Ibu Muda / Mama Hemat Cerdas'
  | 'Wanita Karir / Corporate Office'
  | 'Beauty & Skincare Junkie'
  | 'Ibu Hamil & Menyusui (Busui)'
  | 'Fashion Stylist / OOTD Enthusiast'
  | 'Gadis Desa / Hidup Asri & Alami'
  | 'Pria Dewasa / Bapak Relatable'
  | 'Pria Muda / Gen Z Bro'
  | 'Pria Grooming & Maskulin'
  | 'Cowok Gym & Fitness Bro'
  | 'Otomotif & Bikers / Car Enthusiast'
  | 'Dokter / Tenaga Medis / Ahli Edukasi'
  | 'Mahasiswa Hemat / Anak Kosan'
  | 'Tech & Gadget Enthusiast'
  | 'Gamer & Streamer'
  | 'UMKM / Owner Brand & Pejuang Usaha'
  | 'Foodie & Kuliner / Home Chef'
  | 'Traveler / Backpacker & Petualang'
  | 'Pet Parent / Pecinta Hewan'
  | 'Minimalis & Eco-Friendly Lifestyle'
  | 'Kreator Faceless / Hanya Tangan (Tanpa Muka)'
  | 'Semua (Netral Universal)'
  | (string & {});

export interface StoryboardProject {
  id: string;
  title: string;
  categoryId: string;
  productName?: string;
  brandName?: string;
  productUrl?: string; // Link hasil ekstraksi produk
  referenceImage?: string; // Gambar referensi utama Google Flow
  referenceImages?: string[]; // Multi-gambar referensi visual (untuk pembuatan storyboard & Google Flow)
  productDescription?: string; // Deskripsi produk
  keySellingPoints?: string; // Parameter UGC / USP
  persona?: UGCPersona; // Persona talent
  personaExplanation?: string; // Penjelasan alasan pemilihan persona talent
  tone?: string; // Voice tone
  cameraAngleStyle?: string; // Gaya angle kamera pilihan
  cameraStyleExplanation?: string; // Penjelasan alasan pemilihan sudut kamera
  preferredCameraAngles?: string[]; // Daftar sudut kamera spesifik
  targetAudience?: string;
  targetPlatform?: string;
  targetDuration?: number; // Target durasi video (detik)
  caption?: string; // Auto caption & hashtags (max 150 chars)
  physicsConsistencyCheck?: boolean;
  scenes: Scene[];
  hookVariants?: HookVariant[];
  shotList?: ShotItem[];
  createdAt: string;
  updatedAt: string;
}

export interface AIGenerateParams {
  category: string;
  productName: string;
  brandName?: string;
  productUrl?: string;
  referenceImage?: string;
  referenceImages?: string[];
  productDescription?: string;
  targetAudience?: string;
  keySellingPoints?: string;
  persona?: UGCPersona;
  personaExplanation?: string;
  tone: string;
  cameraAngleStyle?: string;
  cameraStyleExplanation?: string;
  preferredCameraAngles?: string[];
  targetDuration: number;
  targetSceneCount?: number;
  targetPlatform: string;
  language: 'id' | 'en';
  physicsConsistencyCheck?: boolean;
}

export interface AutoDetectResult {
  productName: string;
  brandName?: string;
  productUrl?: string;
  referenceImage?: string;
  referenceImages?: string[];
  category: string;
  productDescription: string;
  targetAudience: string;
  keySellingPoints: string;
  persona?: UGCPersona;
  personaExplanation?: string;
  tone: string;
  cameraAngleStyle?: string;
  cameraStyleExplanation?: string;
  preferredCameraAngles?: string[];
  targetPlatform: string;
  targetDuration: number;
  suggestedCaption?: string;
  detectedTags?: string[];
  detectionSummary?: string;
  price?: string;
  imageUrl?: string;
  platform?: string;
}

export interface AIHookOption {
  type: string;
  formulaGroup?:
    | 'Visual & Proof'
    | 'Psikologi & FOMO'
    | 'Cerita & Relatable'
    | 'Edukasi & Twist'
    | 'Interaktif & Tren';
  hookDialog: string;
  visualAction: string;
  popupText: string;
  sfx: string;
}

export interface RateCardConfig {
  creatorTier: 'Pemula (1k-10k)' | 'Nano (10k-50k)' | 'Micro (50k-250k)' | 'Mid-Tier (250k+)';
  basePrice: number;
  videoCount: number;
  hookCount: number; // extra hook variants
  hasRawFootage: boolean;
  usageRightsDays: 0 | 30 | 60 | 90 | 180 | 365;
  hasSparkCode: boolean;
  fastDelivery: boolean;
  notes?: string;
}

export type StoryboardViewMode =
  | 'cards'
  | 'table'
  | 'motion_control'
  | 'tiktok_dance'
  | 'rate_card'
  | 'meta_cleaner';

export interface DanceStoryboardScene extends Scene {
  beatCue?: string;
  choreographyMove?: string;
  cameraChoreo?: string;
}

export interface DanceStoryboardResult {
  title: string;
  danceStyle: string;
  bpmRange: string;
  choreoConcept: string;
  soundRecommendation: string;
  outfitNotes: string;
  caption: string;
  hashtags?: string[];
  scenes: DanceStoryboardScene[];
}

export type StorageDeployAction =
  | 'save'
  | 'hydrate'
  | 'create'
  | 'duplicate'
  | 'delete'
  | 'clear_all'
  | 'clear_others'
  | 'cleanup_ghosts'
  | 'deduplicate'
  | 'sync_repair';

export type StorageDeployStatus = 'success' | 'warning' | 'error';

export interface StorageDeployLogEntry {
  id: string;
  timestamp: string;
  action: StorageDeployAction;
  status: StorageDeployStatus;
  tier?: string;
  localCount: number;
  idbCount: number | null;
  memoryCount: number;
  ghostCount: number;
  duplicateCount: number;
  message: string;
  details?: string[];
}

export type GhostDataType =
  | 'legacy_key'
  | 'idb_orphan'
  | 'ls_orphan'
  | 'memory_orphan'
  | 'dangling_active_pointer'
  | 'broken_payload';

export interface GhostDataItem {
  id: string;
  type: GhostDataType;
  layer: 'localStorage' | 'indexedDB' | 'memory';
  keyOrProjectId: string;
  title: string;
  reason: string;
  sizeBytes?: number;
}

export interface DuplicateProjectMember {
  id: string;
  title: string;
  productName?: string;
  updatedAt?: string;
  createdAt?: string;
  sceneCount: number;
  source: 'memory' | 'localStorage' | 'indexedDB';
}

export interface DuplicateProjectGroup {
  signature: string;
  reason: 'duplicate_id' | 'identical_title_product' | 'copy_clone';
  label: string;
  keepProjectId: string;
  duplicateProjects: DuplicateProjectMember[];
}

export interface StorageLayerSnapshot {
  available: boolean;
  projectCount: number;
  activeProjectId: string | null;
  bytesUsed: number;
  updatedAt?: string | null;
  projectIds: string[];
  error?: string;
}

export interface StorageAuditReport {
  auditedAt: string;
  health: 'healthy' | 'warning' | 'critical';
  memory: StorageLayerSnapshot;
  localStorage: StorageLayerSnapshot;
  indexedDB: StorageLayerSnapshot;
  legacyKeys: string[];
  ghostItems: GhostDataItem[];
  duplicateGroups: DuplicateProjectGroup[];
  totalGhostCount: number;
  totalDuplicateCount: number;
  isSynced: boolean;
}

