'use client';

import { useCallback, useEffect } from 'react';
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
import { apiClient } from '@/lib/api-client';
import { useFileStore, selectFilteredFiles, selectBreadcrumbs } from '@/stores/file-store';
import { toast } from '@/stores/app-store';
import { cn, formatBytes, formatRelativeTime, getFileType, generateId } from '@/lib/utils';
import type { FileItem, FileType } from '@/types';
import { useState } from 'react';

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

export default function FilesPage() {
  const queryClient = useQueryClient();
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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

  // Delete file mutation
  const deleteFile = useMutation({
    mutationFn: (id: string) => apiClient.deleteFile(id),
    onSuccess: () => {
      refetch();
      clearSelection();
      toast({ title: 'File deleted', variant: 'success' });
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
      } catch (error) {
        updateUpload(uploadId, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Upload failed'
        });
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

  const filteredFiles = selectFilteredFiles();
  const breadcrumbs = selectBreadcrumbs();
  const uploadsList = Array.from(uploads.values());

  return (
    <div className="space-y-4" {...getRootProps()}>
      <input {...getInputProps()} />

      {/* Drag overlay */}
      {isDragActive && (
        <div className="fixed inset-0 z-50 bg-zentoria-500/10 border-2 border-dashed border-zentoria-500 flex items-center justify-center">
          <div className="text-center">
            <Upload className="h-16 w-16 text-zentoria-500 mx-auto mb-4" />
            <p className="text-lg font-medium">Drop files here to upload</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-1 text-sm">
            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.path} className="flex items-center gap-1">
                {index > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <button
                  onClick={() => navigateTo(crumb.path)}
                  className={cn(
                    'hover:text-foreground transition-colors',
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

        <div className="flex items-center gap-2">
          <SearchInput
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            clearable
            onClear={() => setSearchQuery('')}
            className="w-48"
          />

          <Button variant="outline" size="icon" onClick={() => setShowNewFolder(true)}>
            <FolderPlus className="h-4 w-4" />
          </Button>

          <label className="cursor-pointer">
            <span className="inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 w-9">
              <Upload className="h-4 w-4" />
            </span>
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleUpload(Array.from(e.target.files || []))}
            />
          </label>

          <div className="flex items-center border rounded-lg">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="icon-sm"
              onClick={() => setViewMode('grid')}
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="icon-sm"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Upload progress */}
      {uploadsList.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            {uploadsList.map((upload) => (
              <div key={upload.fileId} className="flex items-center gap-3">
                <ArrowUpFromLine className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium truncate">{upload.name}</span>
                    <Badge
                      variant={
                        upload.status === 'complete' ? 'success' :
                        upload.status === 'error' ? 'error' : 'secondary'
                      }
                    >
                      {upload.status}
                    </Badge>
                  </div>
                  <Progress value={upload.progress} className="h-1" />
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
        <Card>
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-sm">{selectedFiles.size} selected</span>
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
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="skeleton h-32 rounded-lg" />
          ))}
        </div>
      ) : filteredFiles.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FolderOpen className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No files here</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery ? 'No files match your search' : 'Drop files here or click to upload'}
            </p>
            <label className="cursor-pointer">
              <span className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium bg-zentoria-500 text-white hover:bg-zentoria-600 active:bg-zentoria-700 shadow-sm h-10 px-4 py-2 transition-all">
                <Upload className="h-4 w-4" />
                Upload Files
              </span>
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleUpload(Array.from(e.target.files || []))}
              />
            </label>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filteredFiles.map((file) => (
            <FileGridItem
              key={file.id}
              file={file}
              selected={selectedFiles.has(file.id)}
              onClick={() => handleFileClick(file)}
              onSelect={() => toggleFileSelection(file.id)}
              onDelete={() => deleteFile.mutate(file.id)}
            />
          ))}
        </div>
      ) : (
        <Card>
          <div className="divide-y">
            {filteredFiles.map((file) => (
              <FileListItem
                key={file.id}
                file={file}
                selected={selectedFiles.has(file.id)}
                onClick={() => handleFileClick(file)}
                onSelect={() => toggleFileSelection(file.id)}
                onDelete={() => deleteFile.mutate(file.id)}
              />
            ))}
          </div>
        </Card>
      )}

      {/* New folder dialog */}
      <Dialog open={showNewFolder} onOpenChange={setShowNewFolder}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>Enter a name for the new folder</DialogDescription>
          </DialogHeader>
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name"
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
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{previewFile?.name}</DialogTitle>
          </DialogHeader>
          {previewFile && previewUrl && (
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
              <img
                src={previewUrl}
                alt={previewFile.name}
                className="w-full h-full object-contain"
              />
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => window.open(apiClient.getFileDownloadUrl(previewFile!.id), '_blank')}
            >
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
          </DialogFooter>
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
}

function FileGridItem({ file, selected, onClick, onSelect, onDelete }: FileItemProps) {
  const Icon = file.isDirectory ? fileIcons.folder : fileIcons[file.type] || fileIcons.other;

  return (
    <div
      onClick={onClick}
      className={cn(
        'file-card group relative',
        selected && 'border-zentoria-500 bg-zentoria-500/5'
      )}
    >
      {/* Checkbox */}
      <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          className="w-4 h-4 rounded border-gray-300"
        />
      </div>

      {/* Actions */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Icon */}
      <div className="flex items-center justify-center h-20 mb-2">
        <Icon className={cn(
          'h-12 w-12',
          file.isDirectory ? 'text-zentoria-500' : 'text-muted-foreground'
        )} />
      </div>

      {/* Name */}
      <p className="text-sm font-medium truncate text-center">{file.name}</p>
      {!file.isDirectory && (
        <p className="text-xs text-muted-foreground text-center mt-1">
          {formatBytes(file.size)}
        </p>
      )}
    </div>
  );
}

function FileListItem({ file, selected, onClick, onSelect, onDelete }: FileItemProps) {
  const Icon = file.isDirectory ? fileIcons.folder : fileIcons[file.type] || fileIcons.other;

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-4 p-3 hover:bg-light-hover dark:hover:bg-dark-hover cursor-pointer',
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
        className="w-4 h-4 rounded border-gray-300"
      />

      <Icon className={cn(
        'h-8 w-8 shrink-0',
        file.isDirectory ? 'text-zentoria-500' : 'text-muted-foreground'
      )} />

      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{file.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatRelativeTime(file.updatedAt)}
        </p>
      </div>

      {!file.isDirectory && (
        <span className="text-sm text-muted-foreground">{formatBytes(file.size)}</span>
      )}

      <Badge variant="secondary" className="capitalize">
        {file.isDirectory ? 'Folder' : file.type}
      </Badge>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
