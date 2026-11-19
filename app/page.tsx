'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  saveProjectsToLocalStorage,
  loadProjectsFromLocalStorage,
  loadProjectsFromIndexedDB,
  mergeIndexedDBImagesIntoProjects,
  clearLegacyAdminStorageKeys,
  appendDeployLog,
  auditProjectStorage,
  saveProjectsToIndexedDBWithStatus,
  AUTO_SAVE_INTERVAL_SECONDS,
  nowTimeId,
} from '@/utils/storyboardStorage';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { SortableSceneCard } from '@/components/SortableSceneCard';
import { PasswordGate, AUTH_STORAGE_KEY } from '@/components/PasswordGate';
import { DirectLinkExtractorBar } from '@/components/DirectLinkExtractorBar';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  description: string;
  details?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger' | 'warning';
  isProcessing?: boolean;
  onConfirm: () => void | Promise<void>;
}
const ScriptTableView = dynamic(
  () => import('@/components/ScriptTableView').then((mod) => mod.ScriptTableView),
  {
    ssr: false,
    loading: () => (
      <div className="bg-[#0e1422] border border-[#1d273e] rounded-2xl p-8 text-center text-xs text-slate-400 animate-pulse">
        Memuat tampilan tabel storyboard...
      </div>
    ),
  }
);
const MotionControlPanel = dynamic(
  () => import('@/components/MotionControlPanel').then((mod) => mod.MotionControlPanel),
  {
    ssr: false,
    loading: () => (
      <div className="bg-[#0e1422] border border-[#1d273e] rounded-2xl p-8 text-center text-xs text-slate-400 animate-pulse">
        Memuat Motion Control Studio...
      </div>
    ),
  }
);
const RateCardCalculator = dynamic(
  () => import('@/components/RateCardCalculator').then((mod) => mod.RateCardCalculator),
  {
    ssr: false,
    loading: () => (
      <div className="bg-[#0e1422] border border-[#1d273e] rounded-2xl p-8 text-center text-xs text-slate-400 animate-pulse">
        Memuat Kalkulator Rate Card...
      </div>
    ),
  }
);
const MetaCleanerPro = dynamic(
  () => import('@/components/MetaCleanerPro').then((mod) => mod.MetaCleanerPro),
  {
    ssr: false,
    loading: () => (
      <div className="bg-[#0e1422] border border-[#1d273e] rounded-2xl p-10 text-center space-y-2 animate-pulse">
        <div className="text-sm font-bold text-white">Memuat MetaCleaner V 2.0...</div>
        <div className="text-xs text-slate-400">Menyiapkan engine inspeksi & pembersihan metadata video</div>
      </div>
    ),
  }
);
const AIGeneratorModal = dynamic(
  () => import('@/components/AIGeneratorModal').then((mod) => mod.AIGeneratorModal),
  { ssr: false }
);
const HookGeneratorModal = dynamic(
  () => import('@/components/HookGeneratorModal').then((mod) => mod.HookGeneratorModal),
  { ssr: false }
);
const TeleprompterModal = dynamic(
  () => import('@/components/TeleprompterModal').then((mod) => mod.TeleprompterModal),
  { ssr: false }
);
const ExportModal = dynamic(
  () => import('@/components/ExportModal').then((mod) => mod.ExportModal),
  { ssr: false }
);
const ProjectManagerModal = dynamic(
  () => import('@/components/ProjectManagerModal').then((mod) => mod.ProjectManagerModal),
  { ssr: false }
);
import { UGC_CATEGORIES } from '@/data/categories';
import {
  Scene,
  StoryboardProject,
  UGCTemplateCategory,
  AIGenerateParams,
  AIHookOption,
  StoryboardViewMode,
  HookVariant,
  AutoDetectResult,
  StorageDeployAction,
} from '@/types';
import { copyToClipboard, generateId, postJsonWithRetry, filesToReferenceImages } from '@/utils/helpers';
import { formatShortCaption, generateRichFallback, UGC_RD_HOOK_ARCHETYPES } from '@/lib/gemini-ugc';
import {
  Plus,
  Sparkles,
  Flame,
  CheckCircle2,
  Film,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Copy,
  Code,
  Check,
  Zap,
  Camera,
  Upload,
  Image as ImageIcon,
  X,
  Loader2,
  GripVertical,
  Clock,
} from 'lucide-react';

// Initial project matching UGC Before & After format with 6 rich scenes
const INITIAL_BEFORE_AFTER_PROJECT: StoryboardProject = {
  id: 'proj_before_after_sago',
  title: 'Storyboard Before & After',
  categoryId: 'before_after',
  productName: 'Sago Green Coffee',
  productUrl: 'https://vt.tiktok.com/ZS2mSagoDiet/',
  productDescription: 'Kopi hijau herbal penurun berat badan alami dengan ekstrak sago yang mengontrol nafsu makan seharian.',
  keySellingPoints: 'Rasa enak gak pahit, bikin kenyang lebih lama, aman lambung, BPOM & Halal.',
  persona: 'Pria',
  tone: 'Santai, Mengalir & Natural (Teman Curhat)',
  targetPlatform: 'TikTok Shop',
  targetAudience: 'Pria/wanita diet & sehat',
  caption: 'Cobain Sago Green Coffee! Bikin makin pede & hasil nyata. Klik keranjang di bawah mumpung promo! ✨ #fyp #viral',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  hookVariants: [
    {
      id: 'h_a',
      name: 'Hook A (Curhat Relatable)',
      type: 'Relatable Pain Point',
      dialogVO: 'Diet gagal mulu, kancing kemeja pada lepas, pusing!',
      visualAction: 'Bapak bertubuh buncit garuk kepala sambil nelpon di depan cermin, kancing baju meregang sempit.',
      popupText: 'DIET GAGAL MULU, BAJU GAK MUAT?! 😫',
      soundEffect: 'Phone ring & sigh',
      duration: 2,
    },
    {
      id: 'h_b',
      name: 'Hook B (Visual Shock)',
      type: 'Visual Shock',
      dialogVO: 'Sumpah kalian harus liat celana lama gue yang dulu gak muat ini!',
      visualAction: 'Bapak menarik celana jeans lama yang sekarang longgar hingga muat 2 kepalan tangan.',
      popupText: 'CELANA LAMA LANGSUNG KEDODORAN 😱',
      soundEffect: 'Vine boom / Bass drop & Gasp',
      duration: 2,
    },
    {
      id: 'h_c',
      name: 'Hook C (FOMO / Rahasia)',
      type: 'FOMO / Secret',
      dialogVO: 'Jangan skip dulu! Ini rahasia perut buncit kempes tanpa tersiksa diet ekstrem.',
      visualAction: 'Talent menunjuk ke kamera dengan tatapan serius, memegang sachet kopi hijau.',
      popupText: 'RAHASIA KEMPES 8 KG TANPA LEMAS 🤫',
      soundEffect: 'Whisper sound & Mystery chime',
      duration: 2,
    },
  ],
  scenes: [
    {
      id: 'sc_1',
      order: 1,
      cameraAngle: 'Medium Shot',
      visualAction: 'Bapak bertubuh buncit garuk kepala sambil nelpon di depan cermin, kancing baju meregang sempit.',
      popupText: 'DIET GAGAL MULU, BAJU GAK MUAT?! 😫',
      soundEffect: 'Phone ring & sigh',
      dialogVO: 'Diet gagal mulu, kancing kemeja pada lepas, pusing!',
      notesMood: 'Gaya teks: Chat Bubble. Pencahayaan redup dramatis.',
      duration: 2,
      googleFlowPrompt: '[Image 1 Reference: Sago Green Coffee] Medium shot of middle-aged creator scratching head in front of mirror with tight shirt, holding Sago Green Coffee sachet with natural hand grip biomechanics, realistic mass inertia, consistent directional bathroom mirror lighting with matching cast shadows, zero morphing - On-Screen Pop-up Text Overlay: "DIET GAGAL MULU, BAJU GAK MUAT?! 😫" - packaging branding adhering to reference image, 9:16 vertical UGC video, 4k 60fps.',
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
    },
    {
      id: 'sc_2',
      order: 2,
      cameraAngle: 'Close-up',
      visualAction: 'Bapak menyeduh sachet Sago Green Coffee ke cangkir bening, aroma uap mengepul.',
      popupText: 'UNTUNG KETEMU KOPI SAGO INI ☕✨',
      soundEffect: 'Water pouring & gentle stir',
      dialogVO: 'Untung nemu Sago Green Coffee, rasanya gak pahit sama sekali!',
      notesMood: 'Gaya teks: Clean Minimalist. Warm coffee morning aesthetic.',
      duration: 3,
      googleFlowPrompt: '[Image 1 Reference: Sago Green Coffee] Close-up shot pouring coffee powder from green sachet into clear glass mug, boiling water swirling with realistic fluid dynamics and gravity, authentic sachet color and typography matching reference image, directional morning sunlight with soft contact shadows, vertical 9:16 4k 60fps.',
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
    },
    {
      id: 'sc_3',
      order: 3,
      cameraAngle: 'Over the Shoulder',
      visualAction: 'Bapak minum santai di sofa ruang tamu sambil cek jadwal kerja tanpa rasa lemas.',
      popupText: 'GA GAMPANG LAPER SEHARIAN 🔥',
      soundEffect: 'Clock ticking fast & soft chime',
      dialogVO: 'Biasanya jam 10 pagi udah nyari gorengan, sekarang kenyang sampai siang!',
      notesMood: 'Gaya teks: Headline Banner. Natural window light.',
      duration: 3,
      googleFlowPrompt: '[Image 1 Reference: Sago Green Coffee] Over-the-shoulder shot sipping hot coffee mug on cozy living room sofa, anatomically correct hand holding mug, Sago Green Coffee retail packaging visible on coffee table adhering to reference image, consistent directional window light with natural shadows, 4k 60fps.',
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
    },
    {
      id: 'sc_4',
      order: 4,
      cameraAngle: 'Eye Level Medium',
      visualAction: 'Transisi cepat side-by-side: Foto perut buncit kemeja sempit VS sekarang kancing rapi & perut rata.',
      popupText: '3 MINGGU TURUN 4.5 KG! 📉',
      soundEffect: 'Camera shutter & Cha-ching',
      dialogVO: 'Baru 3 minggu, celana lama udah pada kedodoran!',
      notesMood: 'Gaya teks: Bold Red/Green Before After. Split screen dynamic.',
      duration: 3,
      googleFlowPrompt: '[Image 1 Reference: Sago Green Coffee] Dynamic before-after reveal, creator showing loose waistline on trousers while smiling confidently with Sago Green Coffee box, authentic physics and mass, photorealistic lighting with consistent ambient occlusion, 9:16 vertical smartphone format.',
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
    },
    {
      id: 'sc_5',
      order: 5,
      cameraAngle: 'Macro / Detail',
      visualAction: 'Bapak memegang box produk dengan label BPOM & Halal terlihat jelas di kamera.',
      popupText: '100% HERBAL & BPOM AMAN 🌿',
      soundEffect: 'Glitter chime / Sparkle sound',
      dialogVO: 'Aman di lambung, herbal alami, udah BPOM & Halal pastinya.',
      notesMood: 'Gaya teks: Minimal White Outline. High sharpness focus.',
      duration: 2,
      googleFlowPrompt: '[Image 1 Reference: Sago Green Coffee] Macro close-up shot rotating box packaging in hands, solid 5-finger physical grip without clipping, crystal-clear focus on BPOM seal and green brand typography matching reference image, directional softbox illumination with matching shadows, 4k 60fps.',
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
    },
    {
      id: 'sc_6',
      order: 6,
      cameraAngle: 'Medium Close-up',
      visualAction: 'Bapak tersenyum segar mengacungkan jempol sambil menunjuk ke arah keranjang di bawah.',
      popupText: 'KLIK KERANJANG DI BAWAH SEKARANG! 🛒👇',
      soundEffect: 'Vine boom & Pop click',
      dialogVO: 'Mumpung lagi promo diskon bundle, langsung klik keranjang di bawah ya!',
      notesMood: 'Gaya teks: Neon Pulsing CTA. High energy closing CTA.',
      duration: 3,
      googleFlowPrompt: '[Image 1 Reference: Sago Green Coffee] Medium close-up closing shot, smiling creator pointing towards shopping cart icon below holding Sago Green Coffee packaging, natural biomechanical arm movement, unified key lighting with cast shadows, zero warp, crisp vertical 9:16 UGC video.',
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
    },
  ],
};

