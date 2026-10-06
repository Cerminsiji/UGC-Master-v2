import React, { useState } from 'react';
import {
  ShoppingBag,
  Package,
  PlaySquare,
  MessageSquare,
  Smile,
  Video,
  Sparkles,
  Zap,
  ArrowLeftRight,
  Lightbulb,
  Headphones,
  ShoppingBag as HaulBag,
  FolderOpen,
  Plus,
  Wand2,
  Clock,
  Layers,
  ChevronRight,
  FileText
} from 'lucide-react';
import { UGC_CATEGORIES } from '../data/categories';
import { UGCTemplateCategory, StoryboardProject } from '../types';

interface SidebarProps {
  selectedCategoryId: string;
  onSelectCategory: (category: UGCTemplateCategory) => void;
  onTriggerAICategory: (category: UGCTemplateCategory) => void;
  projects?: StoryboardProject[];
  currentProjectId?: string;
  onSelectProject?: (id: string) => void;
  onCreateNewProject?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  selectedCategoryId,
  onSelectCategory,
  onTriggerAICategory,
  projects = [],
  currentProjectId,
  onSelectProject,
  onCreateNewProject,
}) => {
  const [activeTab, setActiveTab] = useState<'categories' | 'projects'>('categories');

  const getCategoryIcon = (iconName: string) => {
    switch (iconName) {
      case 'ShoppingBag':
        return ShoppingBag;
      case 'Package':
        return Package;
      case 'PlaySquare':
        return PlaySquare;
      case 'MessageSquare':
        return MessageSquare;
      case 'Smile':
        return Smile;
      case 'Video':
        return Video;
      case 'Sparkles':
        return Sparkles;
      case 'Zap':
        return Zap;
      case 'ArrowLeftRight':
        return ArrowLeftRight;
      case 'Lightbulb':
        return Lightbulb;
      case 'Headphones':
        return Headphones;
      default:
        return HaulBag;
    }
  };

  const activeCat = UGC_CATEGORIES.find((c) => c.id === selectedCategoryId) || UGC_CATEGORIES[0];

  return (
    <aside className="w-full lg:w-64 xl:w-72 bg-[#090d16] border-r border-[#1a2336] flex flex-col shrink-0">
      
      {/* Top Navigation Tabs: Formats vs Saved Projects */}
      <div className="p-3 border-b border-[#1a2336] flex items-center gap-1.5 bg-[#0b101b]">
        <button
          onClick={() => setActiveTab('categories')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'categories'
              ? 'bg-purple-600/30 text-purple-200 border border-purple-500/50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#131929]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Format UGC</span>
        </button>

        <button
          onClick={() => setActiveTab('projects')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'projects'
              ? 'bg-purple-600/30 text-purple-200 border border-purple-500/50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#131929]'
          }`}
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span>Naskah Saya ({projects.length})</span>
        </button>
      </div>

      {/* Tab 1: UGC Video Formats */}
      {activeTab === 'categories' && (
        <>
          <div className="px-4 py-2 flex items-center justify-between text-[11px] text-slate-400 font-medium">
            <span>Pilih Format Storyboard:</span>
            <span className="text-[10px] bg-[#141c2c] text-purple-300 font-mono px-2 py-0.5 rounded-full border border-purple-900/40">
              12 Pilihan
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 space-y-1 custom-scrollbar">
            {UGC_CATEGORIES.map((cat) => {
              const Icon = getCategoryIcon(cat.iconName);
              const isActive = cat.id === selectedCategoryId;

              return (
                <button
                  key={cat.id}
                  onClick={() => onSelectCategory(cat)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-all group ${
                    isActive
                      ? 'bg-gradient-to-r from-purple-900/60 to-indigo-900/40 text-white font-bold border border-purple-600/60 shadow-md shadow-purple-950/40'
                      : 'text-slate-300 hover:text-white hover:bg-[#121826] border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`p-1.5 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'bg-[#141b29] text-slate-400 group-hover:text-purple-300'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="truncate">
                      <div className="text-xs leading-tight truncate">{cat.name}</div>
                      <div className="text-[10px] text-slate-400 font-normal leading-tight">
                        {cat.recommendedDuration}s • {cat.defaultScenes.length} Adegan
                      </div>
                    </div>
                  </div>

                  {isActive && (
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0"></div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Active Category Tip & Quick Action */}
          <div className="p-3 border-t border-[#1a2336] bg-[#0c101b]">
            <div className="p-3 rounded-xl bg-[#111726] border border-[#1e293f]">
              <div className="flex items-center gap-2 mb-1.5">
                <Wand2 className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs font-bold text-white truncate">
                  {activeCat.name}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug line-clamp-2">
                {activeCat.description}
              </p>
              <button
                onClick={() => onTriggerAICategory(activeCat)}
                className="mt-2.5 w-full flex items-center justify-center gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-all active:scale-95"
              >
                <Sparkles className="w-3 h-3 text-purple-200" />
                <span>Deteksi & Buat Format Ini</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Tab 2: Saved Projects List */}
      {activeTab === 'projects' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-[#1a2336]">
            {onCreateNewProject && (
              <button
                onClick={onCreateNewProject}
                className="w-full flex items-center justify-center gap-1.5 bg-[#141c2c] hover:bg-[#1b253b] text-purple-300 border border-purple-800/50 hover:border-purple-600 text-xs font-bold py-2 px-3 rounded-xl transition-all shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Buat Naskah Baru</span>
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 custom-scrollbar">
            {projects.map((proj) => {
              const isSelected = proj.id === currentProjectId;
              const duration = proj.scenes.reduce((sum, s) => sum + (Number(s.duration) || 0), 0);

              return (
                <button
                  key={proj.id}
                  onClick={() => onSelectProject && onSelectProject(proj.id)}
                  className={`w-full text-left p-2.5 rounded-xl transition-all border ${
                    isSelected
                      ? 'bg-purple-950/40 border-purple-600/70 text-white shadow-md'
                      : 'bg-[#101625] hover:bg-[#141b2b] border-[#1d273c] text-slate-300 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-xs font-bold truncate line-clamp-1">
                      {proj.title}
                    </span>
                    {isSelected && (
                      <span className="text-[9px] bg-purple-500 text-white px-1.5 py-0.2 rounded font-semibold shrink-0">
                        Aktif
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>{proj.scenes.length} Adegan</span>
                    <span className="font-mono text-emerald-400 font-bold">{duration}s</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

    </aside>
  );
};
