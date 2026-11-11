export function formatDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function generateId(): string {
  return 'scene_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
}

export function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
  } else {
    // Fallback
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return Promise.resolve(true);
    } catch {
      document.body.removeChild(textArea);
      return Promise.resolve(false);
    }
  }
}

/**
 * Compress & resize an uploaded image File into a lightweight base64 Data URL
 * suitable for multimodal Gemini storyboard generation and Google Flow reference.
 */
export function compressImageFileToDataUrl(
  file: File,
  maxDim = 768,
  quality = 0.78
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (typeof window === 'undefined') {
        resolve(dataUrl);
        return;
      }
      const img = new window.Image();
      img.onerror = () => resolve(dataUrl);
      img.onload = () => {
        try {
          let width = img.width || 512;
          let height = img.height || 512;
          if (width > maxDim || height > maxDim) {
            if (width >= height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', quality);
          resolve(compressed || dataUrl);
        } catch {
          resolve(dataUrl);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Convert multiple File objects (FileList or File[]) into compressed Data URLs
 */
export async function filesToReferenceImages(
  files: FileList | File[],
  maxCount = 8
): Promise<string[]> {
  const arr = Array.from(files).filter((f) => f && f.type.startsWith('image/')).slice(0, maxCount);
  const results: string[] = [];
  for (const file of arr) {
    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      if (dataUrl) results.push(dataUrl);
    } catch {
      // Skip unreadable file
    }
  }
  return results;
}

export function sanitizePayloadForJson<T extends Record<string, any>>(payload: T): T {
  const clone: Record<string, any> = { ...payload };
  if (typeof clone.referenceImage === 'string' && clone.referenceImage.startsWith('data:')) {
    clone.referenceImage = 'Gambar Referensi Produk Terlampir';
  }
  if (Array.isArray(clone.referenceImages)) {
    clone.referenceImageCount = clone.referenceImages.length;
    clone.referenceImages = clone.referenceImages.map((img: string, idx: number) =>
      typeof img === 'string' && img.startsWith('data:')
        ? `Gambar Referensi #${idx + 1} Terlampir`
        : img
    );
  }
  return clone as T;
}

/**
 * Resilient JSON API caller that handles Cloud Run / AI Studio Nginx 302 auth-cache redirects:
 * 1. Sends POST with credentials included (with full base64 referenceImages for multimodal Gemini).
 * 2. If a 302 redirect converted POST -> GET (405) or returned HTML cookie_check, warms /api/health and retries POST.
 * 3. If POST is still intercepted by cross-site iframe rules, falls back to GET ?payload=... with sanitized URL-safe payload.
 */
export async function postJsonWithRetry<T = any>(
  endpoint: string,
  payload: Record<string, any>
): Promise<T | null> {
  const postBodyStr = JSON.stringify(payload);
  const getSafeBodyStr = JSON.stringify(sanitizePayloadForJson(payload));

  const tryParseJson = async (res: Response): Promise<T | null> => {
    const text = await res.text();
    if (!text) return null;
    const trimmed = text.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return null;
    }
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      return null;
    }
  };

  // Attempt 1: Standard POST (includes full multimodal referenceImages)
  try {
    const res1 = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: postBodyStr,
      credentials: 'include',
    });
    if (res1.ok && !res1.redirected) {
      const parsed1 = await tryParseJson(res1);
      if (parsed1) return parsed1;
    }
  } catch {}

  // Warmup Nginx auth_token_cache with a lightweight GET request
  try {
    await fetch('/api/health', {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
    });
  } catch {}

  // Attempt 2: Retry POST now that auth_token_cache is warm
  try {
    const res2 = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: postBodyStr,
      credentials: 'include',
    });
    if (res2.ok) {
      const parsed2 = await tryParseJson(res2);
      if (parsed2) return parsed2;
    }
  } catch {}

  // Attempt 3: Fallback to GET with query parameter (survives 302 redirects with query args intact)
  try {
    const sep = endpoint.includes('?') ? '&' : '?';
    const getUrl = `${endpoint}${sep}payload=${encodeURIComponent(getSafeBodyStr)}`;
    const res3 = await fetch(getUrl, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
    });
    if (res3.ok) {
      const parsed3 = await tryParseJson(res3);
      if (parsed3) return parsed3;
    }
  } catch {}

  return null;
}

