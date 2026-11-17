import { getRealtimeSignaturePreview, resolveDocumentSignedUrl } from './storageUploader';

export function compressImage(file: File, maxW: number = 640, maxH: number = 480, quality: number = 0.5): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions keeping aspect ratio
        if (width > maxW) {
          height = Math.round((height * maxW) / width);
          width = maxW;
        }
        if (height > maxH) {
          width = Math.round((width * maxH) / height);
          height = maxH;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string); // Fallback to original
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedBase64);
      };
      img.onerror = () => {
        resolve(reader.result as string); // Fallback to original
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Generate a transparent 240x90 PNG Data URL for the Samara Stay Owner Stamp
 */
export function generateOwnerStampPngDataUrl(): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 90;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.clearRect(0, 0, 240, 90);

  // Signature line
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 2.8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(15, 45);
  ctx.bezierCurveTo(30, 18, 40, 8, 55, 32);
  ctx.bezierCurveTo(65, 48, 75, 12, 90, 28);
  ctx.bezierCurveTo(100, 38, 105, 18, 125, 42);
  ctx.bezierCurveTo(140, 22, 155, 52, 175, 28);
  ctx.bezierCurveTo(190, 32, 205, 22, 218, 38);
  ctx.stroke();

  // Stamp arc line
  ctx.strokeStyle = '#2E6F40';
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 2]);
  ctx.beginPath();
  ctx.moveTo(25, 58);
  ctx.quadraticCurveTo(110, 46, 210, 52);
  ctx.stroke();
  ctx.setLineDash([]);

  // Text labels
  ctx.fillStyle = '#2E6F40';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SAMARA STAY OWNER', 110, 72);

  ctx.fillStyle = '#64748b';
  ctx.font = '7px monospace';
  ctx.fillText('OFFICIAL DIGITAL STAMP', 110, 83);

  return canvas.toDataURL('image/png');
}

/**
 * Convert any signature source (real-time cached PNG Data URL, private storage path `signatures/...`,
 * signed HTTP URL, or SVG string) into a clean PNG Base64 Data URL for PDF & Email compatibility.
 *
 * CRITICAL: When options.isTenant === true, NEVER fall back to `generateOwnerStampPngDataUrl()`
 * ("SAMARA STAY OWNER") so the tenant's box never displays the Owner's stamp.
 */
export async function ensurePngDataUrl(
  input: string,
  defaultWidth = 240,
  defaultHeight = 90,
  options?: { isTenant?: boolean; orderId?: string }
): Promise<string> {
  const isTenant = Boolean(options?.isTenant);
  const role: 'tenant' | 'owner' = isTenant ? 'tenant' : 'owner';
  const raw = String(input || '').trim();

  if (!raw) {
    const fallbackCached = getRealtimeSignaturePreview('', role);
    if (fallbackCached && fallbackCached.startsWith('data:image/')) {
      return fallbackCached;
    }
    return isTenant ? '' : generateOwnerStampPngDataUrl();
  }

  // 1. Check real-time in-memory / sessionStorage PNG Data URL cache first (0ms, exact canvas pixels)
  const realtimeCached = getRealtimeSignaturePreview(raw, role);
  if (realtimeCached && (realtimeCached.startsWith('data:image/png') || realtimeCached.startsWith('data:image/jpeg') || realtimeCached.startsWith('data:image/webp'))) {
    return realtimeCached;
  }

  // 2. Already a raster Data URL
  if (raw.startsWith('data:image/png') || raw.startsWith('data:image/jpeg') || raw.startsWith('data:image/webp')) {
    return raw;
  }

  if (typeof document === 'undefined') {
    return raw;
  }

  // Helper to render an HTMLImageElement onto a transparent canvas preserving aspect ratio
  const renderImgToPngDataUrl = (img: HTMLImageElement): string => {
    const canvas = document.createElement('canvas');
    canvas.width = defaultWidth;
    canvas.height = defaultHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return isTenant ? '' : generateOwnerStampPngDataUrl();

    ctx.clearRect(0, 0, defaultWidth, defaultHeight);
    const natW = img.naturalWidth || img.width || defaultWidth;
    const natH = img.naturalHeight || img.height || defaultHeight;
    const scale = Math.min(defaultWidth / natW, defaultHeight / natH);
    const drawW = natW * scale;
    const drawH = natH * scale;
    const offsetX = (defaultWidth - drawW) / 2;
    const offsetY = (defaultHeight - drawH) / 2;
    ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
    return canvas.toDataURL('image/png');
  };

  // 3. Determine whether `raw` is a storage path / HTTP URL / API endpoint vs an SVG string
  const isStoragePathOrUrl =
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('/') ||
    raw.startsWith('blob:') ||
    raw.startsWith('signatures/') ||
    raw.startsWith('tenant-documents/') ||
    raw.startsWith('contracts/');

  if (isStoragePathOrUrl) {
    let fetchTargetUrl = raw;
    if (
      raw.startsWith('signatures/') ||
      raw.startsWith('tenant-documents/') ||
      raw.startsWith('contracts/') ||
      (raw.includes('/storage/v1/object/') && !raw.includes('token='))
    ) {
      const resolved = await resolveDocumentSignedUrl(raw, options?.orderId);
      if (resolved) {
        if (resolved.startsWith('data:image/png') || resolved.startsWith('data:image/jpeg') || resolved.startsWith('data:image/webp')) {
          return resolved;
        }
        fetchTargetUrl = resolved;
      }
    }

    // Fetch image bytes as Blob first to avoid CORS tainted canvas issues
    try {
      const resp = await fetch(fetchTargetUrl, { credentials: 'include' });
      if (resp.ok) {
        const blob = await resp.blob();
        if (blob && blob.size > 0 && blob.type.startsWith('image/')) {
          const objectUrl = URL.createObjectURL(blob);
          try {
            const loadedPng = await new Promise<string>((resolve) => {
              const img = new Image();
              img.onload = () => resolve(renderImgToPngDataUrl(img));
              img.onerror = () => resolve('');
              img.src = objectUrl;
            });
            URL.revokeObjectURL(objectUrl);
            if (loadedPng) return loadedPng;
          } catch {
            URL.revokeObjectURL(objectUrl);
          }
        }
      }
    } catch (e) {
      console.warn('[ensurePngDataUrl] Fetch blob notice:', e);
    }

    // Fallback: direct Image load with crossOrigin='anonymous'
    const directLoaded = await new Promise<string>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          resolve(renderImgToPngDataUrl(img));
        } catch {
          resolve('');
        }
      };
      img.onerror = () => resolve('');
      img.src = fetchTargetUrl;
    });
    if (directLoaded) return directLoaded;

    return isTenant ? '' : generateOwnerStampPngDataUrl();
  }

  // 4. SVG Data URL or raw <svg ...> markup
  return new Promise((resolve) => {
    const img = new Image();
    const cleanSvg = raw.startsWith('data:') ? raw : `data:image/svg+xml;utf8,${encodeURIComponent(raw)}`;
    img.onload = () => {
      try {
        resolve(renderImgToPngDataUrl(img));
      } catch {
        resolve(isTenant ? '' : generateOwnerStampPngDataUrl());
      }
    };
    img.onerror = () => {
      resolve(isTenant ? '' : generateOwnerStampPngDataUrl());
    };
    img.src = cleanSvg;
  });
}
