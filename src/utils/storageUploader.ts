import { supabase, isSupabaseConfigured } from '../lib/supabase';

export interface StorageUploadResult {
  publicUrl: string;
  signedUrl?: string;
  storagePath: string;
  bucket: string;
  width: number;
  height: number;
  mimeType: string;
  size: number;
}

export interface UploadOptions {
  maxLongestSide?: number;
  quality?: number;
  forcePNG?: boolean;
  filenamePrefix?: string;
  maxFileSizeMB?: number;
}

/**
 * Convert Data URL (Base64) to Blob
 */
export function dataURLtoBlob(dataurl: string): Blob {
  const arr = dataurl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Convert Blob to Base64 Data URL (Never blob: URL)
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string' && reader.result.length > 0) {
        resolve(reader.result);
      } else {
        resolve('');
      }
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  });
}

/**
 * Upload Blob to server signature endpoint (or Base64 only for public/non-private preview when allowed)
 */
export async function uploadToServerOrBase64(
  blob: Blob,
  identifier: string = 'sig',
  rejectBase64Fallback: boolean = false
): Promise<string> {
  const base64Data = await blobToBase64(blob);
  if (!base64Data) return '';

  try {
    const response = await fetch('/api/signatures/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: base64Data,
        identifier
      })
    });
    const result = await response.json();
    if (result.success && (result.storagePath || result.publicUrl)) {
      if (rejectBase64Fallback) {
        return result.storagePath || result.publicUrl;
      }
      if (result.publicUrl && (result.publicUrl.includes('localhost:') || result.publicUrl.includes('127.0.0.1'))) {
        return base64Data;
      }
      return result.publicUrl;
    }
  } catch (err) {
    console.warn('[StorageUploader] Server endpoint upload failed:', err);
  }

  if (rejectBase64Fallback) {
    throw new Error('Gagal mengunggah berkas ke server storage (Base64 fallback dinonaktifkan sesuai R17).');
  }

  return base64Data;
}

/**
 * Enterprise Image Compressor & HD Optimizer
 * Maintains Full HD resolution (up to 1920px longest side) with 92% JPEG / 90% WEBP quality.
 */
export async function compressAndOptimizeImage(
  input: File | Blob | string,
  options: UploadOptions = {}
): Promise<{ blob: Blob; width: number; height: number; mimeType: string }> {
  const maxLongestSide = options.maxLongestSide || 1920;
  const quality = options.quality !== undefined ? options.quality : 0.92;
  const forcePNG = options.forcePNG || false;

  return new Promise((resolve, reject) => {
    let imgSource: string;
    if (typeof input === 'string') {
      imgSource = input;
    } else {
      imgSource = URL.createObjectURL(input);
    }

    const img = new Image();
    if (typeof input === 'string' && (input.startsWith('http://') || input.startsWith('https://'))) {
      img.crossOrigin = 'anonymous';
    }

    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Downscale long edge to maxLongestSide while maintaining aspect ratio
      if (width > maxLongestSide || height > maxLongestSide) {
        if (width >= height) {
          height = Math.round((height * maxLongestSide) / width);
          width = maxLongestSide;
        } else {
          width = Math.round((width * maxLongestSide) / height);
          height = maxLongestSide;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        if (typeof input !== 'string') URL.revokeObjectURL(imgSource);
        reject(new Error('Failed to get 2D canvas context'));
        return;
      }

      // Preserve alpha channel if PNG / signature or explicit forcePNG
      const isPNG = forcePNG || (typeof input === 'string' && input.startsWith('data:image/png'));
      if (!isPNG) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      const exportFormat = isPNG ? 'image/png' : 'image/webp';
      const exportQuality = isPNG ? 1.0 : quality;

      canvas.toBlob(
        (blob) => {
          if (typeof input !== 'string') URL.revokeObjectURL(imgSource);

          if (blob) {
            resolve({
              blob,
              width,
              height,
              mimeType: exportFormat
            });
          } else {
            // Fallback to JPEG if WebP blob generation fails
            canvas.toBlob(
              (fallbackBlob) => {
                if (fallbackBlob) {
                  resolve({
                    blob: fallbackBlob,
                    width,
                    height,
                    mimeType: 'image/jpeg'
                  });
                } else {
                  reject(new Error('Image canvas conversion failed'));
                }
              },
              'image/jpeg',
              0.92
            );
          }
        },
        exportFormat,
        exportQuality
      );
    };

    img.onerror = (err) => {
      if (typeof input !== 'string') URL.revokeObjectURL(imgSource);
      reject(new Error('Failed to load image for processing: ' + err));
    };

    img.src = imgSource;
  });
}

