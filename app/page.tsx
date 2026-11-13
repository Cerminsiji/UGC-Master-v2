'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  bootstrapSheetsDatabase,
  fetchUserProjectsFromSheets,
  syncProjectsToSheets,
  logActivityToSheets,
  saveUserDraftMirror,
  loadUserDraftMirror,
  mergeDraftImagesIntoSheetProjects,
  sanitizeTabName,
  SPREADSHEET_URL,
  SESSION_USER_KEY,
} from '@/utils/storyboardStorage';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { SceneCard } from '@/components/SceneCard';
import { PasswordGate, AUTH_STORAGE_KEY } from '@/components/PasswordGate';
import { DirectLinkExtractorBar } from '@/components/DirectLinkExtractorBar';

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
  { ssr: false }
);
const RateCardCalculator = dynamic(
  () => import('@/components/RateCardCalculator').then((mod) => mod.RateCardCalculator),
  { ssr: false }
);
const MetaCleanerPro = dynamic(
  () => import('@/components/MetaCleanerPro').then((mod) => mod.MetaCleanerPro),
  { ssr: false }
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
  PublicAppUser,
} from '@/types';
import { copyToClipboard, generateId, postJsonWithRetry, filesToReferenceImages } from '@/utils/helpers';
import { formatShortCaption, generateRichFallback } from '@/lib/gemini-ugc';
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
  FileSpreadsheet,
  ExternalLink,
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

  // Multi-user auth + in-memory Google Sheets token state
  const [currentUser, setCurrentUser] = useState<PublicAppUser | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);

  // Projects State (isolated per logged-in user)
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
  const [isAdminDashboardOpen, setIsAdminDashboardOpen] = useState(false);
  const [isJsonCopied, setIsJsonCopied] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [enhancingSceneId, setEnhancingSceneId] = useState<string | null>(null);

  // Google Sheets Database & 1-Minute Auto-Save State
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | 'pending'>('saved');
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(false);
  const [autoSaveCountdown, setAutoSaveCountdown] = useState<number>(60);

  const projectsRef = useRef(projects);
  const currentUserRef = useRef(currentUser);
  const googleTokenRef = useRef(googleToken);
  const hasUnsavedSheetChangesRef = useRef(false);

  useEffect(() => {
    projectsRef.current = projects;
    currentUserRef.current = currentUser;
    googleTokenRef.current = googleToken;
  }, [projects, currentUser, googleToken]);

  // Hydrate multi-user session & initialize Firebase Auth state listener
  useEffect(() => {
    setMounted(true);

    try {
      const savedSession = localStorage.getItem(SESSION_USER_KEY);
      if (savedSession) {
        const parsedUser = JSON.parse(savedSession) as PublicAppUser;
        if (parsedUser?.username) {
          setCurrentUser(parsedUser);
          const draft = loadUserDraftMirror(parsedUser.username);
          if (draft.projects && draft.projects.length > 0) {
            setProjects(draft.projects);
            if (draft.currentProjectId && draft.projects.some((p) => p.id === draft.currentProjectId)) {
              setCurrentProjectId(draft.currentProjectId);
            } else {
              setCurrentProjectId(draft.projects[0].id);
            }
          }
        }
      }
    } catch {}

    setIsStorageLoaded(true);
  }, []);

  // Save draft mirror whenever active user edits projects
  useEffect(() => {
    if (!isStorageLoaded || !currentUser) return;
    saveUserDraftMirror(currentUser.username, projects, currentProjectId);
  }, [projects, currentProjectId, currentUser, isStorageLoaded]);

  // Core Google Sheets Sync Worker
  const syncNowToSheets = useCallback(
    async (
      mode: 'AUTO_SAVE_1M' | 'MANUAL_SAVE' | 'PROJECT_MUTATION',
      overrideProjects?: StoryboardProject[]
    ) => {
      const token = googleTokenRef.current;
      const user = currentUserRef.current;
      const list = overrideProjects || projectsRef.current;
      if (!token || !user || list.length === 0) return;

      setSaveStatus('saving');
      const res = await syncProjectsToSheets(token, user, list, mode);
      if (res.success) {
        hasUnsavedSheetChangesRef.current = false;
        setSaveStatus('saved');
        setLastSavedTime(res.timestamp);
      } else {
        setSaveStatus('error');
        if (res.needsReauth) {
          setGoogleToken(null);
          setAutoSaveEnabled(false);
        }
      }
    },
    []
  );

  // Read-only initial fetch from user's isolated DB tab once Google Token & User are active
  useEffect(() => {
    if (!googleToken || !currentUser) return;
    let cancelled = false;

    const loadUserSheetsProjects = async () => {
      try {
        const res = await fetchUserProjectsFromSheets(googleToken, currentUser);
        if (cancelled) return;
        if (res.success) {
          if (res.projects.length > 0) {
            const draft = loadUserDraftMirror(currentUser.username);
            const merged = mergeDraftImagesIntoSheetProjects(res.projects, draft.projects);
            setProjects(merged);
            setCurrentProjectId(merged[0].id);
            setSaveStatus('saved');
            setLastSavedTime(
              new Date().toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })
            );
          }
        } else if (res.needsReauth) {
          setGoogleToken(null);
        }
      } catch {}
    };

    loadUserSheetsProjects();
    return () => {
      cancelled = true;
    };
  }, [googleToken, currentUser]);

  // 1-Minute (60 seconds) Auto-Save Interval to Google Sheets
  useEffect(() => {
    if (!autoSaveEnabled || !googleToken || !currentUser) {
      setAutoSaveCountdown(60);
      return;
    }

    const timer = setInterval(() => {
      setAutoSaveCountdown((prev) => {
        if (prev <= 1) {
          void syncNowToSheets('AUTO_SAVE_1M');
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [autoSaveEnabled, googleToken, currentUser, syncNowToSheets]);

  const handleConnectGoogle = async (): Promise<string | null> => {
    showToast('Penyimpanan berjalan otomatis via Local Storage browser.');
    return null;
  };

  const requestEnableAutoSaveAndInit = () => {
    const user = currentUser;
    if (!user) return;
    const tabName = user.sheetTabName || sanitizeTabName(user.username);

    setConfirmDialog({
      isOpen: true,
      title: 'Aktifkan Database & Auto-Save 1 Menit ke Google Sheets?',
      description:
        'Sistem akan menyiapkan struktur database di Google Spreadsheet (tab _Users, _Activity_Logs, dan worksheet pribadi Anda) serta menyinkronkan data storyboard secara otomatis setiap 1 menit.',
      details: [
        `Spreadsheet Target: ${SPREADSHEET_URL}`,
        `Database User (@${user.username}): Worksheet ${tabName}`,
        'Interval Auto-Save: Setiap 60 detik (1 menit)',
      ],
      confirmLabel: 'Ya, Inisialisasi & Aktifkan 1 Menit',
      tone: 'primary',
      onConfirm: async () => {
        let token = googleTokenRef.current;
        if (!token) {
          token = await handleConnectGoogle();
        }
        if (!token) {
          setConfirmDialog(null);
          return;
        }
        setConfirmDialog((prev) => (prev ? { ...prev, isProcessing: true } : null));
        try {
          await bootstrapSheetsDatabase(token, user.username);
          await syncNowToSheets('MANUAL_SAVE');
          setAutoSaveEnabled(true);
          setAutoSaveCountdown(60);
          setConfirmDialog(null);
          showToast(`✅ Database ${tabName} siap & Auto-Save 1 menit aktif!`);
        } catch (err: any) {
          setConfirmDialog(null);
          showToast(err?.message || 'Gagal menginisialisasi Google Sheets.');
        }
      },
    });
  };

  // Explicit manual save confirmation action
  const handleManualSave = () => {
    if (!googleToken) {
      void handleConnectGoogle();
      return;
    }
    const user = currentUser;
    const tabName = user?.sheetTabName || sanitizeTabName(user?.username || 'admin');
    setConfirmDialog({
      isOpen: true,
      title: 'Simpan & Sinkronkan ke Google Sheets Sekarang?',
      description:
        'Data project, brief produk, parameter UGC, caption, dan seluruh adegan akan disimpan ke worksheet database pribadi Anda.',
      details: [
        `Worksheet Target: ${tabName}`,
        `Jumlah Project: ${projects.length} Naskah`,
      ],
      confirmLabel: 'Simpan ke Google Sheets',
      tone: 'primary',
      onConfirm: async () => {
        setConfirmDialog((prev) => (prev ? { ...prev, isProcessing: true } : null));
        await syncNowToSheets('MANUAL_SAVE');
        setAutoSaveEnabled(true);
        setAutoSaveCountdown(60);
        setConfirmDialog(null);
        showToast('💾 Naskah Storyboard tersinkron ke Google Sheets!');
      },
    });
  };

  const handleAuthSuccess = (user: PublicAppUser) => {
    setCurrentUser(user);
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, 'true');
      localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    } catch {}

    const draft = loadUserDraftMirror(user.username);
    if (draft.projects && draft.projects.length > 0) {
      setProjects(draft.projects);
      setCurrentProjectId(draft.currentProjectId || draft.projects[0].id);
    } else {
      setProjects([
        {
          ...INITIAL_BEFORE_AFTER_PROJECT,
          id: `${INITIAL_BEFORE_AFTER_PROJECT.id}_${user.username}`,
          ownerUsername: user.username,
        },
      ]);
      setCurrentProjectId(`${INITIAL_BEFORE_AFTER_PROJECT.id}_${user.username}`);
    }
  };

  const handleSwitchWorkspaceUser = (targetUser: PublicAppUser) => {
    setCurrentUser(targetUser);
    try {
      localStorage.setItem(SESSION_USER_KEY, JSON.stringify(targetUser));
    } catch {}
    showToast(`Beralih ke database user @${targetUser.username} (${targetUser.sheetTabName})`);
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

  // Show temporary toast notification
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  const handleLogout = async () => {
    const user = currentUser;
    if (googleToken && user) {
      await logActivityToSheets(googleToken, {
        userId: user.id,
        username: user.username,
        role: user.role,
        action: 'LOGOUT',
        target: user.sheetTabName,
        details: 'Keluar & mengunci sesi studio',
        status: 'info',
      });
    }
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem(SESSION_USER_KEY);
    } catch {}
    setGoogleToken(null);
    setAutoSaveEnabled(false);
    setCurrentUser(null);
    showToast('Studio telah dikunci');
  };

  // Update current project helper
  const updateCurrentProject = (updater: (prev: StoryboardProject) => StoryboardProject) => {
    hasUnsavedSheetChangesRef.current = true;
    setSaveStatus('pending');
    setProjects((prev) => {
      const updatedList = prev.map((p) => {
        if (p.id === currentProjectId) {
          const updated = updater(p);
          return {
            ...updated,
            ownerUsername: currentUser?.username || updated.ownerUsername,
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
      };
    });

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
        updateCurrentProject((p) => ({
          ...p,
          scenes: cat.defaultScenes.map((sc, idx) => {
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
          }),
        }));
        showToast(`Template di-reset ke default ${cat.name}`);
      },
    });
  };

  // Trigger AI modal prefilled with category
  const handleTriggerAICategory = (cat: UGCTemplateCategory) => {
    handleSelectCategory(cat.id);
    setIsAIGeneratorOpen(true);
  };

  // Update single scene
  const handleUpdateScene = (updatedScene: Scene) => {
    updateCurrentProject((p) => ({
      ...p,
      scenes: p.scenes.map((s) => (s.id === updatedScene.id ? updatedScene : s)),
    }));
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

  // Move scene
  const handleMoveScene = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentProject.scenes.length) return;

    updateCurrentProject((p) => {
      const newScenes = [...p.scenes];
      const temp = newScenes[index];
      newScenes[index] = newScenes[targetIndex];
      newScenes[targetIndex] = temp;
      return {
        ...p,
        scenes: newScenes.map((s, idx) => ({ ...s, order: idx + 1 })),
      };
    });
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

  // AI Enhance Scene
  const handleEnhanceScene = async (targetScene: Scene) => {
    setEnhancingSceneId(targetScene.id);
    try {
      const data = await postJsonWithRetry<{ success?: boolean; scene?: Partial<Scene> }>(
        '/api/enhance-scene',
        {
          scene: targetScene,
          category: activeCategory.name,
          productName: currentProject.productName,
          cameraAngleStyle: currentProject.cameraAngleStyle,
          targetPlatform: currentProject.targetPlatform,
          instruction: 'make it more viral and catchy with expressive gestures, specific camera angle, and sound effect',
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
        showToast('✨ Adegan berhasil di-polish oleh AI!');
      } else {
        const fallbackPopup = targetScene.popupText ? `${targetScene.popupText.toUpperCase()} 🔥` : 'RAHASIA VIRAL TERUNGKAP! ✨';
        handleUpdateScene({
          ...targetScene,
          visualAction: `${targetScene.visualAction} (Gerakan dipertegas, mimik wajah lebih ekspresif & meyakinkan)`,
          popupText: fallbackPopup,
          soundEffect: targetScene.soundEffect ? `${targetScene.soundEffect} + Swoosh` : 'Swoosh & Sparkle Chime',
          imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
        });
        showToast('✨ Adegan berhasil ditingkatkan!');
      }
    } catch (e) {
      console.error('Enhance scene error:', e);
      showToast('Gagal memproses AI enhance');
    } finally {
      setEnhancingSceneId(null);
    }
  };

  // Select Hook Variant for Scene 1
  const handleSelectHookVariant = (vIdx: number) => {
    const variants = currentProject.hookVariants || [];
    if (!variants[vIdx]) return;
    setActiveHookIndex(vIdx);
    const chosen = variants[vIdx];
    updateCurrentProject((p) => {
      const scenes = [...p.scenes];
      if (scenes[0]) {
        scenes[0] = {
          ...scenes[0],
          dialogVO: chosen.dialogVO,
          visualAction: chosen.visualAction,
          popupText: chosen.popupText,
          soundEffect: chosen.soundEffect,
          duration: Number(chosen.duration) || scenes[0].duration,
        };
      }
      return { ...p, scenes };
    });
    showToast(`Mengaktifkan ${chosen.name}!`);
  };

  const handleAddHookVariant = () => {
    setIsHooksModalOpen(true);
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
        ownerUsername: currentUser?.username || 'admin',
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
        scenes: genScenes,
      };

      hasUnsavedSheetChangesRef.current = true;
      setSaveStatus('pending');
      setProjects((prev) => [newProj, ...prev]);
      setCurrentProjectId(newProj.id);
      setIsAIGeneratorOpen(false);
      showToast('🎉 Storyboard AI berhasil dibuat! (Siap disinkronkan ke Google Sheets)');

      if (googleToken && currentUser) {
        void logActivityToSheets(googleToken, {
          userId: currentUser.id,
          username: currentUser.username,
          role: currentUser.role,
          action: 'AI_GENERATE',
          target: newProj.title,
          details: `Generate storyboard AI (${genScenes.length} adegan, produk: ${params.productName})`,
          status: 'success',
        });
      }
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

  // Apply viral hook to Scene 1
  const handleApplyHook = (hook: AIHookOption) => {
    if (currentProject.scenes.length === 0) return;

    updateCurrentProject((p) => {
      const newScenes = [...p.scenes];
      newScenes[0] = {
        ...newScenes[0],
        dialogVO: hook.hookDialog,
        visualAction: hook.visualAction,
        popupText: hook.popupText,
        soundEffect: hook.sfx,
        duration: Math.max(2, Math.min(4, newScenes[0].duration)),
      };

      const newVariant: HookVariant = {
        id: generateId(),
        name: `Hook (${hook.type})`,
        type: hook.type,
        dialogVO: hook.hookDialog,
        visualAction: hook.visualAction,
        popupText: hook.popupText,
        soundEffect: hook.sfx,
        duration: 2,
      };

      const existingVariants = p.hookVariants || [];
      return {
        ...p,
        scenes: newScenes,
        hookVariants: [newVariant, ...existingVariants],
      };
    });

    setActiveHookIndex(0);
    showToast(`Hook "${hook.type}" berhasil dipasang di Adegan 1!`);
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
    const newProj: StoryboardProject = {
      id: generateId(),
      ownerUsername: currentUser?.username || 'admin',
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
      scenes: [
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
      ],
    };

    hasUnsavedSheetChangesRef.current = true;
    setSaveStatus('pending');
    setProjects((prev) => [newProj, ...prev]);
    setCurrentProjectId(newProj.id);
    setIsProjectsModalOpen(false);
    showToast('Naskah baru dibuat!');

    if (googleToken && currentUser) {
      void logActivityToSheets(googleToken, {
        userId: currentUser.id,
        username: currentUser.username,
        role: currentUser.role,
        action: 'PROJECT_CREATE',
        target: newProj.title,
        details: `Membuat project naskah baru (${newProj.id})`,
        status: 'success',
      });
    }
  };

  const handleDuplicateProject = (proj: StoryboardProject) => {
    const duplicated: StoryboardProject = {
      ...proj,
      id: generateId(),
      ownerUsername: currentUser?.username || proj.ownerUsername,
      title: `${proj.title} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    hasUnsavedSheetChangesRef.current = true;
    setSaveStatus('pending');
    setProjects((prev) => [duplicated, ...prev]);
    setCurrentProjectId(duplicated.id);
    showToast(`Project "${proj.title}" berhasil diduplikasi!`);

    if (googleToken && currentUser) {
      void logActivityToSheets(googleToken, {
        userId: currentUser.id,
        username: currentUser.username,
        role: currentUser.role,
        action: 'PROJECT_DUPLICATE',
        target: duplicated.title,
        details: `Duplikasi dari "${proj.title}"`,
        status: 'success',
      });
    }
  };

  const handleDeleteProject = (projId: string) => {
    if (projects.length <= 1) {
      showToast('Minimal harus ada 1 project naskah.');
      return;
    }
    const targetProj = projects.find((p) => p.id === projId);
    const tabName = currentUser?.sheetTabName || sanitizeTabName(currentUser?.username || 'admin');

    setConfirmDialog({
      isOpen: true,
      title: `Hapus Naskah "${targetProj?.title || projId}"?`,
      description:
        'Naskah ini akan dihapus dari daftar "Naskah Saya" dan disinkronkan ke worksheet Google Sheets pribadi Anda.',
      details: [
        `Judul Naskah: ${targetProj?.title || '-'}`,
        `Worksheet Database: ${tabName}`,
      ],
      confirmLabel: 'Ya, Hapus Naskah',
      tone: 'danger',
      onConfirm: async () => {
        setConfirmDialog((prev) => (prev ? { ...prev, isProcessing: true } : null));
        const filtered = projects.filter((p) => p.id !== projId);
        setProjects(filtered);
        if (currentProjectId === projId && filtered[0]) {
          setCurrentProjectId(filtered[0].id);
        }
        if (googleTokenRef.current && currentUserRef.current) {
          await syncNowToSheets('PROJECT_MUTATION', filtered);
          await logActivityToSheets(googleTokenRef.current, {
            userId: currentUserRef.current.id,
            username: currentUserRef.current.username,
            role: currentUserRef.current.role,
            action: 'PROJECT_DELETE',
            target: targetProj?.title || projId,
            details: `Menghapus naskah dari database ${tabName}`,
            status: 'info',
          });
        }
        setConfirmDialog(null);
        showToast('Project naskah berhasil dihapus');
      },
    });
  };

  // If not authenticated or not mounted yet, show multi-user login gate
  if (!mounted || !currentUser) {
    return (
      <PasswordGate
        googleToken={googleToken}
        googleEmail={googleEmail}
        onGoogleConnected={(token, email) => {
          setGoogleToken(token);
          setGoogleEmail(email);
        }}
        onSuccess={handleAuthSuccess}
      />
    );
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
        currentUser={currentUser}
        googleConnected={Boolean(googleToken)}
        onConnectGoogle={() => void handleConnectGoogle()}
        onOpenAdminDashboard={() => setIsAdminDashboardOpen(true)}
        autoSaveEnabled={autoSaveEnabled}
        autoSaveCountdown={autoSaveCountdown}
      />

      {/* Main Workspace Layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* Left Sidebar: Formats & Saved Projects */}
        <Sidebar
          selectedCategoryId={currentProject.categoryId}
          onSelectCategory={handleSelectCategory}
          onTriggerAICategory={handleTriggerAICategory}
          projects={projects}
          currentProjectId={currentProject.id}
          onSelectProject={(id) => setCurrentProjectId(id)}
          onCreateNewProject={handleCreateNewProject}
        />

        {/* Main Content Area */}
        <main className="flex-1 bg-[#070a12] overflow-y-auto p-4 md:p-6 lg:p-7 custom-scrollbar">
          <div className="max-w-6xl mx-auto space-y-5">

            {/* Context header continues cleanly without deleted Google Sheets bar */}
            
            {/* Context Bar: Current Format, Summary & Quick Triggers */}
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
                  <span>5 Hook Viral</span>
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

                {/* List of Scene Cards */}
                <div className="space-y-4">
                  {currentProject.scenes.map((scene, index) => (
                    <div key={scene.id} id={`scene-card-${scene.id}`}>
                      <SceneCard
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
                      />
                    </div>
                  ))}
                </div>

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
              />
            )}

            {/* VIEW MODE 3: Kalkulator Rate Card & Penawaran Jasa */}
            {viewMode === 'rate_card' && (
              <RateCardCalculator
                projectTitle={currentProject.title}
                productName={currentProject.productName}
                categoryName={activeCategory.name}
              />
            )}

            {/* VIEW MODE 4: MetaCleaner Pro - FFmpeg.wasm Remux & SEI Stripper */}
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
          onSelectProject={(id) => setCurrentProjectId(id)}
          onCreateNewProject={handleCreateNewProject}
          onDuplicateProject={handleDuplicateProject}
          onDeleteProject={handleDeleteProject}
          currentUser={currentUser}
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
