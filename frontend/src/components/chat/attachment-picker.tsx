'use client';

import { useRef, useCallback } from 'react';
import {
  Camera,
  Image,
  File,
  FileText,
  Paperclip,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';

interface AttachmentOption {
  id: string;
  icon: React.ElementType;
  label: string;
  accept: string;
  capture?: 'user' | 'environment';
  color: string;
}

const attachmentOptions: AttachmentOption[] = [
  {
    id: 'camera',
    icon: Camera,
    label: 'Camera',
    accept: 'image/*',
    capture: 'environment',
    color: '#f59e0b',
  },
  {
    id: 'gallery',
    icon: Image,
    label: 'Galerij',
    accept: 'image/*,video/*',
    color: '#22c55e',
  },
  {
    id: 'document',
    icon: FileText,
    label: 'Document',
    accept: '.pdf,.doc,.docx,.txt,.md,.csv,.xlsx,.xls',
    color: '#3b82f6',
  },
  {
    id: 'file',
    icon: File,
    label: 'Bestand',
    accept: '*/*',
    color: '#8b5cf6',
  },
];

export interface Attachment {
  id: string;
  file: File;
  preview?: string;
  type: 'image' | 'video' | 'document' | 'other';
}

interface AttachmentPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onAttach: (attachments: Attachment[]) => void;
  maxFiles?: number;
  maxSize?: number; // in bytes
}

export function AttachmentPicker({
  isOpen,
  onClose,
  onAttach,
  maxFiles = 5,
  maxSize = 10 * 1024 * 1024, // 10MB
}: AttachmentPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOptionClick = useCallback((option: AttachmentOption) => {
    haptics.light();
    if (fileInputRef.current) {
      fileInputRef.current.accept = option.accept;
      if (option.capture) {
        fileInputRef.current.capture = option.capture;
      } else {
        fileInputRef.current.removeAttribute('capture');
      }
      fileInputRef.current.click();
    }
  }, []);

  const getFileType = (file: File): Attachment['type'] => {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    if (
      file.type === 'application/pdf' ||
      file.type.includes('document') ||
      file.type.includes('text/')
    ) {
      return 'document';
    }
    return 'other';
  };

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      // Limit number of files
      const selectedFiles = files.slice(0, maxFiles);

      // Validate file sizes
      const validFiles = selectedFiles.filter((file) => {
        if (file.size > maxSize) {
          haptics.error();
          return false;
        }
        return true;
      });

      if (validFiles.length === 0) {
        onClose();
        return;
      }

      // Create attachments with previews
      const attachments: Attachment[] = await Promise.all(
        validFiles.map(async (file) => {
          const type = getFileType(file);
          let preview: string | undefined;

          // Generate preview for images
          if (type === 'image') {
            preview = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(file);
            });
          }

          return {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            file,
            preview,
            type,
          };
        })
      );

      haptics.success();
      onAttach(attachments);
      onClose();

      // Reset input
      if (e.target) {
        e.target.value = '';
      }
    },
    [maxFiles, maxSize, onAttach, onClose]
  );

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="pb-safe">
        <SheetHeader className="sr-only">
          <SheetTitle>Bijlage toevoegen</SheetTitle>
        </SheetHeader>

        {/* Options grid */}
        <div className="grid grid-cols-4 gap-4 p-4">
          {attachmentOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => handleOptionClick(option)}
              className={cn(
                'flex flex-col items-center gap-2 p-3 rounded-xl',
                'hover:bg-muted/50 active:bg-muted transition-colors',
                'touch-manipulation'
              )}
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${option.color}20` }}
              >
                <option.icon
                  className="h-6 w-6"
                  style={{ color: option.color }}
                />
              </div>
              <span className="text-xs font-medium text-center">
                {option.label}
              </span>
            </button>
          ))}
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={handleFileChange}
        />

        {/* Info text */}
        <p className="text-xs text-muted-foreground text-center pb-4">
          Max {maxFiles} bestanden, max {Math.round(maxSize / 1024 / 1024)}MB per bestand
        </p>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Attachment Preview Component
 * Shows selected attachments with remove option
 */
interface AttachmentPreviewProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
  className?: string;
}

export function AttachmentPreview({
  attachments,
  onRemove,
  className,
}: AttachmentPreviewProps) {
  if (attachments.length === 0) return null;

  const handleRemove = (id: string) => {
    haptics.light();
    onRemove(id);
  };

  return (
    <div className={cn('flex gap-2 overflow-x-auto py-2 px-1', className)}>
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="relative shrink-0 group"
        >
          {attachment.type === 'image' && attachment.preview ? (
            <div className="w-16 h-16 rounded-lg overflow-hidden border">
              <img
                src={attachment.preview}
                alt={attachment.file.name}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-lg border bg-muted flex flex-col items-center justify-center p-1">
              <FileIcon type={attachment.type} />
              <span className="text-[8px] text-muted-foreground truncate w-full text-center mt-1">
                {attachment.file.name.split('.').pop()?.toUpperCase()}
              </span>
            </div>
          )}

          {/* Remove button */}
          <button
            onClick={() => handleRemove(attachment.id)}
            className={cn(
              'absolute -top-1 -right-1 w-5 h-5 rounded-full',
              'bg-destructive text-destructive-foreground',
              'flex items-center justify-center',
              'opacity-0 group-hover:opacity-100 transition-opacity',
              'touch-manipulation'
            )}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

function FileIcon({ type }: { type: Attachment['type'] }) {
  const iconClass = 'h-6 w-6 text-muted-foreground';

  switch (type) {
    case 'image':
      return <Image className={iconClass} />;
    case 'video':
      return <Camera className={iconClass} />;
    case 'document':
      return <FileText className={iconClass} />;
    default:
      return <File className={iconClass} />;
  }
}

/**
 * Attachment Trigger Button
 * Button to open the attachment picker
 */
interface AttachmentButtonProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

export function AttachmentButton({
  onClick,
  disabled,
  className,
}: AttachmentButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => {
        haptics.light();
        onClick();
      }}
      disabled={disabled}
      className={className}
      title="Bijlage toevoegen"
    >
      <Paperclip className="h-5 w-5" />
    </Button>
  );
}