export default function HomePage() {
  const [mounted, setMounted] = useState(false);

  // Studio password gate auth state (local-only, no admin/user roles)
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Projects State (stored in browser Local Storage)
  const [projects, setProjects] = useState<StoryboardProject[]>([INITIAL_BEFORE_AFTER_PROJECT]);
  const [currentProjectId, setCurrentProjectId] = useState<string>(INITIAL_BEFORE_AFTER_PROJECT.id);

  // View Mode: 'cards' | 'table' | 'rate_card' | 'meta_cleaner'
  const [viewMode, setViewMode] = useState<StoryboardViewMode>('cards');

  const [copiedCaption, setCopiedCaption] = useState(false);
  const [isCaptionOpen, setIsCaptionOpen] = useState(true);
  const [isGeneratingCaption, setIsGeneratingCaption] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Active Hook variant index for Scene 1
  const [activeHookIndex, setActiveHookIndex] = useState(0);

  // Modals state
  const [isAIGeneratorOpen, setIsAIGeneratorOpen] = useState(false);
  const [aiGeneratorInitialInput, setAiGeneratorInitialInput] = useState('');
  const [isHooksModalOpen, setIsHooksModalOpen] = useState(false);
  const [isTeleprompterOpen, setIsTeleprompterOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportModalInitialTab, setExportModalInitialTab] = useState<'table' | 'caption' | 'script' | 'capcut' | 'json'>('table');
  const [isProjectsModalOpen, setIsProjectsModalOpen] = useState(false);
  const [isJsonCopied, setIsJsonCopied] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [enhancingSceneId, setEnhancingSceneId] = useState<string | null>(null);
  const [activeDragSceneId, setActiveDragSceneId] = useState<string | null>(null);

  const sceneSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Local Storage & 10-Second Auto-Save State
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | 'pending'>('saved');
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [autoSaveCountdown, setAutoSaveCountdown] = useState<number>(AUTO_SAVE_INTERVAL_SECONDS);
  const [deployLogsVersion, setDeployLogsVersion] = useState(0);

  const mainScrollRef = useRef<HTMLElement | null>(null);
  const projectsRef = useRef(projects);
  const currentProjectIdRef = useRef(currentProjectId);
  const hasUnsavedChangesRef = useRef(false);

  useEffect(() => {
    projectsRef.current = projects;
    currentProjectIdRef.current = currentProjectId;
  }, [projects, currentProjectId]);

  // Reset scroll position immediately when switching tabs so MetaCleaner / Studio always appears at the top
  useEffect(() => {
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [viewMode]);

  // Show temporary toast notification
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  }, []);

  // Hydrate auth gate & projects from Local Storage + IndexedDB on mount
  useEffect(() => {
    setMounted(true);
    let cancelled = false;

    let initialProjects: StoryboardProject[] | null = null;
    try {
      const authed = localStorage.getItem(AUTH_STORAGE_KEY) === 'true';
      setIsAuthenticated(authed);

      const loaded = loadProjectsFromLocalStorage();
      if (loaded.projects && loaded.projects.length > 0) {
        initialProjects = loaded.projects;
        setProjects(loaded.projects);
        if (
          loaded.currentProjectId &&
          loaded.projects.some((p) => p.id === loaded.currentProjectId)
        ) {
          setCurrentProjectId(loaded.currentProjectId);
        } else {
          setCurrentProjectId(loaded.projects[0].id);
        }
        setLastSavedTime(nowTimeId());
      }
    } catch {}

    setIsStorageLoaded(true);

    // Restore full high-res reference images from IndexedDB if Local Storage trimmed them for quota
    void loadProjectsFromIndexedDB().then((idb) => {
      if (cancelled || !idb.projects || idb.projects.length === 0) return;
      if (initialProjects && initialProjects.length > 0) {
        const localIds = new Set(initialProjects.map((p) => p.id));
        const idbOrphans = idb.projects.filter((p) => !localIds.has(p.id));
        if (idbOrphans.length > 0) {
          appendDeployLog({
            action: 'hydrate',
            status: 'warning',
            localCount: initialProjects.length,
            idbCount: idb.projects.length,
            memoryCount: initialProjects.length,
            ghostCount: idbOrphans.length,
            duplicateCount: 0,
            message: `Saat startup ditemukan ${idbOrphans.length} project tersangkut di IndexedDB yang tidak ada di LocalStorage.`,
            details: idbOrphans.map((o) => `Orphan IDB: "${o.title}" (${o.id})`),
          });
          setDeployLogsVersion((v) => v + 1);
        }
        setProjects((prev) => mergeIndexedDBImagesIntoProjects(prev, idb.projects!));
      } else {
        setProjects(idb.projects);
        if (idb.currentProjectId && idb.projects.some((p) => p.id === idb.currentProjectId)) {
          setCurrentProjectId(idb.currentProjectId);
        } else {
          setCurrentProjectId(idb.projects[0].id);
        }
        setLastSavedTime(nowTimeId());
        appendDeployLog({
          action: 'hydrate',
          status: 'warning',
          localCount: 0,
          idbCount: idb.projects.length,
          memoryCount: idb.projects.length,
          ghostCount: 0,
          duplicateCount: 0,
          message: `LocalStorage kosong; memulihkan ${idb.projects.length} project dari cadangan IndexedDB.`,
        });
        setDeployLogsVersion((v) => v + 1);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Core Local Storage Save Worker
  const performLocalSave = useCallback(
    (
      showFeedbackToast = false,
      overrideProjects?: StoryboardProject[],
      overrideProjectId?: string,
      logAction?: StorageDeployAction,
      logMessage?: string,
      logDetails?: string[]
    ) => {
      const list = overrideProjects ?? projectsRef.current;
      const activeId = overrideProjectId ?? currentProjectIdRef.current;
      if (!list || list.length === 0) return;

      setSaveStatus('saving');
      const res = saveProjectsToLocalStorage(list, activeId);
      if (res.success) {
        hasUnsavedChangesRef.current = false;
        setSaveStatus('saved');
        setLastSavedTime(res.timestamp);
        setAutoSaveCountdown(AUTO_SAVE_INTERVAL_SECONDS);
        if (showFeedbackToast) {
          showToast(
            res.trimmedLargeImages
              ? '💾 Tersimpan aman! Naskah di Local Storage & foto referensi di IndexedDB.'
              : '💾 Semua naskah berhasil disimpan ke Local Storage!'
          );
        }
      } else {
        setSaveStatus('error');
        if (showFeedbackToast) {
          showToast(res.error || 'Gagal menyimpan ke Local Storage.');
        }
      }

      const shouldRecordLog =
        Boolean(logAction) || showFeedbackToast || !res.success || Boolean(res.trimmedLargeImages);

      if (shouldRecordLog) {
        const effectiveAction: StorageDeployAction = logAction || 'save';
        void auditProjectStorage(list, activeId).then((audit) => {
          const status = !res.success
            ? 'error'
            : res.trimmedLargeImages || audit.totalGhostCount > 0 || audit.totalDuplicateCount > 0
            ? 'warning'
            : 'success';

          const details: string[] = [...(logDetails || [])];
          if (res.error) details.push(res.error);
          if (res.droppedCount && res.droppedCount > 0) {
            details.push(`${res.droppedCount} project lama terpotong dari LocalStorage karena batas quota.`);
          }
          if (audit.totalGhostCount > 0) {
            details.push(`Audit mendeteksi ${audit.totalGhostCount} sisa data ghost.`);
          }
          if (audit.totalDuplicateCount > 0) {
            details.push(`Audit mendeteksi ${audit.totalDuplicateCount} project ganda.`);
          }

          appendDeployLog({
            action: effectiveAction,
            status,
            tier: res.tier,
            localCount: res.savedCount,
            idbCount: audit.indexedDB.available ? audit.indexedDB.projectCount : null,
            memoryCount: list.length,
            ghostCount: audit.totalGhostCount,
            duplicateCount: audit.totalDuplicateCount,
            message:
              logMessage ||
              (res.success
                ? res.trimmedLargeImages
                  ? `Naskah disimpan (${res.tier || 'terkompresi'}), gambar penuh tetap di IndexedDB.`
                  : `Berhasil menyimpan ${list.length} naskah ke storage.`
                : res.error || 'Gagal menyimpan naskah ke LocalStorage.'),
            details: details.length > 0 ? details : undefined,
          });
          setDeployLogsVersion((v) => v + 1);
        });
      }
    },
    [showToast]
  );

  // 10-Second Auto-Save Interval to Local Storage
  useEffect(() => {
    if (!isAuthenticated || !isStorageLoaded) {
      setAutoSaveCountdown(AUTO_SAVE_INTERVAL_SECONDS);
      return;
    }

    const timer = setInterval(() => {
      setAutoSaveCountdown((prev) => {
        if (prev <= 1) {
          performLocalSave(false);
          return AUTO_SAVE_INTERVAL_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [isAuthenticated, isStorageLoaded, performLocalSave]);

  // Flush unsaved changes immediately before tab hide / page unload
  useEffect(() => {
    if (!isAuthenticated || !isStorageLoaded) return;

    const flushUnsaved = () => {
      if (hasUnsavedChangesRef.current && projectsRef.current.length > 0) {
        saveProjectsToLocalStorage(projectsRef.current, currentProjectIdRef.current);
        hasUnsavedChangesRef.current = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushUnsaved();
      }
    };

    window.addEventListener('beforeunload', flushUnsaved);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', flushUnsaved);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, isStorageLoaded]);

  // Explicit manual save action
  const handleManualSave = () => {
    performLocalSave(true);
  };

  const handleAuthSuccess = () => {
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, 'true');
    } catch {}

    const loaded = loadProjectsFromLocalStorage();
    const hasLocal = Boolean(loaded.projects && loaded.projects.length > 0);
    if (hasLocal && loaded.projects) {
      setProjects(loaded.projects);
      if (
        loaded.currentProjectId &&
        loaded.projects.some((p) => p.id === loaded.currentProjectId)
      ) {
        setCurrentProjectId(loaded.currentProjectId);
      } else {
        setCurrentProjectId(loaded.projects[0].id);
      }
    }
    setIsAuthenticated(true);

    void loadProjectsFromIndexedDB().then((idb) => {
      if (!idb.projects || idb.projects.length === 0) return;
      if (hasLocal) {
        setProjects((prev) => mergeIndexedDBImagesIntoProjects(prev, idb.projects!));
      } else {
        setProjects(idb.projects);
        if (idb.currentProjectId && idb.projects.some((p) => p.id === idb.currentProjectId)) {
          setCurrentProjectId(idb.currentProjectId);
        } else {
          setCurrentProjectId(idb.projects[0].id);
        }
      }
    });
  };

  // Active Project
  const currentProject = projects.find((p) => p.id === currentProjectId) || projects[0] || INITIAL_BEFORE_AFTER_PROJECT;

  // Active Category
  const activeCategory =
    UGC_CATEGORIES.find((c) => c.id === currentProject?.categoryId) ||
    UGC_CATEGORIES[8]; // before_after default

  // Generate full comprehensive storyboard JSON object
  const getFullStoryboardJSON = () => {
    return JSON.stringify(
      {
        id: currentProject.id,
        title: currentProject.title,
        category: activeCategory.name,
        categoryId: currentProject.categoryId,
        productName: currentProject.productName || '',
        productUrl: currentProject.productUrl || '',
        productDescription: currentProject.productDescription || '',
        keySellingPoints: currentProject.keySellingPoints || '',
        persona: currentProject.persona || 'Wanita',
        tone: currentProject.tone || '',
        targetPlatform: currentProject.targetPlatform || 'TikTok Shop',
        totalDuration: currentProject.scenes.reduce((sum, sc) => sum + (Number(sc.duration) || 0), 0),
        caption: currentProject.caption || '',
        hookVariants: currentProject.hookVariants || [],
        scenes: currentProject.scenes,
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    );
  };

  // 1-Click Copy Storyboard JSON to clipboard
  const handleCopyJSON = async () => {
    const jsonString = getFullStoryboardJSON();
    const ok = await copyToClipboard(jsonString);
    if (ok) {
      setIsJsonCopied(true);
      showToast('JSON Storyboard berhasil disalin ke clipboard! 📋');
      setTimeout(() => setIsJsonCopied(false), 2500);
    } else {
      showToast('Gagal menyalin JSON ke clipboard.');
    }
  };

  const handleOpenExportWithTab = (tab: 'table' | 'caption' | 'script' | 'capcut' | 'json' = 'table') => {
    setExportModalInitialTab(tab);
    setIsExportModalOpen(true);
  };

  const handleLogout = () => {
    if (projectsRef.current.length > 0) {
      saveProjectsToLocalStorage(projectsRef.current, currentProjectIdRef.current);
      hasUnsavedChangesRef.current = false;
    }
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      clearLegacyAdminStorageKeys();
    } catch {}
    setIsAuthenticated(false);
    showToast('Studio telah dikunci');
  };

  // Update current project helper
  const updateCurrentProject = (updater: (prev: StoryboardProject) => StoryboardProject) => {
    hasUnsavedChangesRef.current = true;
    setSaveStatus('pending');
    setProjects((prev) => {
      const updatedList = prev.map((p) => {
        if (p.id === currentProjectId) {
          const updated = updater(p);
          return {
            ...updated,
            updatedAt: new Date().toISOString(),
          };
        }
        return p;
      });
      return updatedList;
    });
  };

  // Title change
  const handleTitleChange = (newTitle: string) => {
    updateCurrentProject((p) => ({ ...p, title: newTitle }));
    showToast('Judul naskah diperbarui!');
  };

  // Build initial Hook A (from Scene 1) + Hook B (viral alternative) so A/B Hook testing always works
  const buildInitialHookVariants = useCallback(
    (
      scenes: Scene[],
      productName = 'Produk',
      usp = '',
      categoryName = 'UGC',
      personaName = ''
    ): HookVariant[] => {
      if (!scenes || scenes.length === 0) return [];
      const first = scenes[0];
      const isHandsOnly = personaName.toLowerCase().includes('faceless') || personaName.toLowerCase().includes('hanya tangan');
      const hookA: HookVariant = {
        id: generateId(),
        name: 'Hook A (Utama)',
        type: 'Utama',
        dialogVO: first.dialogVO,
        visualAction: first.visualAction,
        popupText: first.popupText,
        soundEffect: first.soundEffect,
        notesMood: first.notesMood,
        duration: Number(first.duration) || 3,
      };

      const candidateArch =
        UGC_RD_HOOK_ARCHETYPES.find(
          (a) =>
            ['reverse_psychology_warning', 'skeptic_turned_believer', 'social_spill_storytime', 'live_stress_test'].includes(a.id) &&
            !first.popupText?.toLowerCase().includes(a.name.split(' ')[0].toLowerCase())
        ) || UGC_RD_HOOK_ARCHETYPES[1];

      const altBuilt = candidateArch.buildSceneOne({
        productName: productName || 'Produk',
        usp: usp || 'kualitas terbaik dan praktis dipakai setiap hari',
        category: categoryName,
        isHandsOnly,
      });

      const shortType = candidateArch.name.split('/')[0].split('(')[0].trim().slice(0, 22);
      const hookB: HookVariant = {
        id: generateId(),
        name: `Hook B (${shortType})`,
        type: candidateArch.name,
        dialogVO: altBuilt.dialogVO,
        visualAction: altBuilt.visualAction,
        popupText: altBuilt.popupText,
        soundEffect: altBuilt.soundEffect,
        notesMood: altBuilt.notesMood,
        duration: Number(first.duration) || 3,
      };

      return [hookA, hookB];
    },
    []
  );

  // Select category
  const handleSelectCategory = (categoryOrId: UGCTemplateCategory | string) => {
    const categoryId = typeof categoryOrId === 'string' ? categoryOrId : categoryOrId.id;
    const cat = typeof categoryOrId === 'string' ? UGC_CATEGORIES.find((c) => c.id === categoryId) : categoryOrId;
    if (!cat) return;

    updateCurrentProject((p) => {
      const isAlreadySame = p.categoryId === cat.id;
      if (isAlreadySame) return p;

      const newScenes: Scene[] = cat.defaultScenes.map((sc, idx) => ({
        ...sc,
        id: generateId(),
        order: idx + 1,
        duration: Number(sc.duration) || 3,
      }));

      return {
        ...p,
        categoryId: cat.id,
        title: `Storyboard ${cat.name}`,
        scenes: newScenes,
        hookVariants: buildInitialHookVariants(
          newScenes,
          p.productName || 'Produk',
          p.keySellingPoints || '',
          cat.name,
          p.persona || ''
        ),
      };
    });
    setActiveHookIndex(0);

    showToast(`Format berganti ke: ${cat.name}`);
  };

  // Quick reset to default category scenes (uses ConfirmDialog instead of window.confirm)
  const handleResetToCategoryTemplate = (cat: UGCTemplateCategory) => {
    setConfirmDialog({
      isOpen: true,
      title: `Reset Adegan ke Template "${cat.name}"?`,
      description:
        'Semua adegan pada naskah aktif saat ini akan diganti dengan susunan template bawaan kategori ini.',
      confirmLabel: 'Reset Adegan',
      tone: 'warning',
      onConfirm: () => {
        setConfirmDialog(null);
        updateCurrentProject((p) => {
          const resetScenes: Scene[] = cat.defaultScenes.map((sc, idx) => {
            const popupText =
              sc.popupText && sc.popupText.trim()
                ? sc.popupText.trim()
                : idx === 0
                ? 'JANGAN SKIP DULU! 🔥'
                : 'SOLUSI TERBAIK ✨';
            return {
              ...sc,
              id: generateId(),
              order: idx + 1,
              duration: Number(sc.duration) || 3,
              popupText,
              imageReferenceNote:
                (sc as any).imageReferenceNote ||
                'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
              googleFlowPrompt:
                (sc as any).googleFlowPrompt ||
                `[Image 1 Reference: ${p.productName || 'Produk'}] Scene ${idx + 1} (${sc.cameraAngle}): ${sc.visualAction} - On-Screen Pop-up Text Overlay: "${popupText}" - strict physical laws, realistic gravity and mass inertia, natural hand biomechanics without clipping, consistent directional lighting with matching cast shadows, authentic camera motion, zero morphing, photorealistic 9:16 vertical, 4k 60fps.`,
            };
          });
          return {
            ...p,
            scenes: resetScenes,
            hookVariants: buildInitialHookVariants(
              resetScenes,
              p.productName || 'Produk',
              p.keySellingPoints || '',
              cat.name,
              p.persona || ''
            ),
          };
        });
        setActiveHookIndex(0);
        showToast(`Template di-reset ke default ${cat.name}`);
      },
    });
  };

  // Trigger AI modal prefilled with category
  const handleTriggerAICategory = (cat: UGCTemplateCategory) => {
    handleSelectCategory(cat.id);
    setIsAIGeneratorOpen(true);
  };

  // Update single scene (also keeps active Hook A/B variant synced when Scene 1 changes)
  const handleUpdateScene = (updatedScene: Scene) => {
    updateCurrentProject((p) => {
      const nextScenes = p.scenes.map((s) => (s.id === updatedScene.id ? updatedScene : s));
      const isFirstScene = p.scenes[0]?.id === updatedScene.id;
      if (!isFirstScene) {
        return { ...p, scenes: nextScenes };
      }

      const existingVariants =
        p.hookVariants && p.hookVariants.length > 0
          ? [...p.hookVariants]
          : [
              {
                id: generateId(),
                name: 'Hook A (Utama)',
                type: 'Utama',
                dialogVO: updatedScene.dialogVO,
                visualAction: updatedScene.visualAction,
                popupText: updatedScene.popupText,
                soundEffect: updatedScene.soundEffect,
                notesMood: updatedScene.notesMood,
                duration: Number(updatedScene.duration) || 3,
              },
            ];

      const safeIdx = Math.max(0, Math.min(activeHookIndex, existingVariants.length - 1));
      existingVariants[safeIdx] = {
        ...existingVariants[safeIdx],
        dialogVO: updatedScene.dialogVO,
        visualAction: updatedScene.visualAction,
        popupText: updatedScene.popupText,
        soundEffect: updatedScene.soundEffect,
        notesMood: updatedScene.notesMood,
        duration: Number(updatedScene.duration) || 3,
      };

      return {
        ...p,
        scenes: nextScenes,
        hookVariants: existingVariants,
      };
    });
  };

  // Delete scene
  const handleDeleteScene = (sceneId: string) => {
    if (currentProject.scenes.length <= 1) {
      showToast('Minimal harus ada 1 adegan dalam storyboard.');
      return;
    }

    updateCurrentProject((p) => {
      const filtered = p.scenes.filter((s) => s.id !== sceneId);
      const reordered = filtered.map((s, idx) => ({ ...s, order: idx + 1 }));
      return { ...p, scenes: reordered };
    });

    showToast('Adegan berhasil dihapus');
  };

  // Duplicate scene
  const handleDuplicateScene = (scene: Scene) => {
    updateCurrentProject((p) => {
      const index = p.scenes.findIndex((s) => s.id === scene.id);
      const newScene: Scene = {
        ...scene,
        id: generateId(),
        order: scene.order + 1,
        popupText: `${scene.popupText} (Copy)`,
      };

      const updated = [...p.scenes];
      updated.splice(index + 1, 0, newScene);
      return {
        ...p,
        scenes: updated.map((s, idx) => ({ ...s, order: idx + 1 })),
      };
    });

    showToast(`Adegan ${scene.order} berhasil diduplikasi!`);
  };

  // Move scene (button step)
  const handleMoveScene = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentProject.scenes.length) return;

    updateCurrentProject((p) => {
      const newScenes = arrayMove(p.scenes, index, targetIndex);
      return {
        ...p,
        scenes: newScenes.map((s, idx) => ({ ...s, order: idx + 1 })),
      };
    });
  };

  // Drag-and-drop reorder scenes via dnd-kit
  const handleReorderScenes = (activeId: string, overId: string) => {
    if (!activeId || !overId || activeId === overId) return;
    const oldIndex = currentProject.scenes.findIndex((s) => s.id === activeId);
    const newIndex = currentProject.scenes.findIndex((s) => s.id === overId);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    updateCurrentProject((p) => {
      const oIdx = p.scenes.findIndex((s) => s.id === activeId);
      const nIdx = p.scenes.findIndex((s) => s.id === overId);
      if (oIdx === -1 || nIdx === -1 || oIdx === nIdx) return p;
      const reordered = arrayMove(p.scenes, oIdx, nIdx).map((s, idx) => ({
        ...s,
        order: idx + 1,
      }));
      return {
        ...p,
        scenes: reordered,
      };
    });

    showToast(`Urutan adegan diperbarui: Adegan ${oldIndex + 1} → Adegan ${newIndex + 1}`);
  };

  const handleSceneDragStart = (event: DragStartEvent) => {
    setActiveDragSceneId(String(event.active.id));
  };

  const handleSceneDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragSceneId(null);
    if (over && active.id !== over.id) {
      handleReorderScenes(String(active.id), String(over.id));
    }
  };

  const handleSceneDragCancel = () => {
    setActiveDragSceneId(null);
  };

  // Add new scene
  const handleAddScene = () => {
    const newOrder = currentProject.scenes.length + 1;
    const newScene: Scene = {
      id: generateId(),
      order: newOrder,
      cameraAngle: 'Medium Shot',
      visualAction: 'Kreator memperlihatkan manfaat produk secara natural dengan interaksi fisik tangan nyata tanpa clipping dan bayangan jatuh konsisten.',
      popupText: 'HASIL MAKSIMAL ✨',
      soundEffect: 'Swoosh',
      dialogVO: 'Gak nyangka hasilnya bisa sebagus ini.',
      notesMood: 'Gaya teks: Modern Yellow. Pencahayaan directional natural dengan bayangan nyata.',
      duration: 3,
      googleFlowPrompt: `[Image 1 Reference: ${currentProject.productName || 'Produk'}] Scene ${newOrder} (Medium Shot): Kreator memperlihatkan manfaat produk secara natural dengan kontak fisik solid tanpa tembus - On-Screen Pop-up Text Overlay: "HASIL MAKSIMAL ✨" - strict physical laws, realistic gravity, natural hand biomechanics without clipping, consistent directional lighting with matching cast shadows, 9:16 vertical smartphone video, 4k 60fps.`,
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
    };

    updateCurrentProject((p) => ({
      ...p,
      scenes: [...p.scenes, newScene],
    }));

    showToast(`Adegan ${newOrder} ditambahkan!`);
  };

  // AI Enhance Scene (Contextual across full storyboard timeline)
  const handleEnhanceScene = async (targetScene: Scene) => {
    setEnhancingSceneId(targetScene.id);
    const sceneIdx = currentProject.scenes.findIndex((s) => s.id === targetScene.id);
    const resolvedIndex = sceneIdx >= 0 ? sceneIdx : Math.max(0, (targetScene.order || 1) - 1);

    try {
      const data = await postJsonWithRetry<{ success?: boolean; scene?: Partial<Scene>; contextual?: boolean }>(
        '/api/enhance-scene',
        {
          scene: targetScene,
          sceneIndex: resolvedIndex,
          allScenes: currentProject.scenes.map((s) => ({
            order: s.order,
            cameraAngle: s.cameraAngle,
            visualAction: s.visualAction,
            popupText: s.popupText,
            soundEffect: s.soundEffect,
            dialogVO: s.dialogVO,
            notesMood: s.notesMood,
            duration: s.duration,
          })),
          category: activeCategory.name,
          productName: currentProject.productName,
          productDescription: currentProject.productDescription,
          keySellingPoints: currentProject.keySellingPoints,
          persona: currentProject.persona,
          tone: currentProject.tone,
          cameraAngleStyle: currentProject.cameraAngleStyle,
          targetPlatform: currentProject.targetPlatform,
          targetAudience: currentProject.targetAudience,
          physicsConsistencyCheck: currentProject.physicsConsistencyCheck,
          instruction:
            'Poles adegan ini dengan menjaga kesinambungan narasi dan visual dari adegan sebelum dan sesudahnya, menggunakan gaya bahasa VO dan angle kamera yang segar serta tidak monoton.',
        }
      );

      if (data && data.success && data.scene) {
        handleUpdateScene({
          ...targetScene,
          ...data.scene,
          id: targetScene.id,
          order: targetScene.order,
          duration: targetScene.duration,
        });
        showToast(
          `✨ Adegan ${targetScene.order} berhasil di-polish & diselaraskan dengan alur cerita!`
        );
      } else {
        const prevScene = resolvedIndex > 0 ? currentProject.scenes[resolvedIndex - 1] : null;
        const nextScene =
          resolvedIndex < currentProject.scenes.length - 1
            ? currentProject.scenes[resolvedIndex + 1]
            : null;
        const bridgeHint = prevScene
          ? `Melanjutkan momen "${(prevScene.popupText || prevScene.cameraAngle || 'adegan sebelumnya').slice(0, 32)}", `
          : '';
        const leadHint = nextScene
          ? ` menuju transisi mulus ke adegan ${resolvedIndex + 2}.`
          : '.';
        const fallbackPopup = targetScene.popupText
          ? targetScene.popupText.toUpperCase()
          : 'BUKTI NYATA PALING VALID! ✨';

        handleUpdateScene({
          ...targetScene,
          visualAction: `${bridgeHint}${targetScene.visualAction} Gerakan tangan dan mimik dipertegas natural${leadHint}`,
          popupText: fallbackPopup,
          soundEffect: targetScene.soundEffect
            ? `${targetScene.soundEffect} + Fast whip whoosh`
            : 'Fast whip whoosh & Sparkle magic ting',
          imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
        });
        showToast(`✨ Adegan ${targetScene.order} berhasil ditingkatkan!`);
      }
    } catch (e) {
      console.error('Enhance scene error:', e);
      showToast('Gagal memproses AI enhance');
    } finally {
      setEnhancingSceneId(null);
    }
  };

  // Select Hook Variant for Scene 1 (snapshots active edits first and supports bootstrapped empty variants)
  const handleSelectHookVariant = (vIdx: number) => {
    const firstScene = currentProject.scenes[0];
    if (!firstScene) return;

    const existing = currentProject.hookVariants || [];
    const safeCurrentIdx = existing.length > 0 ? Math.max(0, Math.min(activeHookIndex, existing.length - 1)) : 0;
    const baseVariants: HookVariant[] =
      existing.length > 0
        ? existing.map((v, idx) =>
            idx === safeCurrentIdx
              ? {
                  ...v,
                  dialogVO: firstScene.dialogVO,
                  visualAction: firstScene.visualAction,
                  popupText: firstScene.popupText,
                  soundEffect: firstScene.soundEffect,
                  notesMood: firstScene.notesMood,
                  duration: Number(firstScene.duration) || v.duration || 3,
                }
              : v
          )
        : [
            {
              id: generateId(),
              name: 'Hook A (Utama)',
              type: 'Utama',
              dialogVO: firstScene.dialogVO,
              visualAction: firstScene.visualAction,
              popupText: firstScene.popupText,
              soundEffect: firstScene.soundEffect,
              notesMood: firstScene.notesMood,
              duration: Number(firstScene.duration) || 3,
            },
          ];

    const chosen = baseVariants[vIdx];
    if (!chosen) return;

    setActiveHookIndex(vIdx);
    updateCurrentProject((p) => {
      const scenes = [...p.scenes];
      if (scenes[0]) {
        scenes[0] = {
          ...scenes[0],
          dialogVO: chosen.dialogVO,
          visualAction: chosen.visualAction,
          popupText: chosen.popupText,
          soundEffect: chosen.soundEffect,
          notesMood: chosen.notesMood ?? scenes[0].notesMood,
          duration: Number(chosen.duration) || scenes[0].duration,
        };
      }
      return { ...p, scenes, hookVariants: baseVariants };
    });
    showToast(`Mengaktifkan ${chosen.name}!`);
  };

  // Directly add & activate a fresh A/B Hook variant (without losing Hook A)
  const handleAddHookVariant = () => {
    const firstScene = currentProject.scenes[0];
    if (!firstScene) return;

    const existing = currentProject.hookVariants || [];
    if (existing.length >= 5) {
      showToast('Maksimal 5 varian A/B Hook per project.');
      return;
    }

    const safeCurrentIdx = existing.length > 0 ? Math.max(0, Math.min(activeHookIndex, existing.length - 1)) : 0;
    const baseVariants: HookVariant[] =
      existing.length > 0
        ? existing.map((v, idx) =>
            idx === safeCurrentIdx
              ? {
                  ...v,
                  dialogVO: firstScene.dialogVO,
                  visualAction: firstScene.visualAction,
                  popupText: firstScene.popupText,
                  soundEffect: firstScene.soundEffect,
                  notesMood: firstScene.notesMood,
                  duration: Number(firstScene.duration) || v.duration || 3,
                }
              : v
          )
        : [
            {
              id: generateId(),
              name: 'Hook A (Utama)',
              type: 'Utama',
              dialogVO: firstScene.dialogVO,
              visualAction: firstScene.visualAction,
              popupText: firstScene.popupText,
              soundEffect: firstScene.soundEffect,
              notesMood: firstScene.notesMood,
              duration: Number(firstScene.duration) || 3,
            },
          ];

    const usedTypes = new Set(baseVariants.map((v) => (v.type || '').toLowerCase()));
    const nextArch =
      UGC_RD_HOOK_ARCHETYPES.find((a) => !usedTypes.has(a.name.toLowerCase())) ||
      UGC_RD_HOOK_ARCHETYPES[baseVariants.length % UGC_RD_HOOK_ARCHETYPES.length];

    const isHandsOnly =
      (currentProject.persona || '').toLowerCase().includes('faceless') ||
      (currentProject.persona || '').toLowerCase().includes('hanya tangan');
    const built = nextArch.buildSceneOne({
      productName: currentProject.productName || 'Produk',
      usp: currentProject.keySellingPoints || 'kualitas terbaik dan praktis dipakai',
      category: activeCategory.name,
      isHandsOnly,
    });

    const letter = String.fromCharCode(65 + baseVariants.length);
    const shortType = nextArch.name.split('/')[0].split('(')[0].trim().slice(0, 20);
    const newVariant: HookVariant = {
      id: generateId(),
      name: `Hook ${letter} (${shortType})`,
      type: nextArch.name,
      dialogVO: built.dialogVO,
      visualAction: built.visualAction,
      popupText: built.popupText,
      soundEffect: built.soundEffect,
      notesMood: built.notesMood,
      duration: Number(firstScene.duration) || 3,
    };

    const nextVariants = [...baseVariants, newVariant];
    const nextActiveIdx = nextVariants.length - 1;

    setActiveHookIndex(nextActiveIdx);
    updateCurrentProject((p) => {
      const scenes = [...p.scenes];
      if (scenes[0]) {
        scenes[0] = {
          ...scenes[0],
          dialogVO: newVariant.dialogVO,
          visualAction: newVariant.visualAction,
          popupText: newVariant.popupText,
          soundEffect: newVariant.soundEffect,
          notesMood: newVariant.notesMood ?? scenes[0].notesMood,
          duration: newVariant.duration,
        };
      }
      return { ...p, scenes, hookVariants: nextVariants };
    });

    showToast(`✨ ${newVariant.name} ditambahkan & diaktifkan!`);
  };

  // Delete an A/B Hook variant while keeping at least 1
  const handleDeleteHookVariant = (vIdx: number) => {
    const variants = currentProject.hookVariants || [];
    if (variants.length <= 1) {
      showToast('Minimal harus ada 1 varian Hook.');
      return;
    }

    const filtered = variants.filter((_, i) => i !== vIdx);
    const nextActiveIdx =
      vIdx < activeHookIndex
        ? activeHookIndex - 1
        : vIdx === activeHookIndex
        ? Math.max(0, Math.min(vIdx, filtered.length - 1))
        : activeHookIndex;
    const nextChosen = filtered[nextActiveIdx];

    setActiveHookIndex(nextActiveIdx);
    updateCurrentProject((p) => {
      const scenes = [...p.scenes];
      if (scenes[0] && nextChosen) {
        scenes[0] = {
          ...scenes[0],
          dialogVO: nextChosen.dialogVO,
          visualAction: nextChosen.visualAction,
          popupText: nextChosen.popupText,
          soundEffect: nextChosen.soundEffect,
          notesMood: nextChosen.notesMood ?? scenes[0].notesMood,
          duration: Number(nextChosen.duration) || scenes[0].duration,
        };
      }
      return { ...p, scenes, hookVariants: filtered };
    });
    showToast('Varian Hook dihapus.');
  };

  const workspaceRefInput = useRef<HTMLInputElement | null>(null);
  const [isUploadingWorkspaceRefs, setIsUploadingWorkspaceRefs] = useState(false);

  const handleWorkspaceUploadReferences = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploadingWorkspaceRefs(true);
    try {
      const dataUrls = await filesToReferenceImages(files, 8);
      if (dataUrls.length > 0) {
        updateCurrentProject((p) => {
          const existing = p.referenceImages || (p.referenceImage ? [p.referenceImage] : []);
          const combined = [...existing, ...dataUrls].slice(0, 8);
          const total = combined.length;
          const prodName = p.productName || 'Produk';
          const updatedScenes = p.scenes.map((sc, idx) => {
            const refIdx = (idx % total) + 1;
            const refTag =
              total > 1
                ? `[Image ${refIdx} of ${total} Reference: ${prodName}]`
                : `[Image 1 Reference: ${prodName}]`;
            const curPrompt = sc.googleFlowPrompt || '';
            const nextPrompt = /\[Image\s+\d+[^\]]*\]/i.test(curPrompt)
              ? curPrompt.replace(/\[Image\s+\d+[^\]]*\]/i, refTag)
              : `${refTag} ${curPrompt}`.trim();
            const nextNote =
              total > 1
                ? `Pastikan Produk sesuai Gambar referensi #${refIdx} (dari ${total} foto referensi terlampir)`
                : 'Pastikan Produk sesuai Gambar referensi yang sudah di attached';
            return {
              ...sc,
              googleFlowPrompt: nextPrompt,
              imageReferenceNote: nextNote,
            };
          });
          return {
            ...p,
            referenceImages: combined,
            referenceImage: combined[0] || p.referenceImage,
            scenes: updatedScenes,
          };
        });
        showToast(`📸 ${dataUrls.length} Foto referensi berhasil ditambahkan ke Storyboard & Google Flow!`);
      }
    } finally {
      setIsUploadingWorkspaceRefs(false);
      if (workspaceRefInput.current) workspaceRefInput.current.value = '';
    }
  };

  const handleWorkspaceRemoveReference = (removeIdx: number) => {
    updateCurrentProject((p) => {
      const existing = p.referenceImages || (p.referenceImage ? [p.referenceImage] : []);
      const next = existing.filter((_, i) => i !== removeIdx);
      return {
        ...p,
        referenceImages: next,
        referenceImage: next[0] || undefined,
      };
    });
    showToast('Foto referensi dihapus');
  };

  // AI Full Storyboard Generate
  const handleGenerateStoryboard = async (params: AIGenerateParams) => {
    setIsGeneratingAI(true);
    try {
      const resData = await postJsonWithRetry<{ success?: boolean; data?: any }>(
        '/api/generate-storyboard',
        params as unknown as Record<string, any>
      );

      const allParamRefs =
        params.referenceImages && params.referenceImages.length > 0
          ? params.referenceImages
          : params.referenceImage
          ? [params.referenceImage]
          : [];
      const refTotal = Math.max(1, allParamRefs.length);

      const enforcePhysicsCheck = params.physicsConsistencyCheck !== false;

      const resolvedData =
        resData && resData.success && resData.data && Array.isArray(resData.data.scenes) && resData.data.scenes.length > 0
          ? resData.data
          : generateRichFallback(
              params.category,
              params.productName,
              params.targetDuration || 30,
              params.targetAudience || '',
              params.keySellingPoints || '',
              params.targetSceneCount || 0,
              params.cameraAngleStyle || '',
              params.preferredCameraAngles || [],
              params.referenceImage && !params.referenceImage.startsWith('data:')
                ? params.referenceImage
                : `Gambar Referensi Produk ${params.productName}`,
              params.targetPlatform || 'TikTok Shop',
              allParamRefs,
              enforcePhysicsCheck
            );

      const isShopee = (params.targetPlatform || '').toLowerCase().includes('shopee');
      const isTikTok = (params.targetPlatform || '').toLowerCase().includes('tiktok');
      const defaultClosingPopup = isShopee
        ? 'KLIK KERANJANG OREN DI BAWAH! 🛒👇'
        : (isTikTok ? 'CEK KERANJANG KUNING SEKARANG! 🛒👇' : 'KLIK KERANJANG DI BAWAH SEKARANG! 🛒👇');

      const scenesArray = resolvedData.scenes || [];
      const genScenes: Scene[] = scenesArray.map((sc: any, i: number) => {
        const refIdx = (i % refTotal) + 1;
        const refTag =
          refTotal > 1
            ? `[Image ${refIdx} of ${refTotal} Reference: ${params.productName}]`
            : `[Image 1 Reference: ${params.productName}]`;

        const popupText =
          sc.popupText && typeof sc.popupText === 'string' && sc.popupText.trim() && sc.popupText.trim() !== '-'
            ? sc.popupText.trim()
            : (i === 0 ? ` FAKTA ${params.productName.toUpperCase().slice(0, 20)} ✨` : (i === scenesArray.length - 1 ? defaultClosingPopup : `SOLUSI: ${params.productName.toUpperCase()}`));

        let flowPrompt = sc.googleFlowPrompt && typeof sc.googleFlowPrompt === 'string' ? sc.googleFlowPrompt.trim() : '';
        const physicsTokens =
          'strict physical laws, realistic mass inertia, biomechanical constraint adherence, solid hand-to-object contact without clipping, consistent directional lighting with matching cast shadows, authentic camera motion, zero floaty motion, zero morphing, photorealistic 9:16 vertical, 4k 60fps';

        if (!flowPrompt) {
          flowPrompt = enforcePhysicsCheck
            ? `${refTag} Scene ${i + 1} (${sc.cameraAngle || 'Medium Shot'}): ${sc.visualAction || ''} - On-Screen Pop-up Text Overlay: "${popupText}" - ${physicsTokens}.`
            : `${refTag} Scene ${i + 1} (${sc.cameraAngle || 'Medium Shot'}): ${sc.visualAction || ''} - On-Screen Pop-up Text Overlay: "${popupText}" - photorealistic 9:16 vertical, 4k 60fps.`;
        } else {
          if (refTotal > 1 && /\[Image 1 Reference:/i.test(flowPrompt)) {
            flowPrompt = flowPrompt.replace(/\[Image 1 Reference:[^\]]*\]/i, refTag);
          }
          if (!/on-screen pop-up text overlay|text overlay|popup text/i.test(flowPrompt)) {
            flowPrompt = `${flowPrompt} - On-Screen Pop-up Text Overlay: "${popupText}"`;
          }
          if (
            enforcePhysicsCheck &&
            (!/realistic mass inertia/i.test(flowPrompt) || !/biomechanical constraint adherence/i.test(flowPrompt))
          ) {
            flowPrompt = `${flowPrompt}, ${physicsTokens}`;
          }
        }

        const defaultRefNote =
          refTotal > 1
            ? `Pastikan Produk sesuai Gambar referensi #${refIdx} (dari ${refTotal} foto referensi terlampir)`
            : 'Pastikan Produk sesuai Gambar referensi yang sudah di attached';

        return {
          id: generateId(),
          order: i + 1,
          cameraAngle: sc.cameraAngle || 'Medium Shot',
          visualAction: sc.visualAction || '',
          popupText,
          soundEffect: sc.soundEffect || '',
          dialogVO: sc.dialogVO || '',
          notesMood: sc.notesMood || '',
          duration: Number(sc.duration) || 3,
          googleFlowPrompt: flowPrompt,
          imageReferenceNote: sc.imageReferenceNote || defaultRefNote,
        };
      });

      const matchedCat =
        UGC_CATEGORIES.find(
          (c) =>
            c.name.toLowerCase() === params.category.toLowerCase() ||
            c.id.toLowerCase() === params.category.toLowerCase()
        ) || activeCategory;

      const newProj: StoryboardProject = {
        id: generateId(),
        title: resolvedData.title || `Storyboard ${params.category} - ${params.productName}`,
        categoryId: matchedCat.id,
        productName: params.productName,
        brandName: params.brandName,
        productUrl: params.productUrl,
        referenceImage: allParamRefs[0] || params.referenceImage,
        referenceImages: allParamRefs.length > 0 ? allParamRefs : undefined,
        productDescription: params.productDescription,
        keySellingPoints: params.keySellingPoints,
        persona: params.persona,
        personaExplanation: params.personaExplanation,
        tone: params.tone,
        cameraAngleStyle: params.cameraAngleStyle,
        cameraStyleExplanation: params.cameraStyleExplanation,
        preferredCameraAngles: params.preferredCameraAngles,
        targetPlatform: params.targetPlatform,
        targetAudience: params.targetAudience,
        targetDuration: params.targetDuration || genScenes.reduce((s, x) => s + x.duration, 0),
        physicsConsistencyCheck: enforcePhysicsCheck,
        caption: resolvedData.caption || formatShortCaption(params.productName, params.category, params.keySellingPoints, params.targetPlatform),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        hookVariants: buildInitialHookVariants(
          genScenes,
          params.productName,
          params.keySellingPoints || '',
          params.category,
          params.persona || ''
        ),
        scenes: genScenes,
      };

      const nextList = [newProj, ...projectsRef.current];
      setProjects(nextList);
      setCurrentProjectId(newProj.id);
      setActiveHookIndex(0);
      setIsAIGeneratorOpen(false);
      performLocalSave(
        false,
        nextList,
        newProj.id,
        'create',
        `Storyboard AI "${newProj.title}" dibuat & dideploy ke storage.`
      );
      showToast('🎉 Storyboard AI berhasil dibuat & disimpan di Local Storage!');
    } catch (e) {
      console.error('Generate storyboard error:', e);
      showToast('Gagal terhubung ke generator AI.');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Generate Storyboard directly from extracted link data
  const handleGenerateFromExtracted = async (data: AutoDetectResult) => {
    const matchedCat =
      UGC_CATEGORIES.find(
        (c) =>
          c.name.toLowerCase() === data.category.toLowerCase() ||
          c.id.toLowerCase() === data.category.toLowerCase()
      ) || activeCategory;

    const params: AIGenerateParams = {
      category: matchedCat.name,
      productName: data.productName,
      brandName: data.brandName,
      productUrl: data.productUrl,
      referenceImage: data.referenceImage || data.imageUrl,
      referenceImages: data.referenceImages || (data.referenceImage || data.imageUrl ? [data.referenceImage || data.imageUrl!] : undefined),
      productDescription: data.productDescription,
      targetAudience: data.targetAudience,
      keySellingPoints: data.keySellingPoints,
      persona: data.persona || 'Semua (Netral Universal)',
      personaExplanation: data.personaExplanation,
      tone: data.tone || 'Santai, Relatable & Meyakinkan',
      cameraAngleStyle: data.cameraAngleStyle,
      cameraStyleExplanation: data.cameraStyleExplanation,
      preferredCameraAngles: data.preferredCameraAngles,
      targetDuration: data.targetDuration || 30,
      targetPlatform: data.targetPlatform || 'TikTok Shop',
      language: 'id',
    };

    await handleGenerateStoryboard(params);
  };

  // Apply extracted link data to current active project
  const handleApplyExtractedToCurrentProject = (data: AutoDetectResult) => {
    updateCurrentProject((p) => {
      const mergedRefs =
        data.referenceImages && data.referenceImages.length > 0
          ? data.referenceImages
          : data.referenceImage || data.imageUrl
          ? [data.referenceImage || data.imageUrl!]
          : p.referenceImages;
      return {
        ...p,
        productName: data.productName,
        brandName: data.brandName || p.brandName,
        productUrl: data.productUrl || p.productUrl,
        referenceImage: mergedRefs?.[0] || data.referenceImage || data.imageUrl || p.referenceImage,
        referenceImages: mergedRefs,
        productDescription: data.productDescription || p.productDescription,
        keySellingPoints: data.keySellingPoints || p.keySellingPoints,
        persona: data.persona || p.persona,
        personaExplanation: data.personaExplanation || p.personaExplanation,
        tone: data.tone || p.tone,
        cameraAngleStyle: data.cameraAngleStyle || p.cameraAngleStyle,
        cameraStyleExplanation: data.cameraStyleExplanation || p.cameraStyleExplanation,
        preferredCameraAngles: data.preferredCameraAngles || p.preferredCameraAngles,
        targetPlatform: data.targetPlatform || p.targetPlatform,
        targetAudience: data.targetAudience || p.targetAudience,
        targetDuration: data.targetDuration || p.targetDuration,
      };
    });
    showToast(`✓ Data produk "${data.productName}" berhasil dipasang ke naskah aktif! ✨`);
  };

  const handleOpenGeneratorWithPrefilledInput = (input: string) => {
    setAiGeneratorInitialInput(input);
    setIsAIGeneratorOpen(true);
  };

  // Apply viral hook to Scene 1 (supports replacing active variant or adding new A/B variant while keeping Hook A)
  const handleApplyHook = (hook: AIHookOption, mode: 'replace' | 'add_variant' = 'replace') => {
    if (currentProject.scenes.length === 0) return;

    let resultingActiveIdx = activeHookIndex;

    updateCurrentProject((p) => {
      const firstScene = p.scenes[0];
      const newScenes = [...p.scenes];
      const updatedDuration = Math.max(2, Math.min(4, Number(firstScene.duration) || 3));
      newScenes[0] = {
        ...firstScene,
        dialogVO: hook.hookDialog,
        visualAction: hook.visualAction,
        popupText: hook.popupText,
        soundEffect: hook.sfx,
        duration: updatedDuration,
      };

      const existing =
        p.hookVariants && p.hookVariants.length > 0
          ? [...p.hookVariants]
          : [
              {
                id: generateId(),
                name: 'Hook A (Utama)',
                type: 'Utama',
                dialogVO: firstScene.dialogVO,
                visualAction: firstScene.visualAction,
                popupText: firstScene.popupText,
                soundEffect: firstScene.soundEffect,
                notesMood: firstScene.notesMood,
                duration: Number(firstScene.duration) || 3,
              },
            ];

      const shortType = (hook.type || 'Viral').split('/')[0].split('(')[0].trim().slice(0, 20);

      if (mode === 'add_variant' && existing.length < 5) {
        const letter = String.fromCharCode(65 + existing.length);
        const addedVariant: HookVariant = {
          id: generateId(),
          name: `Hook ${letter} (${shortType})`,
          type: hook.type,
          dialogVO: hook.hookDialog,
          visualAction: hook.visualAction,
          popupText: hook.popupText,
          soundEffect: hook.sfx,
          notesMood: firstScene.notesMood,
          duration: updatedDuration,
        };
        const nextVariants = [...existing, addedVariant];
        resultingActiveIdx = nextVariants.length - 1;
        return {
          ...p,
          scenes: newScenes,
          hookVariants: nextVariants,
        };
      }

      const safeIdx = Math.max(0, Math.min(activeHookIndex, existing.length - 1));
      const letter = String.fromCharCode(65 + safeIdx);
      existing[safeIdx] = {
        ...existing[safeIdx],
        name: `Hook ${letter} (${shortType})`,
        type: hook.type,
        dialogVO: hook.hookDialog,
        visualAction: hook.visualAction,
        popupText: hook.popupText,
        soundEffect: hook.sfx,
        duration: updatedDuration,
      };
      resultingActiveIdx = safeIdx;

      return {
        ...p,
        scenes: newScenes,
        hookVariants: existing,
      };
    });

    setActiveHookIndex(resultingActiveIdx);
    showToast(
      mode === 'add_variant'
        ? `Varian baru "${hook.type}" ditambahkan ke A/B Hook Testing!`
        : `Hook "${hook.type}" dipasang pada varian aktif!`
    );
  };

  // Import JSON
  const handleImportJSON = (importedScenes: Scene[], importedTitle?: string) => {
    updateCurrentProject((p) => ({
      ...p,
      title: importedTitle || p.title,
      scenes: importedScenes.map((sc, i) => ({
        ...sc,
        id: sc.id || generateId(),
        order: i + 1,
        duration: Number(sc.duration) || 3,
      })),
    }));
    showToast('Storyboard JSON berhasil di-import!');
  };

  // Copy caption & hashtags to clipboard
  const handleCopyCaption = async () => {
    const textToCopy = currentProject.caption || '';
    if (!textToCopy) return;
    const ok = await copyToClipboard(textToCopy);
    if (ok) {
      setCopiedCaption(true);
      showToast('📋 Auto Caption & Hashtags berhasil disalin!');
      setTimeout(() => setCopiedCaption(false), 2000);
    }
  };

  // Generate fresh caption under 150 chars
  const handleGenerateNewCaption = async () => {
    setIsGeneratingCaption(true);
    try {
      const data = await postJsonWithRetry<{ success?: boolean; caption?: string }>(
        '/api/generate-caption',
        {
          productName: currentProject.productName || 'Produk Unggulan',
          category: activeCategory.name,
          keySellingPoints: currentProject.keySellingPoints || '',
          targetAudience: currentProject.targetAudience || '',
          targetPlatform: currentProject.targetPlatform || 'TikTok Shop',
        }
      );
      const nextCaption =
        data && data.success && data.caption
          ? data.caption
          : formatShortCaption(
              currentProject.productName || 'Produk Unggulan',
              activeCategory.name,
              currentProject.keySellingPoints || '',
              currentProject.targetPlatform || 'TikTok Shop'
            );
      updateCurrentProject((p) => ({ ...p, caption: nextCaption }));
      showToast('✨ Caption viral baru berhasil dibuat!');
    } catch (e) {
      console.error('Caption generate error:', e);
      showToast('Gagal membuat caption');
    } finally {
      setIsGeneratingCaption(false);
    }
  };

  // Project management
  const handleCreateNewProject = () => {
    const starterScenes: Scene[] = [
      {
        id: generateId(),
        order: 1,
        cameraAngle: 'POV / Close-up',
        visualAction: 'Tangan dengan 5 jari alami mengangkat kemasan produk asli secara mantap di atas meja, melawan gravitasi dengan inersia nyata di bawah pencahayaan directional hangat.',
        popupText: 'PERNAH NGALAMIN INI JUGA? 🤔',
        soundEffect: 'Vine boom & Soft pop',
        dialogVO: 'Ternyata masih banyak yang belum tahu cara paling praktis buat hasil maksimal!',
        notesMood: 'Gaya teks: Bold Modern Tag. Pencahayaan natural realistis.',
        duration: 3,
        googleFlowPrompt: '[Image 1 Reference: Produk Baru] POV close-up creator holding product with anatomically realistic hand grip, authentic mass inertia, strict physical laws, matching cast shadows, consistent directional lighting, zero morphing - On-Screen Pop-up Text Overlay: "PERNAH NGALAMIN INI JUGA? 🤔" - 9:16 vertical UGC video, 4k 60fps.',
        imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
      },
      {
        id: generateId(),
        order: 2,
        cameraAngle: 'Medium Close-up',
        visualAction: 'Kreator memperagakan penggunaan produk dengan gerakan tangan biomekanik alami tanpa clipping di bawah pencahayaan directional yang serasi dengan bayangan jatuh nyata.',
        popupText: 'HASIL NYATA BANGET ✨',
        soundEffect: 'Swoosh & Chime',
        dialogVO: 'Ini dia produk yang bikin perubahan instan dan beneran terbukti efisien!',
        notesMood: 'Gaya teks: Clean Modern. Bayangan konsisten.',
        duration: 3,
        googleFlowPrompt: '[Image 1 Reference: Produk Baru] Medium close-up creator demonstrating product to camera with genuine excitement, realistic physical interaction without clipping, matching cast shadows, zero glitch - On-Screen Pop-up Text Overlay: "HASIL NYATA BANGET ✨" - branding matching reference image, 9:16 vertical 4k 60fps.',
        imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
      },
    ];

    const newProj: StoryboardProject = {
      id: generateId(),
      title: 'Naskah Storyboard Baru',
      categoryId: 'before_after',
      productName: 'Produk Baru',
      persona: 'Wanita',
      tone: 'Santai, Mengalir & Natural (Teman Curhat)',
      targetPlatform: 'TikTok Shop',
      targetDuration: 30,
      keySellingPoints: 'Kualitas terbaik, hasil nyata, terjangkau.',
      caption: 'Wajib coba produk ini! Bikin takjub & super praktis. Klik keranjang di bawah ya! ✨ #fyp #viral',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      hookVariants: buildInitialHookVariants(
        starterScenes,
        'Produk Baru',
        'Kualitas terbaik, hasil nyata, terjangkau.',
        'Before & After',
        'Wanita'
      ),
      scenes: starterScenes,
    };

    const nextList = [newProj, ...projectsRef.current];
    setProjects(nextList);
    setCurrentProjectId(newProj.id);
    setActiveHookIndex(0);
    setIsProjectsModalOpen(false);
    performLocalSave(
      false,
      nextList,
      newProj.id,
      'create',
      `Naskah baru "${newProj.title}" (${newProj.id}) dibuat & disimpan.`
    );
    showToast('Naskah baru dibuat & tersimpan!');
  };

  const handleDuplicateProject = (proj: StoryboardProject) => {
    const duplicated: StoryboardProject = {
      ...proj,
      id: generateId(),
      title: `${proj.title} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const nextList = [duplicated, ...projectsRef.current];
    setProjects(nextList);
    setCurrentProjectId(duplicated.id);
    performLocalSave(
      false,
      nextList,
      duplicated.id,
      'duplicate',
      `Naskah "${proj.title}" diduplikasi menjadi "${duplicated.title}".`,
      [`ID Baru: ${duplicated.id}`]
    );
    showToast(`Project "${proj.title}" berhasil diduplikasi!`);
  };

  const handleDeleteProject = (projId: string) => {
    if (projects.length <= 1) {
      showToast('Minimal harus ada 1 project naskah.');
      return;
    }
    const targetProj = projects.find((p) => p.id === projId);

    setConfirmDialog({
      isOpen: true,
      title: `Hapus Naskah "${targetProj?.title || projId}"?`,
      description:
        'Naskah ini akan dihapus permanen dari daftar "Naskah Saya" di Local Storage browser Anda.',
      details: [
        `Judul Naskah: ${targetProj?.title || '-'}`,
        'Penyimpanan: Local Storage Browser',
      ],
      confirmLabel: 'Ya, Hapus Naskah',
      tone: 'danger',
      onConfirm: () => {
        const filtered = projectsRef.current.filter((p) => p.id !== projId);
        const nextActiveId =
          currentProjectId === projId && filtered[0] ? filtered[0].id : currentProjectId;
        setProjects(filtered);
        if (nextActiveId !== currentProjectId) {
          setCurrentProjectId(nextActiveId);
        }
        performLocalSave(
          false,
          filtered,
          nextActiveId,
          'delete',
          `Naskah "${targetProj?.title || projId}" dihapus dari storage.`,
          [`ID Dihapus: ${projId}`]
        );
        setConfirmDialog(null);
        showToast('Project naskah berhasil dihapus');
      },
    });
  };

  const handleClearAllProjects = () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Bersihkan Semua Naskah Storyboard?',
      description:
        'Semua project yang menumpuk di Local Storage akan dihapus dan direset menjadi 1 naskah default yang bersih agar tidak membebani browser.',
      details: [
        `Total Naskah Saat Ini: ${projects.length} Project`,
        'Hasil Akhir: 1 Naskah Default Baru di Local Storage',
      ],
      confirmLabel: 'Ya, Bersihkan Semua',
      tone: 'danger',
      onConfirm: () => {
        const prevCount = projectsRef.current.length;
        const freshDefault: StoryboardProject = {
          ...INITIAL_BEFORE_AFTER_PROJECT,
          id: generateId(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const nextList = [freshDefault];
        setProjects(nextList);
        setCurrentProjectId(freshDefault.id);
        performLocalSave(
          false,
          nextList,
          freshDefault.id,
          'clear_all',
          `Reset semua naskah (${prevCount} project dibersihkan, disisakan 1 default baru).`
        );
        setConfirmDialog(null);
        setIsProjectsModalOpen(false);
        showToast('🧹 Semua naskah dibersihkan! Tersisa 1 naskah default di Local Storage.');
      },
    });
  };

  const handleClearOtherProjects = () => {
    if (projects.length <= 1) {
      showToast('Hanya ada 1 naskah aktif saat ini.');
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: 'Hapus Naskah Lain & Sisakan Naskah Aktif?',
      description:
        'Seluruh naskah lain yang menumpuk akan dihapus dari Local Storage, dan hanya naskah yang sedang dibuka saat ini yang dipertahankan.',
      details: [
        `Naskah Dipertahankan: ${currentProject.title}`,
        `Akan Dihapus: ${projects.length - 1} Naskah Lainnya`,
      ],
      confirmLabel: 'Ya, Sisakan Aktif',
      tone: 'warning',
      onConfirm: () => {
        const removedCount = Math.max(0, projectsRef.current.length - 1);
        const nextList = [currentProject];
        setProjects(nextList);
        setCurrentProjectId(currentProject.id);
        performLocalSave(
          false,
          nextList,
          currentProject.id,
          'clear_others',
          `Membersihkan ${removedCount} naskah lain & mempertahankan "${currentProject.title}".`
        );
        setConfirmDialog(null);
        showToast('🧹 Naskah lain dibersihkan! Hanya naskah aktif yang disimpan.');
      },
    });
  };

  const handleReplaceCleanedProjects = async (
    cleanedProjects: StoryboardProject[],
    nextActiveId: string,
    removedCount: number,
    details: string[]
  ) => {
    setProjects(cleanedProjects);
    setCurrentProjectId(nextActiveId);
    saveProjectsToLocalStorage(cleanedProjects, nextActiveId);
    const idbRes = await saveProjectsToIndexedDBWithStatus(cleanedProjects, nextActiveId);
    const auditAfter = await auditProjectStorage(cleanedProjects, nextActiveId);

    appendDeployLog({
      action: 'deduplicate',
      status: idbRes.success && auditAfter.totalGhostCount === 0 ? 'success' : 'warning',
      localCount: auditAfter.localStorage.projectCount,
      idbCount: auditAfter.indexedDB.available ? auditAfter.indexedDB.projectCount : null,
      memoryCount: cleanedProjects.length,
      ghostCount: auditAfter.totalGhostCount,
      duplicateCount: auditAfter.totalDuplicateCount,
      message: `Deduplikasi selesai: ${removedCount} project ganda dihapus, tersisa ${cleanedProjects.length} naskah unik.`,
      details: idbRes.success ? details : [...details, `IndexedDB warning: ${idbRes.error}`],
    });
    setDeployLogsVersion((v) => v + 1);
    showToast(`🧹 ${removedCount} project ganda berhasil dibersihkan!`);
  };

  // If not authenticated or not mounted yet, show PasswordGate
  if (!mounted || !isAuthenticated) {
    return <PasswordGate onSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="min-h-screen bg-[#070a12] text-slate-100 flex flex-col font-sans">
      
      {/* Top Application Header */}
      <Header
        title={currentProject.title}
        categoryBadge={activeCategory.badgeText}
        scenes={currentProject.scenes}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onTitleChange={handleTitleChange}
        onOpenAIGenerator={() => setIsAIGeneratorOpen(true)}
        onOpenHooksModal={() => setIsHooksModalOpen(true)}
        onOpenTeleprompter={() => setIsTeleprompterOpen(true)}
        onOpenExportModal={() => handleOpenExportWithTab('table')}
        onOpenProjectsModal={() => setIsProjectsModalOpen(true)}
        onAddScene={handleAddScene}
        onCopyJSON={handleCopyJSON}
        isJsonCopied={isJsonCopied}
        onLogout={handleLogout}
        saveStatus={saveStatus}
        lastSavedTime={lastSavedTime}
        onManualSave={handleManualSave}
        autoSaveCountdown={autoSaveCountdown}
      />

      {/* Main Workspace Layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* Left Sidebar: Formats & Saved Projects (hidden when MetaCleaner Pro active so it displays immediately at top) */}
        {viewMode !== 'meta_cleaner' && (
          <Sidebar
            selectedCategoryId={currentProject.categoryId}
            onSelectCategory={handleSelectCategory}
            onTriggerAICategory={handleTriggerAICategory}
            projects={projects}
            currentProjectId={currentProject.id}
            onSelectProject={(id) => {
              setCurrentProjectId(id);
              setActiveHookIndex(0);
              performLocalSave(false, projectsRef.current, id);
            }}
            onCreateNewProject={handleCreateNewProject}
            onClearProjects={handleClearAllProjects}
          />
        )}

        {/* Main Content Area */}
        <main
          ref={mainScrollRef}
          className="flex-1 bg-[#070a12] overflow-y-auto p-4 md:p-6 lg:p-7 custom-scrollbar"
        >
          <div className={`${viewMode === 'meta_cleaner' ? 'max-w-7xl' : 'max-w-6xl'} mx-auto space-y-5`}>

            {/* Context Bar: Current Format, Summary & Quick Triggers (hidden on MetaCleaner tab) */}
            {viewMode !== 'meta_cleaner' && (
            <div className="bg-[#0e1422] border border-[#1d273e] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-950/80 border border-purple-800/60 flex items-center justify-center text-purple-300">
                  <Film className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-bold text-white tracking-tight">
                      {activeCategory.name}
                    </h2>
                    <span className="text-[10px] bg-purple-900/60 text-purple-200 border border-purple-700/40 px-2 py-0.5 rounded-full font-bold">
                      Target: {activeCategory.recommendedDuration}s
                    </span>
                    {currentProject.persona && (
                      <span className="text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-700/50 px-2 py-0.5 rounded-full font-bold">
                        Persona: {currentProject.persona}
                      </span>
                    )}
                    {currentProject.cameraAngleStyle && (
                      <span className="text-[10px] bg-sky-950 text-sky-300 border border-sky-700/50 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <Camera className="w-2.5 h-2.5" />
                        <span>{currentProject.cameraAngleStyle}</span>
                      </span>
                    )}
                    {currentProject.productName && (
                      <span className="text-[10px] bg-emerald-950/80 text-emerald-300 border border-emerald-700/50 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <span>📦 {currentProject.productName}</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {activeCategory.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center flex-wrap gap-2">
                <button
                  onClick={handleCopyJSON}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl transition-all active:scale-95 shadow-sm border ${
                    isJsonCopied
                      ? 'bg-emerald-950/80 border-emerald-500/80 text-emerald-300'
                      : 'bg-[#141b2c] hover:bg-purple-950/40 text-purple-300 hover:text-white border-purple-500/40'
                  }`}
                  title="Salin data JSON lengkap ke Clipboard"
                >
                  {isJsonCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="font-bold text-emerald-300">JSON Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Code className="w-3.5 h-3.5 text-purple-400" />
                      <span className="font-bold">Copy JSON</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => handleResetToCategoryTemplate(activeCategory)}
                  className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-[#141b2c] hover:bg-[#1b253b] text-slate-300 border border-[#212d44] transition-all"
                  title="Muat ulang adegan default untuk kategori ini"
                >
                  <RotateCcw className="w-3 h-3 text-slate-400" />
                  <span>Reset Default</span>
                </button>

                <button
                  onClick={() => setIsHooksModalOpen(true)}
                  className="flex items-center gap-1.5 bg-[#141b2c] hover:bg-[#1b253b] text-amber-300 text-xs font-semibold px-3 py-1.5 rounded-xl border border-amber-500/30 transition-all shadow-sm active:scale-95"
                >
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  <span>8 Hook Viral</span>
                </button>

                {/* Primary Button: Ekstrak Link Produk */}
                <button
                  onClick={() => setIsAIGeneratorOpen(true)}
                  className="flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-md transition-all active:scale-95 border border-purple-400/30"
                  title="Ekstrak produk dari link, upload foto referensi & buat storyboard otomatis"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300/30" />
                  <span>Ekstrak Link Produk</span>
                </button>
              </div>
            </div>
            )}

            {/* HERO DIRECT LINK EXTRACTOR BAR (TikTok, Tokopedia, Shopee + Multi-Image Reference Upload) */}
            {viewMode !== 'meta_cleaner' && (
              <DirectLinkExtractorBar
                onApplyToProject={handleApplyExtractedToCurrentProject}
                onGenerateWithData={handleGenerateFromExtracted}
                onOpenGeneratorModalWithInput={handleOpenGeneratorWithPrefilledInput}
                isGenerating={isGeneratingAI}
              />
            )}

            {/* Overview Ringkas Produk Terpilih + Multi-Image Reference Bar */}
            {viewMode !== 'meta_cleaner' && currentProject.productName && (
              <div className="bg-gradient-to-r from-purple-950/30 via-[#0d1624] to-[#090f1a] border border-purple-500/30 rounded-2xl p-3.5 text-xs text-slate-300 space-y-3 shadow-md">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-purple-900/60 border border-purple-500/60 flex items-center justify-center text-purple-300 shrink-0">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white text-xs">
                          Produk:
                        </span>
                        <span className="font-bold text-purple-200 bg-purple-950/80 px-2 py-0.5 rounded border border-purple-700/60 font-mono">
                          {currentProject.productName}
                        </span>
                        {currentProject.brandName && (
                          <span className="text-[11px] text-slate-400">
                            ({currentProject.brandName})
                          </span>
                        )}
                      </div>
                      {currentProject.keySellingPoints && (
                        <p className="text-[11px] text-slate-400 line-clamp-1">
                          <span className="font-semibold text-slate-300">USP:</span> {currentProject.keySellingPoints}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap shrink-0 self-end md:self-auto">
                    <input
                      ref={workspaceRefInput}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleWorkspaceUploadReferences(e.target.files)}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => workspaceRefInput.current?.click()}
                      disabled={isUploadingWorkspaceRefs}
                      className="text-[11px] font-bold text-cyan-200 hover:text-white px-2.5 py-1 rounded-lg bg-cyan-950/80 border border-cyan-600/50 hover:bg-cyan-900 transition-colors flex items-center gap-1.5 cursor-pointer"
                      title="Upload banyak foto produk sebagai referensi pembuatan Storyboard & Google Flow"
                    >
                      {isUploadingWorkspaceRefs ? (
                        <Loader2 className="w-3 h-3 animate-spin text-cyan-300" />
                      ) : (
                        <Upload className="w-3 h-3 text-cyan-400" />
                      )}
                      <span>Upload Referensi Image (Multi-Foto)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsAIGeneratorOpen(true)}
                      className="text-[11px] font-semibold text-purple-300 hover:text-white px-2.5 py-1 rounded-lg bg-purple-950/80 border border-purple-700/60 hover:bg-purple-900 transition-colors"
                    >
                      Generate Ulang AI
                    </button>
                  </div>
                </div>

                {/* Active Multi-Image References Gallery in Workspace */}
                {((currentProject.referenceImages && currentProject.referenceImages.length > 0) ||
                  currentProject.referenceImage) && (
                  <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-purple-900/30">
                    <span className="text-[10px] font-bold text-cyan-300 flex items-center gap-1">
                      <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Referensi Image Google Flow & Storyboard:</span>
                    </span>
                    {(currentProject.referenceImages && currentProject.referenceImages.length > 0
                      ? currentProject.referenceImages
                      : currentProject.referenceImage
                      ? [currentProject.referenceImage]
                      : []
                    ).map((src, idx) => (
                      <div
                        key={idx}
                        className="relative group flex items-center gap-1.5 bg-[#091220] border border-cyan-800/60 rounded-lg px-2 py-1"
                      >
                        <img
                          src={src}
                          alt={`Ref ${idx + 1}`}
                          className="w-6 h-6 rounded object-cover border border-cyan-600/50"
                        />
                        <span className="text-[10px] font-mono font-bold text-cyan-200">
                          [Image {idx + 1}]
                        </span>
                        <button
                          type="button"
                          onClick={() => handleWorkspaceRemoveReference(idx)}
                          className="text-slate-400 hover:text-red-400 transition-colors ml-0.5"
                          title="Hapus foto referensi ini"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* VIEW MODE 1: Interactive Scene Cards Editor */}
            {viewMode === 'cards' && (
              <>
                {/* Collapsible Auto Caption & Hashtags Bar */}
                <div className="bg-[#0e1320] border border-[#1c273e] rounded-2xl overflow-hidden shadow-md">
                  <div
                    onClick={() => setIsCaptionOpen(!isCaptionOpen)}
                    className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-[#121929] transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-bold text-white uppercase tracking-wider">
                        Auto Caption & Hashtags TikTok (Maksimal 150 Karakter)
                      </span>
                      <span
                        className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full border ${
                          (currentProject.caption || '').length <= 150
                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/50'
                            : 'bg-red-950/80 text-red-300 border-red-700/50'
                        }`}
                      >
                        {(currentProject.caption || '').length} / 150
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyCaption();
                        }}
                        className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-purple-950/80 hover:bg-purple-900 text-purple-200 border border-purple-700/50 transition-colors"
                      >
                        {copiedCaption ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span>Tersalin!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Salin Caption</span>
                          </>
                        )}
                      </button>

                      {isCaptionOpen ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {isCaptionOpen && (
                    <div className="p-3.5 pt-0 space-y-2 border-t border-[#1a2336] bg-[#0b0f1a]">
                      <textarea
                        rows={2}
                        value={currentProject.caption || ''}
                        onChange={(e) => updateCurrentProject((p) => ({ ...p, caption: e.target.value }))}
                        placeholder="Ketik caption video dan hashtags di sini..."
                        className="w-full bg-[#080c15] border border-[#1d273e] focus:border-purple-500 rounded-xl p-2.5 text-xs text-slate-100 placeholder-slate-500 outline-none leading-relaxed transition-all resize-y"
                      />
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <button
                          type="button"
                          onClick={handleGenerateNewCaption}
                          disabled={isGeneratingCaption}
                          className="text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1 transition-colors disabled:opacity-50"
                        >
                          <Sparkles className={`w-3 h-3 ${isGeneratingCaption ? 'animate-spin' : ''}`} />
                          <span>{isGeneratingCaption ? 'Membuat Caption...' : 'AI Buat Caption Baru'}</span>
                        </button>
                        <span className={(currentProject.caption || '').length > 150 ? 'text-red-400 font-bold' : 'text-emerald-400'}>
                          {(currentProject.caption || '').length <= 150 ? '✅ Sesuai batas posting' : '⚠️ Melebihi 150 karakter'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Scene Reorder Hint Bar */}
                {currentProject.scenes.length > 1 && (
                  <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                    <span className="flex items-center gap-1.5">
                      <GripVertical className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span>Seret ikon pegangan di pojok kiri atas kartu untuk mengatur ulang urutan adegan</span>
                    </span>
                    <span className="font-mono tabular-nums text-slate-500 hidden sm:inline">
                      {currentProject.scenes.length} adegan
                    </span>
                  </div>
                )}

                {/* List of Sortable Scene Cards (dnd-kit) */}
                <DndContext
                  id="scene-cards-dnd-context"
                  sensors={sceneSensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleSceneDragStart}
                  onDragEnd={handleSceneDragEnd}
                  onDragCancel={handleSceneDragCancel}
                >
                  <SortableContext
                    items={currentProject.scenes.map((s) => s.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-4">
                      {currentProject.scenes.map((scene, index) => (
                        <SortableSceneCard
                          key={scene.id}
                          scene={scene}
                          index={index}
                          totalScenes={currentProject.scenes.length}
                          productName={currentProject.productName}
                          referenceImages={
                            currentProject.referenceImages && currentProject.referenceImages.length > 0
                              ? currentProject.referenceImages
                              : currentProject.referenceImage
                              ? [currentProject.referenceImage]
                              : []
                          }
                          onUpdate={handleUpdateScene}
                          onDelete={() => handleDeleteScene(scene.id)}
                          onDuplicate={() => handleDuplicateScene(scene)}
                          onMoveUp={() => handleMoveScene(index, 'up')}
                          onMoveDown={() => handleMoveScene(index, 'down')}
                          onEnhanceAI={handleEnhanceScene}
                          isEnhancing={enhancingSceneId === scene.id}
                          onOpenHooksModal={() => setIsHooksModalOpen(true)}
                          hookVariants={index === 0 ? currentProject.hookVariants : undefined}
                          activeHookIndex={activeHookIndex}
                          onSelectHookVariant={handleSelectHookVariant}
                          onAddHookVariant={handleAddHookVariant}
                          onDeleteHookVariant={index === 0 ? handleDeleteHookVariant : undefined}
                        />
                      ))}
                    </div>
                  </SortableContext>

                  <DragOverlay adjustScale={false}>
                    {activeDragSceneId ? (() => {
                      const dragIdx = currentProject.scenes.findIndex((s) => s.id === activeDragSceneId);
                      const dragScene = dragIdx >= 0 ? currentProject.scenes[dragIdx] : null;
                      if (!dragScene) return null;
                      return (
                        <div className="bg-[#131a2d] border-2 border-purple-500 rounded-2xl p-4 shadow-2xl shadow-purple-950/70 cursor-grabbing space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <GripVertical className="w-4 h-4 text-purple-300 shrink-0" />
                              <span className="bg-gradient-to-r from-purple-700 to-indigo-700 text-white text-xs font-black px-2.5 py-0.5 rounded-lg uppercase tracking-wider tabular-nums shrink-0">
                                ADEGAN {dragIdx + 1}
                              </span>
                              {dragScene.cameraAngle && (
                                <span className="text-xs font-semibold text-purple-200 truncate">
                                  {dragScene.cameraAngle}
                                </span>
                              )}
                            </div>
                            <span className="flex items-center gap-1 font-mono font-bold text-xs text-emerald-400 tabular-nums shrink-0">
                              <Clock className="w-3 h-3" />
                              <span>{dragScene.duration}s</span>
                            </span>
                          </div>
                          {dragScene.popupText && (
                            <div className="text-xs font-bold text-sky-300 truncate">
                              {dragScene.popupText}
                            </div>
                          )}
                          <p className="text-xs text-slate-300 line-clamp-2">
                            {dragScene.visualAction || dragScene.dialogVO || 'Memindahkan posisi adegan...'}
                          </p>
                        </div>
                      );
                    })() : null}
                  </DragOverlay>
                </DndContext>

                {/* Bottom Add Scene Action Bar */}
                <div className="flex items-center justify-center pt-2">
                  <button
                    onClick={handleAddScene}
                    className="flex items-center gap-2 bg-[#121929] hover:bg-[#1a233a] text-purple-300 hover:text-white border border-[#222f4c] hover:border-purple-500/50 py-3 px-6 rounded-2xl text-xs font-bold shadow-md transition-all active:scale-98"
                  >
                    <Plus className="w-4 h-4 text-purple-400" />
                    <span>Tambah Adegan Baru ({currentProject.scenes.length + 1})</span>
                  </button>
                </div>
              </>
            )}

            {/* VIEW MODE 2: Comprehensive Table Script Breakdown */}
            {viewMode === 'table' && (
              <ScriptTableView
                scenes={currentProject.scenes}
                title={currentProject.title}
                categoryName={activeCategory.name}
                caption={currentProject.caption}
                onReorderScenes={handleReorderScenes}
              />
            )}

            {/* VIEW MODE 3: Motion Control & Choreography Studio */}
            {viewMode === 'motion_control' && (
              <MotionControlPanel
                scenes={currentProject.scenes}
                projectTitle={currentProject.title}
                productName={currentProject.productName}
                persona={currentProject.persona}
                referenceImages={
                  currentProject.referenceImages && currentProject.referenceImages.length > 0
                    ? currentProject.referenceImages
                    : currentProject.referenceImage
                    ? [currentProject.referenceImage]
                    : []
                }
                onUpdateScene={handleUpdateScene}
                onBatchUpdateScenes={(updater) => {
                  updateCurrentProject((p) => ({
                    ...p,
                    scenes: updater(p.scenes),
                  }));
                }}
                onNotify={showToast}
              />
            )}

            {/* VIEW MODE 4: Kalkulator Rate Card & Penawaran Jasa */}
            {viewMode === 'rate_card' && (
              <RateCardCalculator
                projectTitle={currentProject.title}
                productName={currentProject.productName}
                categoryName={activeCategory.name}
              />
            )}

            {/* VIEW MODE 5: MetaCleaner Pro - FFmpeg.wasm Remux & SEI Stripper */}
            {viewMode === 'meta_cleaner' && <MetaCleanerPro />}

          </div>
        </main>
      </div>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#101726] border border-purple-500/80 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 animate-bounce shadow-purple-950/80">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* MODALS */}
      {isAIGeneratorOpen && (
        <AIGeneratorModal
          isOpen={isAIGeneratorOpen}
          onClose={() => setIsAIGeneratorOpen(false)}
          currentCategoryName={activeCategory.name}
          onGenerate={handleGenerateStoryboard}
          isGenerating={isGeneratingAI}
          initialSmartInput={aiGeneratorInitialInput}
        />
      )}

      {isHooksModalOpen && (
        <HookGeneratorModal
          isOpen={isHooksModalOpen}
          onClose={() => setIsHooksModalOpen(false)}
          productName={currentProject.productName || 'Produk'}
          category={activeCategory.name}
          productDescription={currentProject.productDescription || ''}
          keySellingPoints={currentProject.keySellingPoints || ''}
          persona={currentProject.persona || ''}
          targetPlatform={currentProject.targetPlatform || 'TikTok Shop'}
          onSelectHook={handleApplyHook}
        />
      )}

      {isTeleprompterOpen && (
        <TeleprompterModal
          isOpen={isTeleprompterOpen}
          onClose={() => setIsTeleprompterOpen(false)}
          title={currentProject.title}
          scenes={currentProject.scenes}
        />
      )}

      {isExportModalOpen && (
        <ExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          title={currentProject.title}
          categoryName={activeCategory.name}
          referenceImage={currentProject.referenceImage}
          caption={currentProject.caption}
          scenes={currentProject.scenes}
          hookVariants={currentProject.hookVariants}
          initialTab={exportModalInitialTab}
          onImportJSON={handleImportJSON}
        />
      )}

      {isProjectsModalOpen && (
        <ProjectManagerModal
          isOpen={isProjectsModalOpen}
          onClose={() => setIsProjectsModalOpen(false)}
          projects={projects}
          currentProjectId={currentProject.id}
          onSelectProject={(id) => {
            setCurrentProjectId(id);
            setActiveHookIndex(0);
            performLocalSave(false, projectsRef.current, id);
          }}
          onCreateNewProject={handleCreateNewProject}
          onDuplicateProject={handleDuplicateProject}
          onDeleteProject={handleDeleteProject}
          onClearAllProjects={handleClearAllProjects}
          onClearOtherProjects={handleClearOtherProjects}
          onReplaceProjects={handleReplaceCleanedProjects}
          deployLogsVersion={deployLogsVersion}
        />
      )}

      {confirmDialog && confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0e1525] border border-[#243250] rounded-2xl p-5 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white">{confirmDialog.title}</h3>
            <p className="text-xs text-slate-300 leading-relaxed">{confirmDialog.description}</p>
            {confirmDialog.details && confirmDialog.details.length > 0 && (
              <ul className="bg-[#090d18] border border-[#1c273f] rounded-xl p-3 space-y-1 text-[11px] text-slate-400">
                {confirmDialog.details.map((d, idx) => (
                  <li key={idx} className="truncate">• {d}</li>
                ))}
              </ul>
            )}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={confirmDialog.isProcessing}
                onClick={() => setConfirmDialog(null)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {confirmDialog.cancelLabel || 'Batal'}
              </button>
              <button
                type="button"
                disabled={confirmDialog.isProcessing}
                onClick={() => void confirmDialog.onConfirm()}
                className={`px-4 py-2 rounded-xl text-white text-xs font-bold cursor-pointer disabled:opacity-50 ${
                  confirmDialog.tone === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : confirmDialog.tone === 'warning'
                    ? 'bg-amber-600 hover:bg-amber-500'
                    : 'bg-purple-600 hover:bg-purple-500'
                }`}
              >
                {confirmDialog.isProcessing ? 'Memproses...' : confirmDialog.confirmLabel || 'Konfirmasi'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
