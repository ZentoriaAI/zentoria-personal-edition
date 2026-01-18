'use client';

import { useState, useMemo } from 'react';
import { nanoid } from 'nanoid';
import {
  X,
  Maximize2,
  Minimize2,
  Copy,
  Download,
  Code,
  FileText,
  Image,
  Play,
  Eye,
  Edit3,
  ChevronLeft,
  ChevronRight,
  History,
  RefreshCw,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CodeBlock } from '@/components/ui/code-block';
import { cn, copyToClipboard } from '@/lib/utils';
import {
  useEnhancedChatStore,
  useCanvasState,
  selectCurrentCanvases,
  selectCurrentSessionId,
} from '@/stores/enhanced-chat-store';
import { toast } from '@/stores/app-store';
import type { Canvas, CanvasVersion } from '@/types';

interface CanvasPanelProps {
  className?: string;
}

export function CanvasPanel({ className }: CanvasPanelProps) {
  const { canvasPanelOpen, activeCanvas } = useCanvasState();
  const canvases = useEnhancedChatStore(selectCurrentCanvases);
  const currentSessionId = useEnhancedChatStore(selectCurrentSessionId);
  const { setCanvasPanelOpen, setActiveCanvas, updateCanvas } = useEnhancedChatStore();

  const [isMaximized, setIsMaximized] = useState(false);
  const [viewMode, setViewMode] = useState<'preview' | 'source'>('preview');
  const [showHistory, setShowHistory] = useState(false);

  if (!canvasPanelOpen) return null;

  const handleClose = () => {
    setCanvasPanelOpen(false);
    setActiveCanvas(null);
  };

  const handleCopy = async () => {
    if (activeCanvas) {
      await copyToClipboard(activeCanvas.content);
      toast({ title: 'Copied to clipboard', variant: 'success' });
    }
  };

  const handleDownload = () => {
    if (!activeCanvas) return;

    const extension = getExtension(activeCanvas.type, activeCanvas.language);
    const filename = `${activeCanvas.title.replace(/[^a-z0-9]/gi, '_')}.${extension}`;
    const blob = new Blob([activeCanvas.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const canvasIndex = canvases.findIndex((c) => c.id === activeCanvas?.id);
  const hasPrev = canvasIndex > 0;
  const hasNext = canvasIndex < canvases.length - 1;

  const goToPrev = () => {
    if (hasPrev) {
      setActiveCanvas(canvases[canvasIndex - 1]);
    }
  };

  const goToNext = () => {
    if (hasNext) {
      setActiveCanvas(canvases[canvasIndex + 1]);
    }
  };

  // Handle canvas version restore (BUG-006)
  const handleRestore = (version: CanvasVersion) => {
    if (!activeCanvas || !currentSessionId) return;

    // Save current content as a new version before restoring
    const newVersion: CanvasVersion = {
      id: `ver_${nanoid(10)}`,
      canvasId: activeCanvas.id,
      content: activeCanvas.content,
      createdAt: new Date().toISOString(),
      changeDescription: 'Saved before restore',
    };

    // Update canvas with restored content and add version history
    updateCanvas(currentSessionId, activeCanvas.id, {
      content: version.content,
      versions: [...(activeCanvas.versions || []), newVersion],
    });

    // Update active canvas reference
    setActiveCanvas({
      ...activeCanvas,
      content: version.content,
      versions: [...(activeCanvas.versions || []), newVersion],
    });

    toast({ title: 'Version restored', variant: 'success' });
    setShowHistory(false);
  };

  return (
    <div
      className={cn(
        'flex flex-col bg-light-surface dark:bg-dark-elevated border-l',
        isMaximized ? 'fixed inset-0 z-50' : 'w-[500px] shrink-0',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <CanvasIcon type={activeCanvas?.type} />
          <div className="min-w-0">
            <h3 className="font-medium truncate text-sm">
              {activeCanvas?.title || 'Canvas'}
            </h3>
            {activeCanvas?.language && (
              <Badge variant="secondary" className="text-xs">
                {activeCanvas.language}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Navigation */}
          {canvases.length > 1 && (
            <div className="flex items-center gap-0.5 mr-2">
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={!hasPrev}
                onClick={goToPrev}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                {canvasIndex + 1}/{canvases.length}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={!hasNext}
                onClick={goToNext}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Actions */}
          <Button variant="ghost" size="icon-sm" onClick={handleCopy}>
            <Copy className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={handleDownload}>
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowHistory(!showHistory)}
          >
            <History className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setIsMaximized(!isMaximized)}
          >
            {isMaximized ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={handleClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* View mode tabs */}
      {activeCanvas && (
        <div className="px-4 py-2 border-b">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
            <TabsList className="h-8">
              <TabsTrigger value="preview" className="h-6 text-xs">
                <Eye className="h-3.5 w-3.5 mr-1" />
                Preview
              </TabsTrigger>
              <TabsTrigger value="source" className="h-6 text-xs">
                <Code className="h-3.5 w-3.5 mr-1" />
                Source
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}

      {/* Content */}
      <ScrollArea className="flex-1">
        {activeCanvas ? (
          <div className="p-4">
            {showHistory && activeCanvas.versions?.length ? (
              <VersionHistory
                versions={activeCanvas.versions}
                onRestore={handleRestore}
              />
            ) : viewMode === 'preview' ? (
              <CanvasPreview canvas={activeCanvas} />
            ) : (
              <CanvasSource canvas={activeCanvas} />
            )}
          </div>
        ) : canvases.length > 0 ? (
          <div className="p-4">
            <h4 className="text-sm font-medium mb-3">Available Canvases</h4>
            <div className="space-y-2">
              {canvases.map((canvas) => (
                <button
                  key={canvas.id}
                  onClick={() => setActiveCanvas(canvas)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg bg-light-hover dark:bg-dark-hover hover:bg-zentoria-500/10 transition-colors text-left"
                >
                  <CanvasIcon type={canvas.type} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{canvas.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {canvas.language || canvas.type}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full py-16 text-center">
            <div className="w-12 h-12 rounded-xl bg-zentoria-500/10 flex items-center justify-center mb-4">
              <Code className="h-6 w-6 text-zentoria-500" />
            </div>
            <h4 className="font-medium mb-1">No canvases yet</h4>
            <p className="text-sm text-muted-foreground max-w-[200px]">
              Code, documents, and previews will appear here
            </p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// Canvas icon
function CanvasIcon({ type }: { type?: string }) {
  const iconClass = 'h-5 w-5';
  switch (type) {
    case 'code':
      return <Code className={cn(iconClass, 'text-blue-500')} />;
    case 'document':
      return <FileText className={cn(iconClass, 'text-green-500')} />;
    case 'diagram':
      return <Image className={cn(iconClass, 'text-purple-500')} />;
    case 'preview':
      return <Play className={cn(iconClass, 'text-orange-500')} />;
    default:
      return <Code className={cn(iconClass, 'text-zentoria-500')} />;
  }
}

// Canvas preview
function CanvasPreview({ canvas }: { canvas: Canvas }) {
  if (canvas.type === 'code') {
    return (
      <CodeBlock
        code={canvas.content}
        language={canvas.language || 'plaintext'}
      />
    );
  }

  if (canvas.type === 'document') {
    return (
      <div className="prose-zentoria">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {canvas.content}
        </ReactMarkdown>
      </div>
    );
  }

  if (canvas.type === 'preview') {
    // Render HTML preview in an iframe
    return (
      <iframe
        srcDoc={canvas.content}
        className="w-full h-[500px] border rounded-lg bg-white"
        sandbox="allow-scripts"
        title={canvas.title}
      />
    );
  }

  // Default: show as code
  return (
    <CodeBlock
      code={canvas.content}
      language={canvas.language || 'plaintext'}
    />
  );
}

// Canvas source
function CanvasSource({ canvas }: { canvas: Canvas }) {
  return (
    <pre className="text-sm font-mono whitespace-pre-wrap break-words bg-light-hover dark:bg-dark-hover p-4 rounded-lg">
      {canvas.content}
    </pre>
  );
}

// Version history
interface VersionHistoryProps {
  versions: CanvasVersion[];
  onRestore: (version: CanvasVersion) => void;
}

function VersionHistory({ versions, onRestore }: VersionHistoryProps) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium mb-3">Version History</h4>
      {versions.map((version, index) => (
        <div
          key={version.id}
          className="flex items-start gap-3 p-3 rounded-lg bg-light-hover dark:bg-dark-hover"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              Version {versions.length - index}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(version.createdAt).toLocaleString()}
            </p>
            {version.changeDescription && (
              <p className="text-xs mt-1">{version.changeDescription}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRestore(version)}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Restore
          </Button>
        </div>
      ))}
    </div>
  );
}

// Helper
function getExtension(type?: string, language?: string): string {
  if (language) {
    const langMap: Record<string, string> = {
      javascript: 'js',
      typescript: 'ts',
      python: 'py',
      java: 'java',
      csharp: 'cs',
      cpp: 'cpp',
      rust: 'rs',
      go: 'go',
      ruby: 'rb',
      php: 'php',
      swift: 'swift',
      kotlin: 'kt',
      markdown: 'md',
      html: 'html',
      css: 'css',
      json: 'json',
      yaml: 'yaml',
      sql: 'sql',
      shell: 'sh',
      bash: 'sh',
    };
    return langMap[language.toLowerCase()] || 'txt';
  }

  switch (type) {
    case 'code':
      return 'txt';
    case 'document':
      return 'md';
    case 'preview':
      return 'html';
    default:
      return 'txt';
  }
}
