'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  X,
  Download,
  Share2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  FileText,
  FileCode,
  FileVideo,
  FileAudio,
  File,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, formatBytes, formatRelativeTime } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import type { FileItem, FileType } from '@/types';

interface FilePreviewModalProps {
  file: FileItem | null;
  files?: FileItem[];
  onClose: () => void;
  onDownload?: (file: FileItem) => void;
  onShare?: (file: FileItem) => void;
  getPreviewUrl: (file: FileItem) => string;
}

export function FilePreviewModal({
  file,
  files = [],
  onClose,
  onDownload,
  onShare,
  getPreviewUrl,
}: FilePreviewModalProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const lastTouchDistance = useRef(0);
  const isDragging = useRef(false);
  const lastPosition = useRef({ x: 0, y: 0 });

  // Find current file index in files array
  useEffect(() => {
    if (file && files.length > 0) {
      const index = files.findIndex((f) => f.id === file.id);
      setCurrentIndex(index);
    }
  }, [file, files]);

  // Reset state when file changes
  useEffect(() => {
    setZoom(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
    setIsLoading(true);
    setError(null);
  }, [file]);

  // Keyboard navigation
  useEffect(() => {
    if (!file) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          navigatePrev();
          break;
        case 'ArrowRight':
          navigateNext();
          break;
        case '+':
        case '=':
          handleZoomIn();
          break;
        case '-':
          handleZoomOut();
          break;
        case 'r':
          handleRotate();
          break;
        case 'f':
          toggleFullscreen();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [file, currentIndex, files.length]);

  const handleZoomIn = useCallback(() => {
    haptics.light();
    setZoom((z) => Math.min(z + 0.25, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    haptics.light();
    setZoom((z) => Math.max(z - 0.25, 0.5));
  }, []);

  const handleRotate = useCallback(() => {
    haptics.light();
    setRotation((r) => (r + 90) % 360);
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  }, []);

  const toggleFullscreen = useCallback(() => {
    haptics.medium();
    if (document.fullscreenElement) {
      document.exitFullscreen();
      setIsFullscreen(false);
    } else if (containerRef.current) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    }
  }, []);

  const navigatePrev = useCallback(() => {
    if (currentIndex > 0 && files.length > 0) {
      haptics.light();
      const prevFile = files[currentIndex - 1];
      // This would need to be handled by parent component
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex, files]);

  const navigateNext = useCallback(() => {
    if (currentIndex < files.length - 1 && files.length > 0) {
      haptics.light();
      const nextFile = files[currentIndex + 1];
      // This would need to be handled by parent component
      setCurrentIndex(currentIndex + 1);
    }
  }, [currentIndex, files]);

  // Pinch-to-zoom handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const distance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      lastTouchDistance.current = distance;
    } else if (e.touches.length === 1) {
      isDragging.current = true;
      lastPosition.current = {
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y,
      };
    }
  }, [position]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const distance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );

      if (lastTouchDistance.current > 0) {
        const delta = distance - lastTouchDistance.current;
        const zoomDelta = delta * 0.01;
        setZoom((z) => Math.max(0.5, Math.min(5, z + zoomDelta)));
      }

      lastTouchDistance.current = distance;
    } else if (e.touches.length === 1 && isDragging.current && zoom > 1) {
      setPosition({
        x: e.touches[0].clientX - lastPosition.current.x,
        y: e.touches[0].clientY - lastPosition.current.y,
      });
    }
  }, [zoom]);

  const handleTouchEnd = useCallback(() => {
    lastTouchDistance.current = 0;
    isDragging.current = false;
  }, []);

  // Double tap to zoom
  const lastTapTime = useRef(0);
  const handleTap = useCallback((e: React.TouchEvent) => {
    const now = Date.now();
    if (now - lastTapTime.current < 300) {
      // Double tap
      if (zoom === 1) {
        setZoom(2);
        haptics.medium();
      } else {
        resetView();
        haptics.light();
      }
    }
    lastTapTime.current = now;
  }, [zoom, resetView]);

  if (!file) return null;

  const currentFile = currentIndex >= 0 && files[currentIndex] ? files[currentIndex] : file;
  const previewUrl = getPreviewUrl(currentFile);

  return (
    <div
      ref={containerRef}
      className={cn(
        'fixed inset-0 z-50 bg-black/95 flex flex-col',
        isFullscreen && 'bg-black'
      )}
    >
      {/* Header */}
      <header className="flex items-center justify-between p-4 pt-safe text-white shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-white hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h2 className="font-medium truncate">{currentFile.name}</h2>
            <p className="text-sm text-white/60">
              {formatBytes(currentFile.size)} • {formatRelativeTime(currentFile.updatedAt)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {onShare && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onShare(currentFile)}
              className="text-white hover:bg-white/10"
            >
              <Share2 className="h-5 w-5" />
            </Button>
          )}
          {onDownload && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDownload(currentFile)}
              className="text-white hover:bg-white/10"
            >
              <Download className="h-5 w-5" />
            </Button>
          )}
        </div>
      </header>

      {/* Content */}
      <div
        className="flex-1 relative overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleTap as any}
      >
        {/* Navigation arrows */}
        {files.length > 1 && (
          <>
            {currentIndex > 0 && (
              <button
                onClick={navigatePrev}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}
            {currentIndex < files.length - 1 && (
              <button
                onClick={navigateNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </>
        )}

        {/* Preview content based on file type */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 text-white animate-spin" />
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
            <File className="h-16 w-16 mb-4 opacity-50" />
            <p className="text-lg mb-2">Kan bestand niet weergeven</p>
            <p className="text-sm text-white/60">{error}</p>
          </div>
        )}

        {currentFile.type === 'image' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <img
              ref={imageRef}
              src={previewUrl}
              alt={currentFile.name}
              onLoad={() => setIsLoading(false)}
              onError={() => {
                setIsLoading(false);
                setError('Afbeelding laden mislukt');
              }}
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                transition: isDragging.current ? 'none' : 'transform 0.2s ease-out',
              }}
              className="max-w-full max-h-full object-contain"
              draggable={false}
            />
          </div>
        )}

        {currentFile.type === 'video' && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <video
              src={previewUrl}
              controls
              autoPlay
              onLoadedData={() => setIsLoading(false)}
              onError={() => {
                setIsLoading(false);
                setError('Video laden mislukt');
              }}
              className="max-w-full max-h-full"
            />
          </div>
        )}

        {currentFile.type === 'audio' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
            <FileAudio className="h-24 w-24 text-white/50 mb-8" />
            <audio
              src={previewUrl}
              controls
              autoPlay
              onLoadedData={() => setIsLoading(false)}
              onError={() => {
                setIsLoading(false);
                setError('Audio laden mislukt');
              }}
              className="w-full max-w-md"
            />
          </div>
        )}

        {currentFile.type === 'document' && currentFile.name.endsWith('.pdf') && (
          <iframe
            src={previewUrl}
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setError('PDF laden mislukt');
            }}
            className="absolute inset-0 w-full h-full bg-white"
          />
        )}

        {(currentFile.type === 'document' || currentFile.type === 'code') &&
          !currentFile.name.endsWith('.pdf') && (
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="max-w-2xl w-full bg-white dark:bg-dark-elevated rounded-lg p-4 max-h-[80vh] overflow-auto">
                <pre className="text-sm whitespace-pre-wrap break-words">
                  {/* Text content would be loaded here */}
                  <span className="text-muted-foreground">
                    Tekstweergave niet beschikbaar in preview
                  </span>
                </pre>
              </div>
            </div>
          )}

        {!['image', 'video', 'audio', 'document', 'code'].includes(currentFile.type) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
            <File className="h-24 w-24 mb-4 opacity-50" />
            <p className="text-lg mb-2">{currentFile.name}</p>
            <p className="text-sm text-white/60 mb-4">
              {formatBytes(currentFile.size)} • {currentFile.mimeType}
            </p>
            {onDownload && (
              <Button onClick={() => onDownload(currentFile)}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Footer controls */}
      {currentFile.type === 'image' && (
        <footer className="p-4 pb-safe flex items-center justify-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleZoomOut}
            disabled={zoom <= 0.5}
            className="text-white hover:bg-white/10"
          >
            <ZoomOut className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={resetView}
            className="text-white hover:bg-white/10 min-w-[60px]"
          >
            {Math.round(zoom * 100)}%
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleZoomIn}
            disabled={zoom >= 5}
            className="text-white hover:bg-white/10"
          >
            <ZoomIn className="h-5 w-5" />
          </Button>

          <div className="w-px h-6 bg-white/20 mx-2" />

          <Button
            variant="ghost"
            size="icon"
            onClick={handleRotate}
            className="text-white hover:bg-white/10"
          >
            <RotateCw className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleFullscreen}
            className="text-white hover:bg-white/10"
          >
            {isFullscreen ? (
              <Minimize2 className="h-5 w-5" />
            ) : (
              <Maximize2 className="h-5 w-5" />
            )}
          </Button>
        </footer>
      )}

      {/* File counter */}
      {files.length > 1 && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 text-white/60 text-sm">
          {currentIndex + 1} / {files.length}
        </div>
      )}
    </div>
  );
}

/**
 * Share functionality using Web Share API
 */
export async function shareFile(file: FileItem, downloadUrl: string): Promise<boolean> {
  if (!navigator.share) {
    // Fallback: copy download link
    try {
      await navigator.clipboard.writeText(downloadUrl);
      return true;
    } catch {
      return false;
    }
  }

  try {
    await navigator.share({
      title: file.name,
      text: `Bekijk ${file.name}`,
      url: downloadUrl,
    });
    haptics.success();
    return true;
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      console.error('Share failed:', err);
      haptics.error();
    }
    return false;
  }
}
