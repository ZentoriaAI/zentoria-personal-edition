'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import {
  FolderOpen,
  File,
  Image,
  FileVideo,
  FileAudio,
  FileText,
  FileCode,
  Archive,
  Grid,
  List,
  Upload,
  Trash2,
  Download,
  MoreVertical,
  ChevronRight,
  Home,
  FolderPlus,
  Search,
  X,
  ArrowUpFromLine,
  SortAsc,
  SortDesc,
  Eye,
  Edit2,
  Copy,
  Info,
  ArrowDownAZ,
  ArrowUpAZ,
  Calendar,
  HardDrive,
  FileType,
  CheckCircle2,
  FolderInput,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, SearchInput } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ContextMenu, ContextMenuItem, ContextMenuSeparator, ContextMenuLabel } from '@/components/ui/context-menu';
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { Tooltip, FileInfoTooltip } from '@/components/ui/tooltip';
import { apiClient } from '@/lib/api-client';
import { useFileStore, selectFilteredFiles, selectBreadcrumbs } from '@/stores/file-store';
import { toast } from '@/stores/app-store';
import { cn, formatBytes, formatRelativeTime, getFileType, generateId } from '@/lib/utils';
import type { FileItem, FileType } from '@/types';

const fileIcons: Record<FileType | 'folder', React.ElementType> = {
  folder: FolderOpen,
  image: Image,
  video: FileVideo,
  audio: FileAudio,
  document: FileText,
  code: FileCode,
  archive: Archive,
  other: File,
};

const sortOptions = [
  { value: 'name', label: 'Name', icon: ArrowDownAZ },
  { value: 'date', label: 'Date modified', icon: Calendar },
  { value: 'size', label: 'Size', icon: HardDrive },
  { value: 'type', label: 'Type', icon: FileType },
] as const;

