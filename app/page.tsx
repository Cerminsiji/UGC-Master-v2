'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { SceneCard } from '@/components/SceneCard';
import { ScriptTableView } from '@/components/ScriptTableView';
import { RateCardCalculator } from '@/components/RateCardCalculator';
import { AIGeneratorModal } from '@/components/AIGeneratorModal';
import { HookGeneratorModal } from '@/components/HookGeneratorModal';
import { TeleprompterModal } from '@/components/TeleprompterModal';
import { ExportModal } from '@/components/ExportModal';
import { ProjectManagerModal } from '@/components/ProjectManagerModal';
import { PasswordGate, AUTH_STORAGE_KEY } from '@/components/PasswordGate';
import { UGC_CATEGORIES } from '@/data/categories';
import {
  Scene,
  StoryboardProject,
  UGCTemplateCategory,
  AIGenerateParams,
  AIHookOption,
  StoryboardViewMode,
  HookVariant,
} from '@/types';
import { copyToClipboard, generateId } from '@/utils/helpers';
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
} from 'lucide-react';

const STORAGE_KEY = 'ugc_master_projects_v1';
const CURRENT_PROJECT_ID_KEY = 'ugc_master_current_proj_id';

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
  caption: 'Cobain Sago Green Coffee! Bikin makin pede & hasil nyata. Cek keranjang kuning mumpung promo! ✨ #RacunTikTok #fyp #TikTokShop',
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
      googleFlowPrompt: '[Image 1 Reference: Sago Green Coffee] Medium shot of middle-aged creator scratching head in front of mirror with tight shirt, holding Sago Green Coffee sachet - On-Screen Pop-up Text Overlay: "DIET GAGAL MULU, BAJU GAK MUAT?! 😫" - packaging branding adhering to reference image, 9:16 vertical UGC video, 4k 60fps.',
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
      googleFlowPrompt: '[Image 1 Reference: Sago Green Coffee] Close-up shot pouring coffee powder from green sachet into clear glass mug, boiling water swirling - On-Screen Pop-up Text Overlay: "UNTUNG KETEMU KOPI SAGO INI ☕✨" - authentic sachet color and typography matching reference image, vertical 9:16.',
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
      googleFlowPrompt: '[Image 1 Reference: Sago Green Coffee] Over-the-shoulder shot sipping hot coffee mug on cozy living room sofa - On-Screen Pop-up Text Overlay: "GA GAMPANG LAPER SEHARIAN 🔥" - Sago Green Coffee retail packaging visible on coffee table adhering to reference image, 4k 60fps.',
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
      googleFlowPrompt: '[Image 1 Reference: Sago Green Coffee] Dynamic before-after reveal, creator showing loose waistline on trousers while smiling confidently with Sago Green Coffee box - On-Screen Pop-up Text Overlay: "3 MINGGU TURUN 4.5 KG! 📉" - photorealistic lighting, 9:16 vertical smartphone format.',
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
      googleFlowPrompt: '[Image 1 Reference: Sago Green Coffee] Macro close-up shot rotating box packaging in hands - On-Screen Pop-up Text Overlay: "100% HERBAL & BPOM AMAN 🌿" - crystal-clear focus on BPOM seal and green brand typography matching reference image, 4k 60fps.',
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
    },
    {
      id: 'sc_6',
      order: 6,
      cameraAngle: 'Medium Close-up',
      visualAction: 'Bapak tersenyum segar mengacungkan jempol sambil menunjuk ke sudut kiri bawah layar.',
      popupText: 'CEK KERANJANG KUNING SEKARANG! 🛒👇',
      soundEffect: 'Vine boom & Pop click',
      dialogVO: 'Mumpung lagi promo diskon bundle, langsung klik keranjang kuning ya!',
      notesMood: 'Gaya teks: Neon Pulsing Yellow. High energy closing CTA.',
      duration: 3,
      googleFlowPrompt: '[Image 1 Reference: Sago Green Coffee] Medium close-up closing shot, smiling creator pointing towards yellow shopping cart icon holding Sago Green Coffee packaging - On-Screen Pop-up Text Overlay: "CEK KERANJANG KUNING SEKARANG! 🛒👇" - crisp vertical 9:16 TikTok UGC video.',
      imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
    },
  ],
};

