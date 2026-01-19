'use client';

import { useRef, useState, useCallback } from 'react';
import {
  Camera,
  Image,
  Video,
  X,
  RotateCcw,
  Check,
  Loader2,
  SwitchCamera,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';

interface CameraUploadProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  mode?: 'photo' | 'video';
}

export function CameraUpload({
  isOpen,
  onClose,
  onCapture,
  mode = 'photo',
}: CameraUploadProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [isRecording, setIsRecording] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Start camera stream
  const startCamera = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Stop any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: mode === 'video',
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error('Camera error:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Kan camera niet openen. Controleer de toestemming.'
      );
      haptics.error();
    } finally {
      setIsLoading(false);
    }
  }, [facingMode, mode]);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Initialize camera when modal opens
  useState(() => {
    if (isOpen) {
      startCamera();
    }
    return () => stopCamera();
  });

  // Handle close
  const handleClose = () => {
    stopCamera();
    setPreviewImage(null);
    setError(null);
    onClose();
  };

  // Switch camera
  const switchCamera = useCallback(() => {
    haptics.light();
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
    startCamera();
  }, [startCamera]);

  // Take photo
  const takePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    haptics.medium();

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setPreviewImage(dataUrl);
    }
  }, []);

  // Start video recording
  const startRecording = useCallback(() => {
    if (!streamRef.current) return;

    haptics.medium();
    chunksRef.current = [];

    try {
      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType: 'video/webm;codecs=vp9',
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const file = new File([blob], `video-${Date.now()}.webm`, {
          type: 'video/webm',
        });
        onCapture(file);
        handleClose();
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000);
      setIsRecording(true);
    } catch (err) {
      console.error('Recording error:', err);
      haptics.error();
    }
  }, [onCapture, handleClose]);

  // Stop video recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      haptics.medium();
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  // Confirm photo
  const confirmPhoto = useCallback(() => {
    if (!previewImage) return;

    haptics.success();

    // Convert data URL to File
    fetch(previewImage)
      .then((res) => res.blob())
      .then((blob) => {
        const file = new File([blob], `photo-${Date.now()}.jpg`, {
          type: 'image/jpeg',
        });
        onCapture(file);
        handleClose();
      });
  }, [previewImage, onCapture, handleClose]);

  // Retry photo
  const retryPhoto = useCallback(() => {
    haptics.light();
    setPreviewImage(null);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between p-4 pt-safe text-white shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClose}
          className="text-white hover:bg-white/10"
        >
          <X className="h-6 w-6" />
        </Button>

        <span className="font-medium">
          {mode === 'photo' ? 'Foto maken' : 'Video opnemen'}
        </span>

        <Button
          variant="ghost"
          size="icon"
          onClick={switchCamera}
          className="text-white hover:bg-white/10"
          disabled={!!previewImage}
        >
          <SwitchCamera className="h-5 w-5" />
        </Button>
      </header>

      {/* Camera view */}
      <div className="flex-1 relative overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 text-white animate-spin" />
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-4 text-center">
            <Camera className="h-16 w-16 mb-4 opacity-50" />
            <p className="mb-4">{error}</p>
            <Button onClick={startCamera}>Opnieuw proberen</Button>
          </div>
        )}

        {/* Video preview (camera stream) */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn(
            'absolute inset-0 w-full h-full object-cover',
            (previewImage || error) && 'hidden'
          )}
        />

        {/* Photo preview */}
        {previewImage && (
          <img
            src={previewImage}
            alt="Preview"
            className="absolute inset-0 w-full h-full object-contain"
          />
        )}

        {/* Hidden canvas for photo capture */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Recording indicator */}
        {isRecording && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-red-500/80 text-white px-3 py-1.5 rounded-full">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <span className="text-sm font-medium">Opnemen...</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <footer className="p-6 pb-safe flex items-center justify-center gap-8">
        {previewImage ? (
          <>
            <Button
              variant="ghost"
              size="lg"
              onClick={retryPhoto}
              className="text-white hover:bg-white/10 h-14 w-14 rounded-full"
            >
              <RotateCcw className="h-6 w-6" />
            </Button>

            <Button
              size="lg"
              onClick={confirmPhoto}
              className="bg-green-500 hover:bg-green-600 h-16 w-16 rounded-full"
            >
              <Check className="h-8 w-8" />
            </Button>
          </>
        ) : mode === 'photo' ? (
          <button
            onClick={takePhoto}
            disabled={isLoading || !!error}
            className={cn(
              'w-20 h-20 rounded-full border-4 border-white transition-all',
              'bg-white/10 hover:bg-white/20 active:scale-95',
              (isLoading || error) && 'opacity-50 cursor-not-allowed'
            )}
          >
            <span className="sr-only">Foto maken</span>
          </button>
        ) : (
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isLoading || !!error}
            className={cn(
              'w-20 h-20 rounded-full border-4 transition-all',
              isRecording
                ? 'border-red-500 bg-red-500/50'
                : 'border-white bg-white/10 hover:bg-white/20',
              'active:scale-95',
              (isLoading || error) && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isRecording && (
              <span className="block w-8 h-8 mx-auto bg-red-500 rounded" />
            )}
            <span className="sr-only">
              {isRecording ? 'Stop opnemen' : 'Start opnemen'}
            </span>
          </button>
        )}
      </footer>
    </div>
  );
}

/**
 * Quick camera button for file upload areas
 */
interface CameraButtonProps {
  onCapture: (file: File) => void;
  disabled?: boolean;
  className?: string;
}

export function CameraButton({
  onCapture,
  disabled,
  className,
}: CameraButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    haptics.light();
    inputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      haptics.success();
      onCapture(file);
    }
    // Reset input
    if (e.target) {
      e.target.value = '';
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={handleClick}
        disabled={disabled}
        className={className}
        title="Foto maken"
      >
        <Camera className="h-5 w-5" />
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleChange}
      />
    </>
  );
}