/**
 * Primary Upload Method to Supabase Storage with HD Preservation & Network Retries
 */
export async function uploadToSupabaseStorage(
  input: File | Blob | string,
  bucketName: string,
  pathPrefix: string = '',
  options: UploadOptions = {}
): Promise<StorageUploadResult> {
  const maxFileSizeMB = options.maxFileSizeMB || 20;

  // 1. Validation for File size & MIME type
  const ALLOWED_MIME_TYPES = [
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/avif', 'application/pdf'
  ];
  if (input instanceof File) {
    if (input.size > maxFileSizeMB * 1024 * 1024) {
      throw new Error(`Ukuran file melebihi batas maksimal ${maxFileSizeMB}MB.`);
    }
    if (input.type && !ALLOWED_MIME_TYPES.includes(input.type)) {
      throw new Error(`Format berkas "${input.type}" tidak didukung. Hanya gambar (JPEG, PNG, WebP) dan dokumen PDF yang diperbolehkan.`);
    }
  }

  // 2. Compress and optimize image to HD quality
  let processedBlob: Blob;
  let width = 1920;
  let height = 1080;
  let mimeType = 'image/webp';

  if (typeof input === 'string' && input.startsWith('http')) {
    // Already a remote URL, return early mock metadata or original string
    return {
      publicUrl: input,
      storagePath: input,
      bucket: bucketName,
      width: 1920,
      height: 1080,
      mimeType: 'image/jpeg',
      size: 0
    };
  }

  // Check if input is non-image PDF file
  if (input instanceof File && input.type === 'application/pdf') {
    processedBlob = input;
    mimeType = 'application/pdf';
  } else {
    try {
      const optimized = await compressAndOptimizeImage(input, options);
      processedBlob = optimized.blob;
      width = optimized.width;
      height = optimized.height;
      mimeType = optimized.mimeType;
    } catch (optErr) {
      console.warn('[StorageUploader] Optimization skipped, uploading raw file:', optErr);
      if (typeof input === 'string') {
        processedBlob = dataURLtoBlob(input);
      } else {
        processedBlob = input;
      }
    }
  }

  // Generate unique storage path with anti-path traversal sanitization
  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'application/pdf' ? 'pdf' : 'webp';
  const timestamp = Date.now();
  const randomHash = Math.random().toString(36).substring(2, 9);
  const sanitizedPrefix = pathPrefix
    ? pathPrefix.replace(/\.\./g, '').replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9_\-\/]/g, '_')
    : '';
  const cleanPrefix = sanitizedPrefix ? sanitizedPrefix + '/' : '';
  const fileName = `${cleanPrefix}${timestamp}_${randomHash}.${ext}`;

  const privateBuckets = new Set([
    'tenant-documents',
    'payment-proof',
    'contracts',
    'signatures',
    'maintenance'
  ]);
  const isPrivateBucket = privateBuckets.has(bucketName);
  const SHORT_LIVED_SIGNED_URL_TTL = 3600; // <= 1 hour (R17)

  if (!isSupabaseConfigured) {
    if (isPrivateBucket && bucketName !== 'signatures') {
      // R17: Never fall back to Base64 in DB columns for private documents; try server storage proxy
      const base64Data = await blobToBase64(processedBlob);
      if (base64Data) {
        const srvRes = await fetch('/api/storage/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            bucket: bucketName,
            fileName,
            base64Data,
            mimeType
          })
        });
        if (srvRes.ok) {
          const srvJson = await srvRes.json();
          if (srvJson.success && (srvJson.storagePath || srvJson.publicUrl)) {
            const canonicalPath = srvJson.storagePath?.startsWith(`${bucketName}/`)
              ? srvJson.storagePath
              : `${bucketName}/${srvJson.storagePath || fileName}`;
            return {
              publicUrl: canonicalPath,
              signedUrl: srvJson.signedUrl || srvJson.publicUrl,
              storagePath: canonicalPath,
              bucket: bucketName,
              width,
              height,
              mimeType,
              size: processedBlob.size
            };
          }
        }
      }
      throw new Error(`Layanan Supabase Storage belum aktif untuk bucket privat '${bucketName}'. Penolakan fallback Base64 sesuai kebijakan privasi R17.`);
    }

    console.warn('[StorageUploader] Supabase storage is not configured. Uploading via server signature/media endpoint.');
    const serverUrl = await uploadToServerOrBase64(processedBlob, pathPrefix || 'sig', isPrivateBucket);
    return {
      publicUrl: serverUrl,
      storagePath: `${bucketName}/${fileName}`,
      bucket: bucketName,
      width,
      height,
      mimeType,
      size: processedBlob.size
    };
  }

  // 3. Upload to Supabase Storage with 3x retry
  let attempts = 0;
  const maxAttempts = 3;
  let lastError: any = null;

  while (attempts < maxAttempts) {
    try {
      attempts++;
      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(fileName, processedBlob, {
          contentType: mimeType,
          upsert: true,
          cacheControl: '3600'
        });

      if (error) {
        lastError = error;
        const errMsg = (error.message || '').toLowerCase();
        const isBucketNotFound = errMsg.includes('bucket not found') || (error as any).statusCode === '404' || (error as any).status === 404;
        const isUnauthorized = errMsg.includes('row-level security') || errMsg.includes('policy') || (error as any).statusCode === '403' || (error as any).status === 403;
        
        if (isBucketNotFound || isUnauthorized) {
          console.info(`[StorageUploader] Supabase storage bucket '${bucketName}' unavailable (${isUnauthorized ? 'RLS Policy' : 'Not Found'}). Using Server API fallback.`);
          break; // Skip further retries and immediately proceed to server /api/storage/upload proxy
        } else {
          console.warn(`[StorageUploader] Upload attempt ${attempts} failed:`, error.message);
        }

        if (attempts < maxAttempts) {
          await new Promise((res) => setTimeout(res, 800 * attempts));
          continue;
        }
        throw error;
      }

      const canonicalPath = `${bucketName}/${data.path}`;
      let resolvedUrl = '';
      let signedPreviewUrl: string | undefined = undefined;

      if (isPrivateBucket) {
        const { data: signedData, error: signErr } = await supabase.storage
          .from(bucketName)
          .createSignedUrl(data.path, SHORT_LIVED_SIGNED_URL_TTL);
        if (!signErr && signedData?.signedUrl) {
          signedPreviewUrl = signedData.signedUrl;
          // Store canonical path in DB columns (R17), not 10-year URL or Base64
          resolvedUrl = canonicalPath;
        } else {
          break; // Proceed to server /api/storage/upload fallback to mint short-lived signed URL via service_role
        }
      } else {
        const { data: publicUrlData } = supabase.storage
          .from(bucketName)
          .getPublicUrl(data.path);
        resolvedUrl = publicUrlData.publicUrl;
      }

      if (bucketName === 'signatures') {
        const sigRole: 'tenant' | 'owner' = (pathPrefix || '').toLowerCase().includes('owner') ? 'owner' : 'tenant';
        const b64Preview = await blobToBase64(processedBlob);
        if (b64Preview) {
          cacheRealtimeSignaturePreview(canonicalPath, b64Preview, sigRole);
          cacheRealtimeSignaturePreview(resolvedUrl, b64Preview, sigRole);
        } else if (signedPreviewUrl) {
          cacheRealtimeSignaturePreview(canonicalPath, signedPreviewUrl, sigRole);
        }
      }

      return {
        publicUrl: resolvedUrl,
        signedUrl: signedPreviewUrl || resolvedUrl,
        storagePath: canonicalPath,
        bucket: bucketName,
        width,
        height,
        mimeType,
        size: processedBlob.size
      };
    } catch (err: any) {
      lastError = err;
      if (attempts >= maxAttempts) break;
    }
  }

  // Server-side Supabase Storage proxy fallback (handles private bucket RLS & short-lived signed URL generation)
  try {
    const base64Data = await blobToBase64(processedBlob);
    if (base64Data) {
      const { data: sessionData } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
      const token = sessionData?.session?.access_token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const srvRes = await fetch('/api/storage/upload', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          bucket: bucketName,
          fileName,
          base64Data,
          mimeType
        })
      });
      if (srvRes.ok) {
        const srvJson = await srvRes.json();
        if (srvJson.success && (srvJson.storagePath || srvJson.publicUrl)) {
          const rawPath = srvJson.storagePath || fileName;
          const canonicalPath = rawPath.startsWith(`${bucketName}/`) ? rawPath : `${bucketName}/${rawPath}`;
          if (bucketName === 'signatures') {
            const sigRole: 'tenant' | 'owner' = (pathPrefix || '').toLowerCase().includes('owner') ? 'owner' : 'tenant';
            cacheRealtimeSignaturePreview(canonicalPath, base64Data, sigRole);
            if (srvJson.signedUrl) {
              cacheRealtimeSignaturePreview(srvJson.signedUrl, base64Data, sigRole);
            }
          }
          return {
            publicUrl: isPrivateBucket ? canonicalPath : srvJson.publicUrl,
            signedUrl: srvJson.signedUrl || srvJson.publicUrl,
            storagePath: canonicalPath,
            bucket: bucketName,
            width,
            height,
            mimeType,
            size: processedBlob.size
          };
        }
      }
    }
  } catch (srvUploadErr) {
    console.warn('[StorageUploader] Server storage upload proxy notice:', srvUploadErr);
  }

  // R17: For private document buckets, NEVER fall back to storing Base64 data:image/... in DB tables
  if (isPrivateBucket && bucketName !== 'signatures') {
    throw new Error(
      lastError?.message ||
      `Gagal mengunggah dokumen privat ke bucket '${bucketName}'. Penyimpanan Base64 di database dinonaktifkan (R17).`
    );
  }

  // For signatures or public marketing fallback: upload to server signature endpoint (never raw Base64 for private docs)
  const fallbackUrl = await uploadToServerOrBase64(processedBlob, pathPrefix || 'img', isPrivateBucket);
  if (isPrivateBucket && fallbackUrl.startsWith('data:')) {
    throw new Error('Gagal menyimpan tanda tangan ke server storage (Base64 fallback ditolak sesuai R17).');
  }

  return {
    publicUrl: fallbackUrl,
    signedUrl: fallbackUrl,
    storagePath: `${bucketName}/${fileName}`,
    bucket: bucketName,
    width,
    height,
    mimeType,
    size: processedBlob.size
  };
}

