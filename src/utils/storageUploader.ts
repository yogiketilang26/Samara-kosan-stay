import { supabase, isSupabaseConfigured } from '../lib/supabase';

export interface StorageUploadResult {
  publicUrl: string;
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
 * Convert Blob to Base64 Data URL or direct HTTP fallback
 * Ensures reliable rendering across external HTML Emails and UI previews
 */
export async function uploadToServerOrBase64(blob: Blob, identifier: string = 'sig'): Promise<string> {
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
    if (result.success && result.publicUrl) {
      // If server returned a localhost URL, prefer clean inline Base64 data URL to avoid broken external links
      if (result.publicUrl.includes('localhost:') || result.publicUrl.includes('127.0.0.1')) {
        console.log('[StorageUploader] Server returned localhost URL, using Base64 data URL for reliability:', identifier);
        return base64Data;
      }
      console.log('[StorageUploader] Uploaded to server API:', result.publicUrl);
      return result.publicUrl;
    }
  } catch (err) {
    console.warn('[StorageUploader] Server endpoint upload failed, using Base64 data URL fallback:', err);
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

  // 1. Validation for File size
  if (input instanceof File && input.size > maxFileSizeMB * 1024 * 1024) {
    throw new Error(`Ukuran file melebihi batas maksimal ${maxFileSizeMB}MB.`);
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

  // Generate unique storage path
  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'application/pdf' ? 'pdf' : 'webp';
  const timestamp = Date.now();
  const randomHash = Math.random().toString(36).substring(2, 9);
  const cleanPrefix = pathPrefix ? pathPrefix.replace(/^\/+|\/+$/g, '') + '/' : '';
  const fileName = `${cleanPrefix}${timestamp}_${randomHash}.${ext}`;

  if (!isSupabaseConfigured) {
    console.warn('[StorageUploader] Supabase storage is not configured. Uploading to server API or Base64.');
    const serverUrl = await uploadToServerOrBase64(processedBlob, pathPrefix || 'sig');
    return {
      publicUrl: serverUrl,
      storagePath: fileName,
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
          cacheControl: '3600000'
        });

      if (error) {
        lastError = error;
        const isBucketNotFound = error.message?.toLowerCase().includes('bucket not found') || (error as any).statusCode === '404' || (error as any).status === 404;
        
        if (isBucketNotFound) {
          // Attempt to dynamically create bucket if missing
          let bucketCreated = false;
          try {
            const { error: createErr } = await supabase.storage.createBucket(bucketName, { public: true });
            if (!createErr) {
              bucketCreated = true;
            }
          } catch (createErr) {
            bucketCreated = false;
          }

          if (!bucketCreated) {
            console.info(`[StorageUploader] Supabase storage bucket '${bucketName}' not available. Using Server storage API fallback.`);
            break; // Skip further retries and immediately proceed to server fallback
          }
        } else {
          console.warn(`[StorageUploader] Upload attempt ${attempts} failed:`, error.message);
        }

        if (attempts < maxAttempts) {
          await new Promise((res) => setTimeout(res, 800 * attempts));
          continue;
        }
        throw error;
      }

      // Get public CDN URL
      const { data: publicUrlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(data.path);

      return {
        publicUrl: publicUrlData.publicUrl,
        storagePath: data.path,
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

  // Resilient Fallback: If Supabase Storage bucket does not exist or upload permanently fails,
  // upload to server API or convert to Base64 so signature/room photo never breaks.
  const fallbackUrl = await uploadToServerOrBase64(processedBlob, pathPrefix || 'img');
  return {
    publicUrl: fallbackUrl,
    storagePath: fileName,
    bucket: bucketName,
    width,
    height,
    mimeType,
    size: processedBlob.size
  };
}

/**
 * Specialized Digital Signature Uploader
 * Exports signature canvas directly to transparent PNG and stores in 'signatures' bucket.
 */
export async function uploadSignatureCanvas(
  canvas: HTMLCanvasElement,
  identifier: string = 'sig'
): Promise<string> {
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
            `tenant_${identifier}`,
            { forcePNG: true, maxLongestSide: 800 }
          );
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
