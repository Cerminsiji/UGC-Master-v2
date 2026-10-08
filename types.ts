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
}

export interface UGCTemplateCategory {
  id: string;
  name: string;
  iconName: string;
  badgeText: string;
  description: string;
  recommendedDuration: number;
  defaultScenes: Omit<Scene, 'id' | 'order'>[];
}

export interface HookVariant {
  id: string;
  name: string; // e.g. "Varian A (FOMO)", "Varian B (Visual Shock)"
  type: string;
  dialogVO: string;
  visualAction: string;
  popupText: string;
  soundEffect: string;
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
  referenceImage?: string; // URL atau gambar referensi visual Google Flow
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
  caption?: string; // Auto caption & hashtags (max 150 chars)
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
}

export interface AutoDetectResult {
  productName: string;
  brandName?: string;
  productUrl?: string;
  referenceImage?: string;
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
  type: 'Visual Shock' | 'Negative Hook' | 'Curiosity / Question' | 'FOMO / Secret' | 'Relatable Pain Point';
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

export type StoryboardViewMode = 'cards' | 'table' | 'rate_card';