const realtimeSigMemoryCache = new Map<string, string>();
const REALTIME_SIG_STORAGE_KEY = 'samara_realtime_sig_previews_v1';

function loadSessionSigCache(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(REALTIME_SIG_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function cacheRealtimeSignaturePreview(
  pathOrKey: string,
  dataUrlOrSignedUrl: string,
  role: 'tenant' | 'owner' = 'tenant'
): void {
  if (!dataUrlOrSignedUrl || typeof dataUrlOrSignedUrl !== 'string') return;
  const cleanKey = String(pathOrKey || '').trim();
  if (cleanKey) {
    realtimeSigMemoryCache.set(cleanKey, dataUrlOrSignedUrl);
  }
  if (dataUrlOrSignedUrl.startsWith('data:image/')) {
    realtimeSigMemoryCache.set(`__latest_${role}_sig__`, dataUrlOrSignedUrl);
  }
  if (typeof window !== 'undefined') {
    try {
      const current = loadSessionSigCache();
      if (cleanKey) current[cleanKey] = dataUrlOrSignedUrl;
      if (dataUrlOrSignedUrl.startsWith('data:image/')) {
        current[`__latest_${role}_sig__`] = dataUrlOrSignedUrl;
      }
      // Keep storage bounded to recent 25 entries
      const keys = Object.keys(current);
      if (keys.length > 25) {
        for (let i = 0; i < keys.length - 25; i++) {
          if (!keys[i].startsWith('__latest_')) delete current[keys[i]];
        }
      }
      sessionStorage.setItem(REALTIME_SIG_STORAGE_KEY, JSON.stringify(current));
      window.dispatchEvent(
        new CustomEvent('samara-signature-realtime-sync', {
          detail: { key: cleanKey, previewUrl: dataUrlOrSignedUrl, role }
        })
      );
    } catch {}
  }
}

export function getRealtimeSignaturePreview(
  pathOrUrl?: string,
  role: 'tenant' | 'owner' = 'tenant'
): string {
  const raw = String(pathOrUrl || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:image/') || raw.startsWith('blob:')) return raw;

  const memHit = realtimeSigMemoryCache.get(raw);
  if (memHit) return memHit;

  const sessionMap = loadSessionSigCache();
  if (sessionMap[raw]) {
    realtimeSigMemoryCache.set(raw, sessionMap[raw]);
    return sessionMap[raw];
  }

  // If raw is a canonical storage path like signatures/tenant_... and we have the latest drawn signature in this session
  if (role === 'tenant' && (raw.startsWith('signatures/') || raw.includes('tenant_'))) {
    const latestTenant = realtimeSigMemoryCache.get('__latest_tenant_sig__') || sessionMap['__latest_tenant_sig__'];
    if (latestTenant) return latestTenant;
  }
  if (role === 'owner' && (raw.startsWith('signatures/') || raw.includes('owner_'))) {
    const latestOwner = realtimeSigMemoryCache.get('__latest_owner_sig__') || sessionMap['__latest_owner_sig__'];
    if (latestOwner) return latestOwner;
  }

  return '';
}

/**
 * Request a short-lived signed URL (<= 1 hour) from the server for a private storage path
 */
export async function resolveDocumentSignedUrl(pathOrUrl: string, orderId?: string): Promise<string> {
  if (!pathOrUrl) return '';
  const trimmed = pathOrUrl.trim();
  if (trimmed.startsWith('data:image/') || trimmed.startsWith('blob:')) return trimmed;

  // Check real-time in-memory / sessionStorage preview cache first for instant 0ms rendering
  const cachedPreview = getRealtimeSignaturePreview(
    trimmed,
    trimmed.includes('owner_') ? 'owner' : 'tenant'
  );
  if (cachedPreview && cachedPreview.startsWith('data:image/')) {
    return cachedPreview;
  }

  if (trimmed.startsWith('/api/signatures/')) return trimmed;

  let normalizedPath = trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    // If it is already a signed URL with a token, return it directly
    if (trimmed.includes('/storage/v1/object/sign/') && trimmed.includes('token=')) {
      return trimmed;
    }
    // Extract bucket/path if it is a Supabase storage URL on a private bucket
    const match = trimmed.match(/\/storage\/v1\/object\/(?:public|sign)\/(tenant-documents|payment-proof|contracts|signatures|maintenance)\/([^?]+)/);
    if (!match) return trimmed;
    normalizedPath = `${match[1]}/${decodeURIComponent(match[2])}`;
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    const token = sessionData?.session?.access_token;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const params = new URLSearchParams({ path: normalizedPath, expiresIn: '3600' });
    if (orderId) params.set('order_id', orderId);

    const res = await fetch(`/api/storage/signed-url?${params.toString()}`, {
      method: 'GET',
      headers,
      credentials: 'include'
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.signedUrl) {
        realtimeSigMemoryCache.set(trimmed, json.signedUrl);
        realtimeSigMemoryCache.set(normalizedPath, json.signedUrl);
        return json.signedUrl;
      }
    }
  } catch (err) {
    console.warn('[StorageUploader] Failed resolving short-lived signed URL:', err);
  }
  if (cachedPreview) return cachedPreview;
  return `/api/storage/signed-url?path=${encodeURIComponent(normalizedPath)}&redirect=1${orderId ? `&order_id=${encodeURIComponent(orderId)}` : ''}`;
}

/**
 * Specialized Digital Signature Uploader
 * Exports signature canvas directly to transparent PNG and stores in 'signatures' bucket,
 * while caching the exact drawn PNG data URL in real-time for instant rendering in UI & PDF.
 */
export async function uploadSignatureCanvas(
  canvas: HTMLCanvasElement,
  identifier: string = 'sig'
): Promise<string> {
  const instantDataUrl = canvas.toDataURL('image/png');
  const role: 'tenant' | 'owner' = identifier.toLowerCase().includes('owner') ? 'owner' : 'tenant';
  if (instantDataUrl) {
    cacheRealtimeSignaturePreview(instantDataUrl, instantDataUrl, role);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error('Gagal mengekspor tanda tangan dari canvas.'));
          return;
        }

        try {
          const result = await uploadToSupabaseStorage(
            blob,
            'signatures',
            `${role}_${identifier}`,
            { forcePNG: true, maxLongestSide: 800 }
          );
          if (instantDataUrl) {
            if (result.publicUrl) cacheRealtimeSignaturePreview(result.publicUrl, instantDataUrl, role);
            if (result.storagePath) cacheRealtimeSignaturePreview(result.storagePath, instantDataUrl, role);
          } else if (result.signedUrl) {
            if (result.publicUrl) cacheRealtimeSignaturePreview(result.publicUrl, result.signedUrl, role);
            if (result.storagePath) cacheRealtimeSignaturePreview(result.storagePath, result.signedUrl, role);
          }
          resolve(result.publicUrl);
        } catch (err) {
          reject(err);
        }
      },
      'image/png',
      1.0
    );
  });
}