export default function HomePage() {
  const [mounted, setMounted] = useState(false);

  // Authentication gate state (Strictly locked by default with password Ilalang@27)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // Projects State with LocalStorage
  const [projects, setProjects] = useState<StoryboardProject[]>([INITIAL_BEFORE_AFTER_PROJECT]);
  const [currentProjectId, setCurrentProjectId] = useState<string>(INITIAL_BEFORE_AFTER_PROJECT.id);

  // View Mode: 'cards' | 'table' | 'rate_card'
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

  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [enhancingSceneId, setEnhancingSceneId] = useState<string | null>(null);

  // Load from localStorage after mount
  useEffect(() => {
    setMounted(true);
    try {
      const auth = localStorage.getItem(AUTH_STORAGE_KEY);
      if (auth === 'true') {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setProjects(parsed);
          const savedId = localStorage.getItem(CURRENT_PROJECT_ID_KEY);
          if (savedId && parsed.some((p) => p.id === savedId)) {
            setCurrentProjectId(savedId);
          } else {
            setCurrentProjectId(parsed[0].id);
          }
        }
      }
    } catch (e) {
      console.error('Failed to load from storage:', e);
    }
  }, []);

  // Save projects to localStorage on change
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    } catch (e) {
      console.error('Failed to save projects to localStorage:', e);
    }
  }, [projects, mounted]);

  // Save current project ID
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(CURRENT_PROJECT_ID_KEY, currentProjectId);
    } catch (e) {}
  }, [currentProjectId, mounted]);

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

  const handleLogout = () => {
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {}
    setIsAuthenticated(false);
    showToast('Studio telah dikunci 🔒');
  };

  // Update current project helper
  const updateCurrentProject = (updater: (prev: StoryboardProject) => StoryboardProject) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id === currentProjectId) {
          const updated = updater(p);
          return { ...updated, updatedAt: new Date().toISOString() };
        }
        return p;
      })
    );
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

  // Quick reset to default category scenes
  const handleResetToCategoryTemplate = (cat: UGCTemplateCategory) => {
    if (!window.confirm(`Reset semua adegan ke template bawaan "${cat.name}"?`)) return;

    updateCurrentProject((p) => ({
      ...p,
      scenes: cat.defaultScenes.map((sc, idx) => {
        const popupText = sc.popupText && sc.popupText.trim() ? sc.popupText.trim() : (idx === 0 ? 'JANGAN SKIP DULU! 🔥' : 'SOLUSI TERBAIK ✨');
        return {
          ...sc,
          id: generateId(),
          order: idx + 1,
          duration: Number(sc.duration) || 3,
          popupText,
          imageReferenceNote: (sc as any).imageReferenceNote || 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
          googleFlowPrompt: (sc as any).googleFlowPrompt || `[Image 1 Reference: ${p.productName || 'Produk'}] Scene ${idx + 1} (${sc.cameraAngle}): ${sc.visualAction} - On-Screen Pop-up Text Overlay: "${popupText}" - Follow reference image, 9:16 vertical, 4k 60fps.`,
        };
      }),
    }));

    showToast(`Template di-reset ke default ${cat.name}`);
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
      visualAction: 'Kreator memperlihatkan manfaat produk secara natural.',
      popupText: 'HASIL MAKSIMAL ✨',
      soundEffect: 'Swoosh',
      dialogVO: 'Gak nyangka hasilnya bisa sebagus ini.',
      notesMood: 'Gaya teks: Modern Yellow. Pencahayaan natural.',
      duration: 3,
      googleFlowPrompt: `[Image 1 Reference: ${currentProject.productName || 'Produk'}] Scene ${newOrder} (Medium Shot): Kreator memperlihatkan manfaat produk secara natural - On-Screen Pop-up Text Overlay: "HASIL MAKSIMAL ✨" - kemasan dan logo konsisten sesuai gambar referensi, 9:16 vertical smartphone video, 4k 60fps.`,
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
      const res = await fetch('/api/enhance-scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene: targetScene,
          category: activeCategory.name,
          productName: currentProject.productName,
          cameraAngleStyle: currentProject.cameraAngleStyle,
          instruction: 'make it more viral and catchy with expressive gestures, specific camera angle, and sound effect',
        }),
      });

      const data = await res.json();
      if (data.success && data.scene) {
        handleUpdateScene({
          ...targetScene,
          ...data.scene,
          id: targetScene.id,
          order: targetScene.order,
          duration: targetScene.duration,
        });
        showToast('✨ Adegan berhasil di-polish oleh AI!');
      } else {
        showToast('Gagal memproses AI enhance');
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

  // AI Full Storyboard Generate
  const handleGenerateStoryboard = async (params: AIGenerateParams) => {
    setIsGeneratingAI(true);
    try {
      const res = await fetch('/api/generate-storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const rawText = await res.text();
      let resData: any = {};
      try {
        resData = JSON.parse(rawText);
      } catch {
        resData = {};
      }

      if (resData.success && resData.data) {
        const genScenes: Scene[] = (resData.data.scenes || []).map((sc: any, i: number) => {
          const popupText =
            sc.popupText && typeof sc.popupText === 'string' && sc.popupText.trim() && sc.popupText.trim() !== '-'
              ? sc.popupText.trim()
              : (i === 0 ? 'JANGAN SKIP DULU! 🔥' : `SOLUSI: ${params.productName.toUpperCase()}`);

          let flowPrompt = sc.googleFlowPrompt && typeof sc.googleFlowPrompt === 'string' ? sc.googleFlowPrompt.trim() : '';
          if (!flowPrompt) {
            flowPrompt = `[Image 1 Reference: ${params.productName}] Scene ${i + 1} (${sc.cameraAngle || 'Medium Shot'}): ${sc.visualAction || ''} - On-Screen Pop-up Text Overlay: "${popupText}" - 9:16 vertical UGC video, 4k 60fps.`;
          } else if (!/on-screen pop-up text overlay|text overlay|popup text/i.test(flowPrompt)) {
            flowPrompt = `${flowPrompt} - On-Screen Pop-up Text Overlay: "${popupText}"`;
          }

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
            imageReferenceNote: sc.imageReferenceNote || 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
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
          title: resData.data.title || `Storyboard ${params.category} - ${params.productName}`,
          categoryId: matchedCat.id,
          productName: params.productName,
          brandName: params.brandName,
          productUrl: params.productUrl,
          referenceImage: params.referenceImage,
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
          caption: resData.data.caption || `Cobain ${params.productName}! Hasil nyata bikin makin pede. Cek keranjang kuning sekarang! ✨ #RacunTikTok #fyp #TikTokShop`.slice(0, 150),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          scenes: genScenes,
        };

        setProjects((prev) => [newProj, ...prev]);
        setCurrentProjectId(newProj.id);
        setIsAIGeneratorOpen(false);
        showToast('🎉 Storyboard AI berhasil dibuat!');
      } else {
        showToast('Gagal membuat storyboard AI. Coba lagi.');
      }
    } catch (e) {
      console.error('Generate storyboard error:', e);
      showToast('Gagal terhubung ke generator AI.');
    } finally {
      setIsGeneratingAI(false);
    }
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
      const res = await fetch('/api/generate-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: currentProject.productName || 'Produk Unggulan',
          category: activeCategory.name,
          targetAudience: currentProject.targetAudience || '',
        }),
      });
      const data = await res.json();
      if (data.success && data.caption) {
        updateCurrentProject((p) => ({ ...p, caption: data.caption }));
        showToast('✨ Caption viral baru berhasil dibuat!');
      }
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
      title: 'Naskah Storyboard Baru',
      categoryId: 'before_after',
      productName: 'Produk Baru',
      persona: 'Wanita',
      tone: 'Santai, Mengalir & Natural (Teman Curhat)',
      targetPlatform: 'TikTok Shop',
      keySellingPoints: 'Kualitas terbaik, hasil nyata, terjangkau.',
      caption: 'Wajib coba produk ini! Bikin takjub & super praktis. Checkout di keranjang kuning! ✨ #fyp #viral #TikTokShop',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      scenes: [
        {
          id: generateId(),
          order: 1,
          cameraAngle: 'POV / Close-up',
          visualAction: 'Kreator menyapa dengan ekspresi kaget dan gestur menyetop scrolling.',
          popupText: 'JANGAN SKIP DULU! 🔥',
          soundEffect: 'Vine boom & Scratch',
          dialogVO: 'Stop scrolling! Kalian wajib tahu rahasia yang satu ini!',
          notesMood: 'Gaya teks: Bold Red. High energy.',
          duration: 3,
          googleFlowPrompt: '[Image 1 Reference: Produk Baru] POV close-up creator with surprised expression halting scroll, holding product - On-Screen Pop-up Text Overlay: "JANGAN SKIP DULU! 🔥" - 9:16 vertical UGC video, 4k 60fps.',
          imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
        },
        {
          id: generateId(),
          order: 2,
          cameraAngle: 'Medium Close-up',
          visualAction: 'Demonstrasi produk ke kamera dengan antusias.',
          popupText: 'HASIL NYATA BANGET ✨',
          soundEffect: 'Swoosh & Chime',
          dialogVO: 'Ini dia produk yang bikin perubahan instan dan bikin nagih!',
          notesMood: 'Gaya teks: Clean Modern.',
          duration: 3,
          googleFlowPrompt: '[Image 1 Reference: Produk Baru] Medium close-up creator demonstrating product to camera with genuine excitement - On-Screen Pop-up Text Overlay: "HASIL NYATA BANGET ✨" - branding matching reference image, 9:16 vertical.',
          imageReferenceNote: 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
        },
      ],
    };

    setProjects((prev) => [newProj, ...prev]);
    setCurrentProjectId(newProj.id);
    setIsProjectsModalOpen(false);
    showToast('Naskah baru dibuat!');
  };

  const handleDuplicateProject = (proj: StoryboardProject) => {
    const duplicated: StoryboardProject = {
      ...proj,
      id: generateId(),
      title: `${proj.title} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setProjects((prev) => [duplicated, ...prev]);
    setCurrentProjectId(duplicated.id);
    showToast(`Project "${proj.title}" berhasil diduplikasi!`);
  };

  const handleDeleteProject = (projId: string) => {
    if (projects.length <= 1) {
      showToast('Minimal harus ada 1 project naskah.');
      return;
    }
    const filtered = projects.filter((p) => p.id !== projId);
    setProjects(filtered);
    if (currentProjectId === projId) {
      setCurrentProjectId(filtered[0].id);
    }
    showToast('Project naskah berhasil dihapus');
  };

  // If not authenticated or not mounted yet, show password gate
  if (!mounted || !isAuthenticated) {
    return <PasswordGate onSuccess={() => setIsAuthenticated(true)} />;
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

                {/* Primary Button: Deteksi Produk */}
                <button
                  onClick={() => setIsAIGeneratorOpen(true)}
                  className="flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-md transition-all active:scale-95 border border-purple-400/30"
                  title="Deteksi produk dari link & buat storyboard otomatis"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300/30" />
                  <span>Deteksi Produk</span>
                </button>
              </div>
            </div>

            {/* Overview Ringkas Produk Terpilih */}
            {currentProject.productName && (
              <div className="bg-gradient-to-r from-purple-950/30 via-[#0d1624] to-[#090f1a] border border-purple-500/30 rounded-2xl p-3 text-xs text-slate-300 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-md">
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

                <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
                  <button
                    type="button"
                    onClick={() => setIsAIGeneratorOpen(true)}
                    className="text-[11px] font-semibold text-purple-300 hover:text-white px-2.5 py-1 rounded-lg bg-purple-950/80 border border-purple-700/60 hover:bg-purple-900 transition-colors"
                  >
                    Generate Ulang AI
                  </button>
                </div>
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
      <AIGeneratorModal
        isOpen={isAIGeneratorOpen}
        onClose={() => setIsAIGeneratorOpen(false)}
        currentCategoryName={activeCategory.name}
        onGenerate={handleGenerateStoryboard}
        isGenerating={isGeneratingAI}
        initialSmartInput={aiGeneratorInitialInput}
      />

      <HookGeneratorModal
        isOpen={isHooksModalOpen}
        onClose={() => setIsHooksModalOpen(false)}
        productName={currentProject.productName || 'Produk'}
        category={activeCategory.name}
        onSelectHook={handleApplyHook}
      />

      <TeleprompterModal
        isOpen={isTeleprompterOpen}
        onClose={() => setIsTeleprompterOpen(false)}
        title={currentProject.title}
        scenes={currentProject.scenes}
      />

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

      <ProjectManagerModal
        isOpen={isProjectsModalOpen}
        onClose={() => setIsProjectsModalOpen(false)}
        projects={projects}
        currentProjectId={currentProject.id}
        onSelectProject={(id) => setCurrentProjectId(id)}
        onCreateNewProject={handleCreateNewProject}
        onDuplicateProject={handleDuplicateProject}
        onDeleteProject={handleDeleteProject}
      />

    </div>
  );
}
