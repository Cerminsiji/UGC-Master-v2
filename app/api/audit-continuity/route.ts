import { NextRequest, NextResponse } from 'next/server';
import { Type } from '@google/genai';
import type { ReferenceRole, VisualContinuityBible } from '@/types';
import {
  generateWithFallback,
  parseSafeJson,
  REFERENCE_ROLE_OPTIONS,
  getReferenceRoleLabel,
  selectSceneReferenceIndexes,
  formatReferenceTagsForScene,
} from '@/lib/gemini-ugc';

const ANGLE_VARIATION_POOL = [
  'Front Camera / Selfie Mode (Curhat Langsung)',
  'Extreme Close-up / Macro (Tekstur & Detail)',
  'POV / Handheld (First-Person)',
  'Over the Shoulder (OTS)',
  'Low Angle (Hero / Powerful)',
  'Flat Lay / Top-down (Meja Estetik)',
  'Mirror Reflection Shot (Kaca GRWM)',
];

function deterministicContinuityRepair(params: {
  scenes: any[];
  productName: string;
  normalizedRoles: ReferenceRole[];
  refTotal: number;
  visualBible: Partial<VisualContinuityBible> | null;
}) {
  const { scenes, productName, normalizedRoles, refTotal, visualBible } = params;
  const total = scenes.length;
  const prod = productName || 'Produk';
  const defaultNeg =
    visualBible?.negativePromptGlobal ||
    'no altered brand text, no gibberish label, no extra fingers, no clipping hands, no floating object, no sudden lighting shift, no morphing';

  let prevAngle = '';
  return scenes.map((sc, idx) => {
    let angle = String(sc.cameraAngle || 'Medium Shot').trim();
    if (prevAngle && angle.toLowerCase() === prevAngle.toLowerCase()) {
      const alt = ANGLE_VARIATION_POOL.find((a) => a.toLowerCase() !== prevAngle.toLowerCase());
      if (alt) angle = alt;
    }
    prevAngle = angle;

    const rawIdx = Array.isArray(sc.referencedImageIndexes)
      ? sc.referencedImageIndexes
          .map((n: any) => Number(n))
          .filter((n: number, pos: number, arr: number[]) => Number.isInteger(n) && n >= 1 && n <= refTotal && arr.indexOf(n) === pos)
      : [];
    const referencedImageIndexes =
      rawIdx.length > 0
        ? rawIdx
        : selectSceneReferenceIndexes(angle, normalizedRoles, refTotal, idx, total);

    const refTag = formatReferenceTagsForScene(referencedImageIndexes, normalizedRoles, prod);
    const visual = String(sc.visualAction || `Kreator menampilkan ${prod} secara natural.`).trim();
    const popupText = String(sc.popupText || '').trim();
    const transitionBridge =
      idx === 0
        ? `Mulai pose pembuka fokus ${prod} → arahkan gerakan tangan mengantar mulus ke Adegan 2.`
        : idx === total - 1
        ? `Lanjutkan posisi produk dari Adegan ${idx} → tutup dengan gestur CTA mengunci kemasan ${prod} tetap stabil.`
        : `Sambung mulus dari pose akhir Adegan ${idx} dengan pencahayaan seragam → akhiri di posisi siap masuk Adegan ${idx + 2}.`;
    const negativePrompt = String(sc.negativePrompt || '').trim() || defaultNeg;

    let flowPrompt = String(sc.googleFlowPrompt || '').trim();
    const lockSnippet = visualBible?.exactLabelText
      ? `Visual Lock: exact label "${visualBible.exactLabelText}" (${visualBible.packagingColors || 'match reference'}), lighting (${visualBible.environmentLighting || 'consistent single directional light'})`
      : `Visual Lock: exact label "${prod}"`;

    if (!flowPrompt) {
      flowPrompt = `${refTag} Scene ${idx + 1} (${angle}): ${visual} - ${lockSnippet}${popupText ? ` - On-Screen Pop-up Text Overlay: "${popupText}"` : ''} - strict physical laws, realistic mass inertia, biomechanical constraint adherence, photorealistic 9:16 vertical 4k 60fps.`;
    } else {
      if (/\[Image\s+\d+[^\]]*\]/i.test(flowPrompt)) {
        flowPrompt = flowPrompt.replace(/(?:\[Image\s+\d+[^\]]*\]\s*)+/i, `${refTag} `);
      } else {
        flowPrompt = `${refTag} ${flowPrompt}`;
      }
      if (!/visual lock|exact label/i.test(flowPrompt)) {
        flowPrompt = `${flowPrompt} - ${lockSnippet}`;
      }
    }

    const refDesc = referencedImageIndexes
      .map((n: number) => `#${n} (${getReferenceRoleLabel(normalizedRoles[n - 1], true)})`)
      .join(', ');

    return {
      ...sc,
      cameraAngle: angle,
      visualAction: visual,
      referencedImageIndexes,
      transitionBridge,
      negativePrompt,
      googleFlowPrompt: flowPrompt,
      imageReferenceNote:
        refTotal > 1
          ? `Kunci visual mengikuti Gambar Referensi ${refDesc}`
          : 'Pastikan Produk sesuai Gambar referensi yang sudah di attached',
    };
  });
}

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const {
      scenes = [],
      productName = 'Produk Unggulan',
      visualBible: rawVisualBible = null,
      referenceImages: rawReferenceImages = [],
      referenceRoles: rawReferenceRoles = [],
      persona = '',
      tone = '',
      targetPlatform = 'TikTok Shop',
    } = body || {};

    if (!Array.isArray(scenes) || scenes.length === 0) {
      return NextResponse.json(
        { error: 'Daftar adegan kosong sehingga tidak dapat diselaraskan.' },
        { status: 400 }
      );
    }

    const allReferenceImages: string[] = Array.isArray(rawReferenceImages)
      ? rawReferenceImages.filter((x: unknown) => typeof x === 'string' && x.trim().length > 0)
      : [];
    const validRoleSet = new Set<ReferenceRole>(REFERENCE_ROLE_OPTIONS.map((r) => r.value));
    const refTotal = Math.max(1, allReferenceImages.length);
    const normalizedRoles: ReferenceRole[] = Array.from({ length: refTotal }, (_, idx) => {
      const candidate = Array.isArray(rawReferenceRoles) ? rawReferenceRoles[idx] : undefined;
      if (candidate && validRoleSet.has(candidate)) return candidate as ReferenceRole;
      return idx === 0 ? 'product' : 'detail';
    });
    const visualBible: Partial<VisualContinuityBible> | null =
      rawVisualBible && typeof rawVisualBible === 'object' ? rawVisualBible : null;

    const refInventory =
      allReferenceImages.length > 0
        ? allReferenceImages
            .map((_, idx) => {
              const meta =
                REFERENCE_ROLE_OPTIONS.find((r) => r.value === normalizedRoles[idx]) || REFERENCE_ROLE_OPTIONS[0];
              return `  * Image #${idx + 1} -> ${meta.label} (${meta.promptHint})`;
            })
            .join('\n')
        : `  * Image #1 -> Produk Utama (${productName})`;

    const timelineSummary = scenes
      .map(
        (sc: any, idx: number) =>
          `Adegan ${idx + 1} (${sc.duration || 3}s | Angle: ${sc.cameraAngle || '-'})\n` +
          `  - Visual: ${sc.visualAction || '-'}\n` +
          `  - VO: ${sc.dialogVO || '-'}\n` +
          `  - Pop-up: ${sc.popupText || '-'}\n` +
          `  - Transisi saat ini: ${sc.transitionBridge || '-'}\n` +
          `  - Ref saat ini: ${JSON.stringify(sc.referencedImageIndexes || [1])}`
      )
      .join('\n\n');

    const prompt = `Kamu adalah Senior Continuity Supervisor & AI UGC Director.
Audit dan selaraskan seluruh timeline storyboard (${scenes.length} adegan) untuk produk "${productName}" agar 100% menyambung mulus tanpa jump-cut, tidak ada dua adegan berurutan dengan sudut kamera identik, serta semua tag referensi dan Visual Continuity Bible terkunci ketat.

KONTEKS:
- Persona: ${persona || 'Kreator UGC Natural'}
- Tone VO: ${tone || 'Santai & Natural'}
- Platform: ${targetPlatform}
- Referensi Gambar (${refTotal} slot):
${refInventory}
${
  visualBible
    ? `- Visual Continuity Bible:
  * Warna Kemasan: ${visualBible.packagingColors || '-'}
  * Teks Label Persis: ${visualBible.exactLabelText || productName}
  * Bentuk/Material: ${visualBible.productShapeMaterial || '-'}
  * Talent: ${visualBible.talentAppearance || '-'}
  * Pencahayaan/Lokasi: ${visualBible.environmentLighting || '-'}`
    : ''
}

TIMELINE SAAT INI:
${timelineSummary}

TUGAS PENYELARASAN:
Untuk SETIAP adegan (berurutan 1..${scenes.length}), kembalikan penyempurnaan:
1. \`order\`: nomor urut adegan (1..${scenes.length}).
2. \`cameraAngle\`: pastikan TIDAK ADA dua adegan berurutan memakai sudut kamera sama.
3. \`visualAction\`: pertajam sedikit sambungan pose/aksi dengan adegan sebelum & sesudahnya tanpa mengubah pesan inti produk, patuh hukum fisika (kontak solid, gravitasi, pencahayaan tunggal).
4. \`transitionBridge\`: WAJIB rangkai Start Pose (menyambung tepat dari End Pose adegan sebelumnya) -> End Pose (mengantar ke adegan berikutnya).
5. \`referencedImageIndexes\`: indeks 1-based dari foto referensi yang paling tepat (rentang 1..${refTotal}).
6. \`negativePrompt\`: larangan visual bahasa Inggris (no altered label, no extra fingers, no clipping, no lighting shift).

Jaga jumlah item \`repairs\` TEPAT ${scenes.length} buah sesuai urutan adegan.`;

    const config = {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          auditSummary: { type: Type.STRING },
          repairs: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                order: { type: Type.INTEGER },
                cameraAngle: { type: Type.STRING },
                visualAction: { type: Type.STRING },
                transitionBridge: { type: Type.STRING },
                referencedImageIndexes: {
                  type: Type.ARRAY,
                  items: { type: Type.INTEGER },
                },
                negativePrompt: { type: Type.STRING },
              },
              required: [
                'order',
                'cameraAngle',
                'visualAction',
                'transitionBridge',
                'referencedImageIndexes',
                'negativePrompt',
              ],
            },
          },
        },
        required: ['auditSummary', 'repairs'],
      },
    };

    const rawText = await generateWithFallback(
      prompt,
      config,
      'You are an elite Film & UGC Continuity Supervisor. Audit every scene sequentially so Start Pose -> End Pose transitions, camera angles, lighting direction, and Visual Continuity Bible remain 100% locked across the entire timeline.',
      24000,
      allReferenceImages,
      normalizedRoles
    );

    const parsed = parseSafeJson<any>(rawText);
    if (parsed && Array.isArray(parsed.repairs) && parsed.repairs.length > 0) {
      const merged = scenes.map((sc: any, idx: number) => {
        const rep =
          parsed.repairs.find((r: any) => Number(r.order) === idx + 1) || parsed.repairs[idx] || {};
        return {
          ...sc,
          cameraAngle: rep.cameraAngle || sc.cameraAngle,
          visualAction: rep.visualAction || sc.visualAction,
          transitionBridge: rep.transitionBridge || sc.transitionBridge,
          referencedImageIndexes:
            Array.isArray(rep.referencedImageIndexes) && rep.referencedImageIndexes.length > 0
              ? rep.referencedImageIndexes
              : sc.referencedImageIndexes,
          negativePrompt: rep.negativePrompt || sc.negativePrompt,
        };
      });

      const finalized = deterministicContinuityRepair({
        scenes: merged,
        productName,
        normalizedRoles,
        refTotal,
        visualBible,
      });

      return NextResponse.json({
        success: true,
        auditSummary:
          parsed.auditSummary ||
          `Kontinuitas ${finalized.length} adegan berhasil diselaraskan dengan pengunci visual & transisi pose.`,
        scenes: finalized,
        source: 'gemini',
      });
    }

    const fallbackScenes = deterministicContinuityRepair({
      scenes,
      productName,
      normalizedRoles,
      refTotal,
      visualBible,
    });

    return NextResponse.json({
      success: true,
      auditSummary: `Kontinuitas ${fallbackScenes.length} adegan diselaraskan otomatis (transisi pose, variasi angle kamera, & tag referensi).`,
      scenes: fallbackScenes,
      source: 'deterministic-repair',
    });
  } catch (err: any) {
    console.error('Error in /api/audit-continuity:', err);
    return NextResponse.json(
      { error: err?.message || 'Gagal menyelaraskan kontinuitas adegan.' },
      { status: 500 }
    );
  }
}
