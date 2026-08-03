import React, { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon, ImageOff } from 'lucide-react';

interface HDImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  alt: string;
  className?: string;
  aspectRatio?: string;
  fallbackSrc?: string;
  priority?: boolean;
}

export const HDImage: React.FC<HDImageProps> = ({
  src,
  alt,
  className = '',
  aspectRatio,
  fallbackSrc = 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80',
  priority = false,
  id,
  onClick,
  ...restProps
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Default fallback if src is completely empty
  const activeSrc = src && src.trim() !== '' ? src : fallbackSrc;

  // Intersection Observer for Lazy Loading
  useEffect(() => {
    if (priority || isInView) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '100px 0px', threshold: 0.01 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [priority, isInView]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden bg-slate-100 ${className}`}
      style={aspectRatio ? { aspectRatio } : undefined}
      id={id ? `img-container-${id}` : undefined}
    >
      {/* Skeleton / Blur Loading Placeholder */}
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-200/80 animate-pulse z-10">
          <ImageIcon className="text-slate-400 w-6 h-6 opacity-60" />
        </div>
      )}

      {/* Error Fallback Indicator */}
      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 text-slate-400 z-10 p-2 text-center">
          <ImageOff className="w-5 h-5 mb-1 text-slate-400" />
          <span className="text-[10px] font-mono">Gambar tidak dapat dimuat</span>
        </div>
      )}

      {/* Actual Image Element with HD display */}
      {isInView && (
        <img
          id={id}
          src={hasError ? fallbackSrc : activeSrc}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setIsLoaded(true)}
          onError={() => {
            if (!hasError) {
              setHasError(true);
              setIsLoaded(true);
            }
          }}
          onClick={onClick}
          className={`w-full h-full object-cover transition-all duration-300 ${
            isLoaded ? 'opacity-100 scale-100 blur-0' : 'opacity-0 scale-105 blur-sm'
          }`}
          {...restProps}
        />
      )}
    </div>
  );
};