export default function FilesPage() {
  const queryClient = useQueryClient();
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameTarget, setRenameTarget] = useState<FileItem | null>(null);
  const [renameName, setRenameName] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    currentPath,
    setCurrentPath,
    setFiles,
    viewMode,
    setViewMode,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    searchQuery,
    setSearchQuery,
    selectedFiles,
    toggleFileSelection,
    selectAll,
    clearSelection,
    uploads,
    addUpload,
    updateUpload,
    removeUpload,
    previewFile,
    setPreviewFile,
    navigateUp,
    navigateTo,
  } = useFileStore();

  // Fetch files
  const { data: filesData, isLoading, refetch } = useQuery({
    queryKey: ['files', currentPath],
    queryFn: () => apiClient.listFiles(currentPath),
  });

  // Update store when data changes
  useEffect(() => {
    if (filesData?.items) {
      setFiles(filesData.items);
    }
  }, [filesData, setFiles]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Ctrl+A - Select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        selectAll();
        toast({ title: 'All files selected', variant: 'info' });
      }

      // Delete - Delete selected files
      if (e.key === 'Delete' && selectedFiles.size > 0) {
        e.preventDefault();
        selectedFiles.forEach((id) => deleteFile.mutate(id));
      }

      // Escape - Clear selection
      if (e.key === 'Escape') {
        if (selectedFiles.size > 0) {
          clearSelection();
        } else if (previewFile) {
          setPreviewFile(null);
        }
      }

      // Backspace - Go up one level
      if (e.key === 'Backspace' && currentPath !== '/') {
        e.preventDefault();
        navigateUp();
      }

      // F5 / Ctrl+R - Refresh
      if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key === 'r')) {
        e.preventDefault();
        refetch();
        toast({ title: 'Files refreshed', variant: 'info' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectAll, clearSelection, selectedFiles, previewFile, setPreviewFile, currentPath, navigateUp, refetch]);

  // Create folder mutation
  const createFolder = useMutation({
    mutationFn: ({ path, name }: { path: string; name: string }) =>
      apiClient.createFolder(path, name),
    onSuccess: () => {
      setShowNewFolder(false);
      setNewFolderName('');
      refetch();
      toast({ title: 'Folder created', variant: 'success' });
    },
    onError: (error) => {
      toast({ title: 'Failed to create folder', description: error.message, variant: 'error' });
    },
  });

  // Rename mutation
  const renameFile = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiClient.renameFile(id, name),
    onSuccess: () => {
      setShowRenameDialog(false);
      setRenameTarget(null);
      setRenameName('');
      refetch();
      toast({ title: 'Renamed successfully', variant: 'success' });
    },
    onError: (error) => {
      toast({ title: 'Failed to rename', description: error.message, variant: 'error' });
    },
  });

  // Delete file mutation
  const deleteFile = useMutation({
    mutationFn: (id: string) => apiClient.deleteFile(id),
    onSuccess: () => {
      refetch();
      clearSelection();
      toast({ title: 'File deleted', variant: 'success' });
    },
    onError: (error) => {
      toast({ title: 'Failed to delete', description: error.message, variant: 'error' });
    },
  });

  // Upload handler
  const handleUpload = useCallback(async (acceptedFiles: globalThis.File[]) => {
    for (const file of acceptedFiles) {
      const uploadId = generateId('upload');
      addUpload({
        fileId: uploadId,
        name: file.name,
        progress: 0,
        status: 'uploading',
      });

      try {
        await apiClient.uploadFile(file, currentPath, (progress) => {
          updateUpload(uploadId, { progress });
        });
        updateUpload(uploadId, { status: 'complete', progress: 100 });
        setTimeout(() => removeUpload(uploadId), 2000);
        refetch();
        toast({ title: `Uploaded ${file.name}`, variant: 'success' });
      } catch (error) {
        updateUpload(uploadId, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Upload failed'
        });
        toast({ title: 'Upload failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'error' });
      }
    }
  }, [currentPath, addUpload, updateUpload, removeUpload, refetch]);

  // Dropzone setup
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleUpload,
    noClick: true,
  });

  // Handle file click
  const handleFileClick = (file: FileItem) => {
    if (file.isDirectory) {
      navigateTo(`${currentPath === '/' ? '' : currentPath}/${file.name}`);
    } else if (file.type === 'image') {
      setPreviewFile(file);
      setPreviewUrl(apiClient.getFileThumbnailUrl(file.id));
    } else {
      // Download file
      window.open(apiClient.getFileDownloadUrl(file.id), '_blank');
    }
  };

  // Handle rename
  const handleRename = (file: FileItem) => {
    setRenameTarget(file);
    setRenameName(file.name);
    setShowRenameDialog(true);
  };

  // Handle copy path
  const handleCopyPath = async (file: FileItem) => {
    const path = `${currentPath === '/' ? '' : currentPath}/${file.name}`;
    await navigator.clipboard.writeText(path);
    toast({ title: 'Path copied to clipboard', variant: 'info' });
  };

  // Toggle sort order or change sort field
  const handleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const filteredFiles = selectFilteredFiles();
  const breadcrumbs = selectBreadcrumbs();
  const uploadsList = Array.from(uploads.values());
  const currentSortOption = sortOptions.find(opt => opt.value === sortBy);

  return (
    <div className="space-y-4" ref={containerRef} {...getRootProps()}>
      <input {...getInputProps()} />

      {/* Drag overlay */}
      {isDragActive && (
        <div className="fixed inset-0 z-50 bg-zentoria-500/10 border-2 border-dashed border-zentoria-500 flex items-center justify-center backdrop-blur-sm transition-all">
          <div className="text-center animate-bounce">
            <div className="bg-zentoria-500/20 rounded-full p-6 mb-4 inline-block">
              <Upload className="h-16 w-16 text-zentoria-500" />
            </div>
            <p className="text-lg font-medium">Drop files here to upload</p>
            <p className="text-sm text-muted-foreground mt-1">Release to start uploading</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-1 text-sm overflow-x-auto scrollbar-hide">
            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.path} className="flex items-center gap-1 shrink-0">
                {index > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <button
                  onClick={() => navigateTo(crumb.path)}
                  className={cn(
                    'hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-light-hover dark:hover:bg-dark-hover',
                    index === breadcrumbs.length - 1
                      ? 'text-foreground font-medium'
                      : 'text-muted-foreground'
                  )}
                >
                  {index === 0 ? <Home className="h-4 w-4" /> : crumb.name}
                </button>
              </div>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <SearchInput
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            clearable
            onClear={() => setSearchQuery('')}
            className="w-40 sm:w-48"
          />

          {/* Sort dropdown */}
          <DropdownMenu
            trigger={
              <Button variant="outline" size="sm" className="gap-1.5">
                {currentSortOption && <currentSortOption.icon className="h-4 w-4" />}
                <span className="hidden sm:inline">{currentSortOption?.label}</span>
                {sortOrder === 'asc' ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />}
              </Button>
            }
          >
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            {sortOptions.map((option) => (
              <DropdownMenuItem
                key={option.value}
                selected={sortBy === option.value}
                onClick={() => handleSort(option.value)}
                icon={<option.icon className="h-4 w-4" />}
              >
                {option.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              icon={sortOrder === 'asc' ? <SortDesc className="h-4 w-4" /> : <SortAsc className="h-4 w-4" />}
            >
              {sortOrder === 'asc' ? 'Descending' : 'Ascending'}
            </DropdownMenuItem>
          </DropdownMenu>

          <Tooltip content="New folder">
            <Button variant="outline" size="icon" onClick={() => setShowNewFolder(true)}>
              <FolderPlus className="h-4 w-4" />
            </Button>
          </Tooltip>

          <Tooltip content="Upload files">
            <label className="cursor-pointer">
              <span className="inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 w-9 transition-colors">
                <Upload className="h-4 w-4" />
              </span>
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleUpload(Array.from(e.target.files || []))}
              />
            </label>
          </Tooltip>

          <Tooltip content="Refresh">
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </Tooltip>

          <div className="flex items-center border rounded-lg">
            <Tooltip content="Grid view">
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="icon-sm"
                onClick={() => setViewMode('grid')}
              >
                <Grid className="h-4 w-4" />
              </Button>
            </Tooltip>
            <Tooltip content="List view">
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="icon-sm"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Upload progress */}
      {uploadsList.length > 0 && (
        <Card className="animate-in slide-in-from-top-2">
          <CardContent className="p-4 space-y-3">
            {uploadsList.map((upload) => (
              <div key={upload.fileId} className="flex items-center gap-3">
                <div className={cn(
                  "p-2 rounded-lg",
                  upload.status === 'complete' ? 'bg-green-500/10' :
                  upload.status === 'error' ? 'bg-red-500/10' : 'bg-zentoria-500/10'
                )}>
                  {upload.status === 'complete' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : upload.status === 'error' ? (
                    <X className="h-4 w-4 text-red-500" />
                  ) : (
                    <ArrowUpFromLine className="h-4 w-4 text-zentoria-500 animate-pulse" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium truncate">{upload.name}</span>
                    <Badge
                      variant={
                        upload.status === 'complete' ? 'success' :
                        upload.status === 'error' ? 'error' : 'secondary'
                      }
                      className="shrink-0 ml-2"
                    >
                      {upload.status === 'uploading' ? `${upload.progress}%` : upload.status}
                    </Badge>
                  </div>
                  <Progress value={upload.progress} className="h-1" />
                  {upload.error && (
                    <p className="text-xs text-red-500 mt-1">{upload.error}</p>
                  )}
                </div>
                {upload.status === 'error' && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeUpload(upload.fileId)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Selection actions */}
      {selectedFiles.size > 0 && (
        <Card className="sticky top-0 z-10 border-zentoria-500/50 bg-zentoria-500/5 animate-in slide-in-from-top-2">
          <CardContent className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{selectedFiles.size} selected</span>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                (Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Delete</kbd> to remove, <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Esc</kbd> to clear)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                Clear
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  selectedFiles.forEach((id) => deleteFile.mutate(id));
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Files grid/list */}
      {isLoading ? (
        <div className={cn(
          "gap-4",
          viewMode === 'grid'
            ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
            : "space-y-2"
        )}>
          {[...Array(10)].map((_, i) => (
            <div key={i} className={cn(
              "skeleton",
              viewMode === 'grid' ? "h-32 rounded-lg" : "h-14 rounded-lg"
            )} />
          ))}
        </div>
      ) : filteredFiles.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <div className="relative inline-block mb-6">
              <div className="absolute inset-0 bg-zentoria-500/20 rounded-full blur-2xl" />
              <div className="relative bg-light-surface dark:bg-dark-elevated p-6 rounded-2xl border">
                <FolderOpen className="h-16 w-16 text-zentoria-500" />
              </div>
            </div>
            <h3 className="text-xl font-semibold mb-2">
              {searchQuery ? 'No files found' : 'This folder is empty'}
            </h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              {searchQuery
                ? `No files match "${searchQuery}". Try a different search term.`
                : 'Drop files here to upload them, or use the buttons above to add content.'
              }
            </p>
            <div className="flex items-center justify-center gap-3">
              {searchQuery ? (
                <Button variant="outline" onClick={() => setSearchQuery('')}>
                  <X className="h-4 w-4 mr-2" />
                  Clear search
                </Button>
              ) : (
                <>
                  <label className="cursor-pointer">
                    <Button asChild>
                      <span>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Files
                      </span>
                    </Button>
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => handleUpload(Array.from(e.target.files || []))}
                    />
                  </label>
                  <Button variant="outline" onClick={() => setShowNewFolder(true)}>
                    <FolderPlus className="h-4 w-4 mr-2" />
                    New Folder
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filteredFiles.map((file) => (
            <FileGridItem
              key={file.id}
              file={file}
              selected={selectedFiles.has(file.id)}
              onClick={() => handleFileClick(file)}
              onSelect={() => toggleFileSelection(file.id)}
              onDelete={() => deleteFile.mutate(file.id)}
              onRename={() => handleRename(file)}
              onCopyPath={() => handleCopyPath(file)}
              onDownload={() => window.open(apiClient.getFileDownloadUrl(file.id), '_blank')}
            />
          ))}
        </div>
      ) : (
        <Card>
          {/* List header */}
          <div className="flex items-center gap-4 px-4 py-2 border-b text-xs font-medium text-muted-foreground bg-muted/30">
            <div className="w-6" />
            <div className="w-8" />
            <div
              className="flex-1 cursor-pointer hover:text-foreground transition-colors flex items-center gap-1"
              onClick={() => handleSort('name')}
            >
              Name
              {sortBy === 'name' && (sortOrder === 'asc' ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
            </div>
            <div
              className="w-24 text-right cursor-pointer hover:text-foreground transition-colors hidden sm:flex items-center justify-end gap-1"
              onClick={() => handleSort('date')}
            >
              Modified
              {sortBy === 'date' && (sortOrder === 'asc' ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
            </div>
            <div
              className="w-20 text-right cursor-pointer hover:text-foreground transition-colors hidden sm:flex items-center justify-end gap-1"
              onClick={() => handleSort('size')}
            >
              Size
              {sortBy === 'size' && (sortOrder === 'asc' ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
            </div>
            <div className="w-20 hidden md:block">Type</div>
            <div className="w-10" />
          </div>
          <div className="divide-y">
            {filteredFiles.map((file) => (
              <FileListItem
                key={file.id}
                file={file}
                selected={selectedFiles.has(file.id)}
                onClick={() => handleFileClick(file)}
                onSelect={() => toggleFileSelection(file.id)}
                onDelete={() => deleteFile.mutate(file.id)}
                onRename={() => handleRename(file)}
                onCopyPath={() => handleCopyPath(file)}
                onDownload={() => window.open(apiClient.getFileDownloadUrl(file.id), '_blank')}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Keyboard shortcuts hint */}
      <div className="hidden lg:flex items-center justify-center gap-4 text-xs text-muted-foreground py-2">
        <span><kbd className="px-1.5 py-0.5 bg-muted rounded">Ctrl+A</kbd> Select all</span>
        <span><kbd className="px-1.5 py-0.5 bg-muted rounded">Delete</kbd> Delete selected</span>
        <span><kbd className="px-1.5 py-0.5 bg-muted rounded">Backspace</kbd> Go up</span>
        <span><kbd className="px-1.5 py-0.5 bg-muted rounded">F5</kbd> Refresh</span>
      </div>

      {/* New folder dialog */}
      <Dialog open={showNewFolder} onOpenChange={setShowNewFolder}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="h-5 w-5 text-zentoria-500" />
              Create New Folder
            </DialogTitle>
            <DialogDescription>Enter a name for the new folder</DialogDescription>
          </DialogHeader>
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newFolderName.trim()) {
                createFolder.mutate({ path: currentPath, name: newFolderName.trim() });
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewFolder(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createFolder.mutate({ path: currentPath, name: newFolderName.trim() })}
              disabled={!newFolderName.trim() || createFolder.isPending}
              loading={createFolder.isPending}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5 text-zentoria-500" />
              Rename {renameTarget?.isDirectory ? 'Folder' : 'File'}
            </DialogTitle>
            <DialogDescription>
              Enter a new name for "{renameTarget?.name}"
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            placeholder="New name"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && renameName.trim() && renameTarget) {
                renameFile.mutate({ id: renameTarget.id, name: renameName.trim() });
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenameDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => renameTarget && renameFile.mutate({ id: renameTarget.id, name: renameName.trim() })}
              disabled={!renameName.trim() || renameFile.isPending}
              loading={renameFile.isPending}
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Image className="h-5 w-5 text-zentoria-500" />
              {previewFile?.name}
            </DialogTitle>
          </DialogHeader>
          {previewFile && previewUrl && (
            <div className="relative aspect-video bg-black/50 rounded-lg overflow-hidden">
              <img
                src={previewUrl}
                alt={previewFile.name}
                className="w-full h-full object-contain"
              />
            </div>
          )}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-4">
              <span>{previewFile && formatBytes(previewFile.size)}</span>
              <span>{previewFile && formatRelativeTime(previewFile.updatedAt)}</span>
            </div>
            <Button
              onClick={() => window.open(apiClient.getFileDownloadUrl(previewFile!.id), '_blank')}
            >
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Grid item component
interface FileItemProps {
  file: FileItem;
  selected: boolean;
  onClick: () => void;
  onSelect: () => void;
  onDelete: () => void;
  onRename: () => void;
  onCopyPath: () => void;
  onDownload: () => void;
}

function FileGridItem({ file, selected, onClick, onSelect, onDelete, onRename, onCopyPath, onDownload }: FileItemProps) {
  const Icon = file.isDirectory ? fileIcons.folder : fileIcons[file.type] || fileIcons.other;

  const contextMenu = (
    <>
      <ContextMenuLabel>{file.name}</ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={onClick} icon={file.isDirectory ? <FolderInput className="h-4 w-4" /> : <Eye className="h-4 w-4" />}>
        {file.isDirectory ? 'Open folder' : 'Preview'}
      </ContextMenuItem>
      {!file.isDirectory && (
        <ContextMenuItem onClick={onDownload} icon={<Download className="h-4 w-4" />}>
          Download
        </ContextMenuItem>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem onClick={onRename} icon={<Edit2 className="h-4 w-4" />} shortcut="F2">
        Rename
      </ContextMenuItem>
      <ContextMenuItem onClick={onCopyPath} icon={<Copy className="h-4 w-4" />}>
        Copy path
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={onDelete} icon={<Trash2 className="h-4 w-4" />} destructive shortcut="Del">
        Delete
      </ContextMenuItem>
    </>
  );

  return (
    <ContextMenu menu={contextMenu}>
      <div
        onClick={onClick}
        className={cn(
          'file-card group relative select-none touch-manipulation',
          'transition-all duration-200',
          selected && 'border-zentoria-500 bg-zentoria-500/5 shadow-md ring-1 ring-zentoria-500/30'
        )}
      >
        {/* Checkbox */}
        <div className={cn(
          "absolute top-2 left-2 transition-opacity",
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}>
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 rounded border-gray-300 text-zentoria-500 focus:ring-zentoria-500 cursor-pointer"
          />
        </div>

        {/* Actions */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={(e) => e.stopPropagation()}
                className="h-7 w-7"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            }
          >
            <DropdownMenuItem onClick={onRename} icon={<Edit2 className="h-4 w-4" />}>
              Rename
            </DropdownMenuItem>
            {!file.isDirectory && (
              <DropdownMenuItem onClick={onDownload} icon={<Download className="h-4 w-4" />}>
                Download
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onCopyPath} icon={<Copy className="h-4 w-4" />}>
              Copy path
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => {
                onDelete();
              }}
              icon={<Trash2 className="h-4 w-4 text-red-500" />}
            >
              <span className="text-red-500">Delete</span>
            </DropdownMenuItem>
          </DropdownMenu>
        </div>

        {/* Icon */}
        <div className="flex items-center justify-center h-16 sm:h-20 mb-2">
          <Icon className={cn(
            'h-10 w-10 sm:h-12 sm:w-12 transition-transform group-hover:scale-110',
            file.isDirectory ? 'text-zentoria-500' : 'text-muted-foreground'
          )} />
        </div>

        {/* Name */}
        <p className="text-xs sm:text-sm font-medium truncate text-center px-1">{file.name}</p>
        {!file.isDirectory && (
          <p className="text-[10px] sm:text-xs text-muted-foreground text-center mt-0.5">
            {formatBytes(file.size)}
          </p>
        )}
      </div>
    </ContextMenu>
  );
}

function FileListItem({ file, selected, onClick, onSelect, onDelete, onRename, onCopyPath, onDownload }: FileItemProps) {
  const Icon = file.isDirectory ? fileIcons.folder : fileIcons[file.type] || fileIcons.other;

  const contextMenu = (
    <>
      <ContextMenuLabel>{file.name}</ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={onClick} icon={file.isDirectory ? <FolderInput className="h-4 w-4" /> : <Eye className="h-4 w-4" />}>
        {file.isDirectory ? 'Open folder' : 'Preview'}
      </ContextMenuItem>
      {!file.isDirectory && (
        <ContextMenuItem onClick={onDownload} icon={<Download className="h-4 w-4" />}>
          Download
        </ContextMenuItem>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem onClick={onRename} icon={<Edit2 className="h-4 w-4" />} shortcut="F2">
        Rename
      </ContextMenuItem>
      <ContextMenuItem onClick={onCopyPath} icon={<Copy className="h-4 w-4" />}>
        Copy path
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={onDelete} icon={<Trash2 className="h-4 w-4" />} destructive shortcut="Del">
        Delete
      </ContextMenuItem>
    </>
  );

  return (
    <ContextMenu menu={contextMenu}>
      <div
        onClick={onClick}
        className={cn(
          'flex items-center gap-4 px-4 py-3 cursor-pointer select-none touch-manipulation',
          'hover:bg-light-hover dark:hover:bg-dark-hover transition-colors',
          selected && 'bg-zentoria-500/5'
        )}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 rounded border-gray-300 text-zentoria-500 focus:ring-zentoria-500 cursor-pointer"
        />

        <Icon className={cn(
          'h-6 w-6 sm:h-8 sm:w-8 shrink-0 transition-transform hover:scale-110',
          file.isDirectory ? 'text-zentoria-500' : 'text-muted-foreground'
        )} />

        <div className="flex-1 min-w-0">
          <p className="font-medium truncate text-sm sm:text-base">{file.name}</p>
          <p className="text-xs text-muted-foreground sm:hidden">
            {formatRelativeTime(file.updatedAt)} • {!file.isDirectory && formatBytes(file.size)}
          </p>
        </div>

        <span className="text-xs sm:text-sm text-muted-foreground hidden sm:block w-24 text-right shrink-0">
          {formatRelativeTime(file.updatedAt)}
        </span>

        {!file.isDirectory && (
          <span className="text-xs sm:text-sm text-muted-foreground hidden sm:block w-20 text-right shrink-0">
            {formatBytes(file.size)}
          </span>
        )}

        <Badge variant="secondary" className="capitalize text-[10px] sm:text-xs hidden md:inline-flex w-20 justify-center shrink-0">
          {file.isDirectory ? 'Folder' : file.type}
        </Badge>

        <DropdownMenu
          trigger={
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(e) => e.stopPropagation()}
              className="h-8 w-8 shrink-0"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          }
        >
          <DropdownMenuItem onClick={onRename} icon={<Edit2 className="h-4 w-4" />}>
            Rename
          </DropdownMenuItem>
          {!file.isDirectory && (
            <DropdownMenuItem onClick={onDownload} icon={<Download className="h-4 w-4" />}>
              Download
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onCopyPath} icon={<Copy className="h-4 w-4" />}>
            Copy path
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onDelete}
            icon={<Trash2 className="h-4 w-4 text-red-500" />}
          >
            <span className="text-red-500">Delete</span>
          </DropdownMenuItem>
        </DropdownMenu>
      </div>
    </ContextMenu>
  );
}
