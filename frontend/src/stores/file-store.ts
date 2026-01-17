import { create } from 'zustand';
import type { FileItem, FileUploadProgress } from '@/types';

// ============================
// File Store
// ============================

interface FileState {
  // Current path and files
  currentPath: string;
  files: FileItem[];
  selectedFiles: Set<string>;

  // Upload state
  uploads: Map<string, FileUploadProgress>;

  // View state
  viewMode: 'grid' | 'list';
  sortBy: 'name' | 'date' | 'size' | 'type';
  sortOrder: 'asc' | 'desc';
  searchQuery: string;

  // Preview
  previewFile: FileItem | null;

  // Actions
  setCurrentPath: (path: string) => void;
  setFiles: (files: FileItem[]) => void;
  addFile: (file: FileItem) => void;
  updateFile: (id: string, updates: Partial<FileItem>) => void;
  removeFile: (id: string) => void;

  selectFile: (id: string) => void;
  deselectFile: (id: string) => void;
  toggleFileSelection: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;

  addUpload: (upload: FileUploadProgress) => void;
  updateUpload: (fileId: string, updates: Partial<FileUploadProgress>) => void;
  removeUpload: (fileId: string) => void;
  clearUploads: () => void;

  setViewMode: (mode: 'grid' | 'list') => void;
  setSortBy: (sortBy: 'name' | 'date' | 'size' | 'type') => void;
  setSortOrder: (order: 'asc' | 'desc') => void;
  setSearchQuery: (query: string) => void;

  setPreviewFile: (file: FileItem | null) => void;

  // Navigation
  navigateUp: () => void;
  navigateTo: (path: string) => void;
}

export const useFileStore = create<FileState>((set, get) => ({
  currentPath: '/',
  files: [],
  selectedFiles: new Set(),
  uploads: new Map(),
  viewMode: 'grid',
  sortBy: 'name',
  sortOrder: 'asc',
  searchQuery: '',
  previewFile: null,

  setCurrentPath: (path) => set({ currentPath: path, selectedFiles: new Set() }),

  setFiles: (files) => set({ files }),

  addFile: (file) =>
    set((state) => ({
      files: [...state.files, file],
    })),

  updateFile: (id, updates) =>
    set((state) => ({
      files: state.files.map((f) => (f.id === id ? { ...f, ...updates } : f)),
    })),

  removeFile: (id) =>
    set((state) => {
      const newSelected = new Set(state.selectedFiles);
      newSelected.delete(id);
      return {
        files: state.files.filter((f) => f.id !== id),
        selectedFiles: newSelected,
      };
    }),

  selectFile: (id) =>
    set((state) => {
      const newSelected = new Set(state.selectedFiles);
      newSelected.add(id);
      return { selectedFiles: newSelected };
    }),

  deselectFile: (id) =>
    set((state) => {
      const newSelected = new Set(state.selectedFiles);
      newSelected.delete(id);
      return { selectedFiles: newSelected };
    }),

  toggleFileSelection: (id) =>
    set((state) => {
      const newSelected = new Set(state.selectedFiles);
      if (newSelected.has(id)) {
        newSelected.delete(id);
      } else {
        newSelected.add(id);
      }
      return { selectedFiles: newSelected };
    }),

  selectAll: () =>
    set((state) => ({
      selectedFiles: new Set(state.files.map((f) => f.id)),
    })),

  clearSelection: () => set({ selectedFiles: new Set() }),

  addUpload: (upload) =>
    set((state) => {
      const newUploads = new Map(state.uploads);
      newUploads.set(upload.fileId, upload);
      return { uploads: newUploads };
    }),

  updateUpload: (fileId, updates) =>
    set((state) => {
      const newUploads = new Map(state.uploads);
      const existing = newUploads.get(fileId);
      if (existing) {
        newUploads.set(fileId, { ...existing, ...updates });
      }
      return { uploads: newUploads };
    }),

  removeUpload: (fileId) =>
    set((state) => {
      const newUploads = new Map(state.uploads);
      newUploads.delete(fileId);
      return { uploads: newUploads };
    }),

  clearUploads: () => set({ uploads: new Map() }),

  setViewMode: (viewMode) => set({ viewMode }),
  setSortBy: (sortBy) => set({ sortBy }),
  setSortOrder: (sortOrder) => set({ sortOrder }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  setPreviewFile: (previewFile) => set({ previewFile }),

  navigateUp: () => {
    const { currentPath } = get();
    if (currentPath === '/') return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    set({
      currentPath: '/' + parts.join('/'),
      selectedFiles: new Set(),
    });
  },

  navigateTo: (path) => {
    set({
      currentPath: path.startsWith('/') ? path : `/${path}`,
      selectedFiles: new Set(),
    });
  },
}));

// Selectors
export const selectFilteredFiles = () => {
  const { files, searchQuery, sortBy, sortOrder } = useFileStore.getState();

  let filtered = [...files];

  // Filter by search
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filtered = filtered.filter((f) => f.name.toLowerCase().includes(query));
  }

  // Sort
  filtered.sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'date':
        comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        break;
      case 'size':
        comparison = a.size - b.size;
        break;
      case 'type':
        comparison = a.type.localeCompare(b.type);
        break;
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  // Directories first
  return [
    ...filtered.filter((f) => f.isDirectory),
    ...filtered.filter((f) => !f.isDirectory),
  ];
};

export const selectBreadcrumbs = () => {
  const { currentPath } = useFileStore.getState();
  const parts = currentPath.split('/').filter(Boolean);

  return [
    { name: 'Home', path: '/' },
    ...parts.map((part, index) => ({
      name: part,
      path: '/' + parts.slice(0, index + 1).join('/'),
    })),
  ];
};
