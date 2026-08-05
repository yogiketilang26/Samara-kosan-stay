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
 * Convert any SVG Data URL or SVG string into a clean PNG Base64 Data URL for email and PDF compatibility
 */
export function ensurePngDataUrl(input: string, defaultWidth = 240, defaultHeight = 90): Promise<string> {
  return new Promise((resolve) => {
    if (!input) {
      resolve(generateOwnerStampPngDataUrl());
      return;
    }
    if (input.startsWith('data:image/png') || input.startsWith('data:image/jpeg') || input.startsWith('data:image/webp')) {
      resolve(input);
      return;
    }
    if (typeof document === 'undefined') {
      resolve(input);
      return;
    }

    // Convert SVG to PNG via offscreen Canvas
    const img = new Image();
    const cleanSvg = input.startsWith('data:') ? input : `data:image/svg+xml;utf8,${encodeURIComponent(input)}`;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = defaultWidth;
      canvas.height = defaultHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, defaultWidth, defaultHeight);
        resolve(canvas.toDataURL('image/png'));
      } else {
        resolve(generateOwnerStampPngDataUrl());
      }
    };
    img.onerror = () => {
      resolve(generateOwnerStampPngDataUrl());
    };
    img.src = cleanSvg;
  });
}
