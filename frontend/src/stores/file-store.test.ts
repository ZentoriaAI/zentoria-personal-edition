/**
 * File Store Tests - TEST-005
 *
 * Comprehensive tests for the useFileStore Zustand store including:
 * - Path and file management
 * - File selection
 * - Upload tracking
 * - View settings
 * - Navigation
 * - Selectors
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from '@testing-library/react';
import { useFileStore, selectFilteredFiles, selectBreadcrumbs } from './file-store';
import type { FileItem, FileUploadProgress } from '@/types';

// Test data factories
const createMockFileItem = (overrides: Partial<FileItem> = {}): FileItem => ({
  id: `file_${Math.random().toString(36).slice(2, 10)}`,
  name: 'test-file.txt',
  path: '/documents',
  mimeType: 'text/plain',
  size: 1024,
  type: 'document',
  isDirectory: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const createMockDirectory = (overrides: Partial<FileItem> = {}): FileItem => ({
  ...createMockFileItem(),
  isDirectory: true,
  mimeType: 'directory',
  type: 'other',
  ...overrides,
});

const createMockUpload = (overrides: Partial<FileUploadProgress> = {}): FileUploadProgress => ({
  fileId: `upload_${Math.random().toString(36).slice(2, 10)}`,
  name: 'uploading-file.txt',
  progress: 0,
  status: 'pending',
  ...overrides,
});

describe('useFileStore (TEST-005)', () => {
  beforeEach(() => {
    // Reset the store to initial state
    const store = useFileStore.getState();
    act(() => {
      store.setCurrentPath('/');
      store.setFiles([]);
      store.clearSelection();
      store.clearUploads();
      store.setViewMode('grid');
      store.setSortBy('name');
      store.setSortOrder('asc');
      store.setSearchQuery('');
      store.setPreviewFile(null);
    });
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useFileStore.getState();

      expect(state.currentPath).toBe('/');
      expect(state.files).toEqual([]);
      expect(state.selectedFiles.size).toBe(0);
      expect(state.uploads.size).toBe(0);
      expect(state.viewMode).toBe('grid');
      expect(state.sortBy).toBe('name');
      expect(state.sortOrder).toBe('asc');
      expect(state.searchQuery).toBe('');
      expect(state.previewFile).toBeNull();
    });
  });

  describe('Path Management', () => {
    describe('setCurrentPath', () => {
      it('should set current path', () => {
        act(() => {
          useFileStore.getState().setCurrentPath('/documents/work');
        });

        expect(useFileStore.getState().currentPath).toBe('/documents/work');
      });

      it('should clear selection when path changes', () => {
        const file = createMockFileItem({ id: 'file_1' });

        act(() => {
          useFileStore.getState().setFiles([file]);
          useFileStore.getState().selectFile('file_1');
          useFileStore.getState().setCurrentPath('/other');
        });

        expect(useFileStore.getState().selectedFiles.size).toBe(0);
      });
    });

    describe('navigateUp', () => {
      it('should navigate to parent directory', () => {
        act(() => {
          useFileStore.getState().setCurrentPath('/documents/work/projects');
          useFileStore.getState().navigateUp();
        });

        expect(useFileStore.getState().currentPath).toBe('/documents/work');
      });

      it('should stay at root when already at root', () => {
        act(() => {
          useFileStore.getState().setCurrentPath('/');
          useFileStore.getState().navigateUp();
        });

        expect(useFileStore.getState().currentPath).toBe('/');
      });

      it('should clear selection when navigating', () => {
        const file = createMockFileItem({ id: 'file_1' });

        act(() => {
          useFileStore.getState().setCurrentPath('/documents/work');
          useFileStore.getState().setFiles([file]);
          useFileStore.getState().selectFile('file_1');
          useFileStore.getState().navigateUp();
        });

        expect(useFileStore.getState().selectedFiles.size).toBe(0);
      });
    });

    describe('navigateTo', () => {
      it('should navigate to specified path', () => {
        act(() => {
          useFileStore.getState().navigateTo('/documents/photos');
        });

        expect(useFileStore.getState().currentPath).toBe('/documents/photos');
      });

      it('should add leading slash if missing', () => {
        act(() => {
          useFileStore.getState().navigateTo('documents/photos');
        });

        expect(useFileStore.getState().currentPath).toBe('/documents/photos');
      });

      it('should clear selection when navigating', () => {
        const file = createMockFileItem({ id: 'file_1' });

        act(() => {
          useFileStore.getState().setFiles([file]);
          useFileStore.getState().selectFile('file_1');
          useFileStore.getState().navigateTo('/other');
        });

        expect(useFileStore.getState().selectedFiles.size).toBe(0);
      });
    });
  });

  describe('File Management', () => {
    describe('setFiles', () => {
      it('should set files array', () => {
        const files = [
          createMockFileItem({ id: 'file_1' }),
          createMockFileItem({ id: 'file_2' }),
        ];

        act(() => {
          useFileStore.getState().setFiles(files);
        });

        expect(useFileStore.getState().files).toEqual(files);
      });

      it('should replace existing files', () => {
        const initial = [createMockFileItem({ id: 'old' })];
        const updated = [createMockFileItem({ id: 'new' })];

        act(() => {
          useFileStore.getState().setFiles(initial);
          useFileStore.getState().setFiles(updated);
        });

        expect(useFileStore.getState().files).toEqual(updated);
      });
    });

    describe('addFile', () => {
      it('should add file to list', () => {
        const existing = createMockFileItem({ id: 'file_1' });
        const newFile = createMockFileItem({ id: 'file_2' });

        act(() => {
          useFileStore.getState().setFiles([existing]);
          useFileStore.getState().addFile(newFile);
        });

        expect(useFileStore.getState().files).toHaveLength(2);
      });
    });

    describe('updateFile', () => {
      it('should update file by ID', () => {
        const file = createMockFileItem({ id: 'file_1', name: 'original.txt' });

        act(() => {
          useFileStore.getState().setFiles([file]);
          useFileStore.getState().updateFile('file_1', { name: 'updated.txt' });
        });

        expect(useFileStore.getState().files[0].name).toBe('updated.txt');
      });

      it('should not affect other files', () => {
        const file1 = createMockFileItem({ id: 'file_1', name: 'file1.txt' });
        const file2 = createMockFileItem({ id: 'file_2', name: 'file2.txt' });

        act(() => {
          useFileStore.getState().setFiles([file1, file2]);
          useFileStore.getState().updateFile('file_1', { name: 'updated.txt' });
        });

        expect(useFileStore.getState().files[1].name).toBe('file2.txt');
      });
    });

    describe('removeFile', () => {
      it('should remove file by ID', () => {
        const file1 = createMockFileItem({ id: 'file_1' });
        const file2 = createMockFileItem({ id: 'file_2' });

        act(() => {
          useFileStore.getState().setFiles([file1, file2]);
          useFileStore.getState().removeFile('file_1');
        });

        const files = useFileStore.getState().files;
        expect(files).toHaveLength(1);
        expect(files[0].id).toBe('file_2');
      });

      it('should remove file from selection if selected', () => {
        const file = createMockFileItem({ id: 'file_1' });

        act(() => {
          useFileStore.getState().setFiles([file]);
          useFileStore.getState().selectFile('file_1');
          useFileStore.getState().removeFile('file_1');
        });

        expect(useFileStore.getState().selectedFiles.has('file_1')).toBe(false);
      });
    });
  });

  describe('File Selection', () => {
    describe('selectFile', () => {
      it('should add file to selection', () => {
        act(() => {
          useFileStore.getState().selectFile('file_1');
        });

        expect(useFileStore.getState().selectedFiles.has('file_1')).toBe(true);
      });

      it('should allow multiple selections', () => {
        act(() => {
          useFileStore.getState().selectFile('file_1');
          useFileStore.getState().selectFile('file_2');
        });

        expect(useFileStore.getState().selectedFiles.size).toBe(2);
      });
    });

    describe('deselectFile', () => {
      it('should remove file from selection', () => {
        act(() => {
          useFileStore.getState().selectFile('file_1');
          useFileStore.getState().deselectFile('file_1');
        });

        expect(useFileStore.getState().selectedFiles.has('file_1')).toBe(false);
      });

      it('should not affect other selections', () => {
        act(() => {
          useFileStore.getState().selectFile('file_1');
          useFileStore.getState().selectFile('file_2');
          useFileStore.getState().deselectFile('file_1');
        });

        expect(useFileStore.getState().selectedFiles.has('file_2')).toBe(true);
      });
    });

    describe('toggleFileSelection', () => {
      it('should select if not selected', () => {
        act(() => {
          useFileStore.getState().toggleFileSelection('file_1');
        });

        expect(useFileStore.getState().selectedFiles.has('file_1')).toBe(true);
      });

      it('should deselect if already selected', () => {
        act(() => {
          useFileStore.getState().selectFile('file_1');
          useFileStore.getState().toggleFileSelection('file_1');
        });

        expect(useFileStore.getState().selectedFiles.has('file_1')).toBe(false);
      });
    });

    describe('selectAll', () => {
      it('should select all files', () => {
        const files = [
          createMockFileItem({ id: 'file_1' }),
          createMockFileItem({ id: 'file_2' }),
          createMockFileItem({ id: 'file_3' }),
        ];

        act(() => {
          useFileStore.getState().setFiles(files);
          useFileStore.getState().selectAll();
        });

        expect(useFileStore.getState().selectedFiles.size).toBe(3);
      });

      it('should handle empty file list', () => {
        act(() => {
          useFileStore.getState().selectAll();
        });

        expect(useFileStore.getState().selectedFiles.size).toBe(0);
      });
    });

    describe('clearSelection', () => {
      it('should clear all selections', () => {
        act(() => {
          useFileStore.getState().selectFile('file_1');
          useFileStore.getState().selectFile('file_2');
          useFileStore.getState().clearSelection();
        });

        expect(useFileStore.getState().selectedFiles.size).toBe(0);
      });
    });
  });

  describe('Upload Management', () => {
    describe('addUpload', () => {
      it('should add upload to map', () => {
        const upload = createMockUpload({ fileId: 'upload_1' });

        act(() => {
          useFileStore.getState().addUpload(upload);
        });

        expect(useFileStore.getState().uploads.has('upload_1')).toBe(true);
      });

      it('should allow multiple uploads', () => {
        const upload1 = createMockUpload({ fileId: 'upload_1' });
        const upload2 = createMockUpload({ fileId: 'upload_2' });

        act(() => {
          useFileStore.getState().addUpload(upload1);
          useFileStore.getState().addUpload(upload2);
        });

        expect(useFileStore.getState().uploads.size).toBe(2);
      });
    });

    describe('updateUpload', () => {
      it('should update upload progress', () => {
        const upload = createMockUpload({ fileId: 'upload_1', progress: 0 });

        act(() => {
          useFileStore.getState().addUpload(upload);
          useFileStore.getState().updateUpload('upload_1', { progress: 50 });
        });

        expect(useFileStore.getState().uploads.get('upload_1')?.progress).toBe(50);
      });

      it('should update upload status', () => {
        const upload = createMockUpload({ fileId: 'upload_1', status: 'pending' });

        act(() => {
          useFileStore.getState().addUpload(upload);
          useFileStore.getState().updateUpload('upload_1', { status: 'uploading' });
        });

        expect(useFileStore.getState().uploads.get('upload_1')?.status).toBe('uploading');
      });

      it('should not create upload if not exists', () => {
        act(() => {
          useFileStore.getState().updateUpload('nonexistent', { progress: 50 });
        });

        expect(useFileStore.getState().uploads.has('nonexistent')).toBe(false);
      });
    });

    describe('removeUpload', () => {
      it('should remove upload from map', () => {
        const upload = createMockUpload({ fileId: 'upload_1' });

        act(() => {
          useFileStore.getState().addUpload(upload);
          useFileStore.getState().removeUpload('upload_1');
        });

        expect(useFileStore.getState().uploads.has('upload_1')).toBe(false);
      });
    });

    describe('clearUploads', () => {
      it('should clear all uploads', () => {
        act(() => {
          useFileStore.getState().addUpload(createMockUpload({ fileId: 'upload_1' }));
          useFileStore.getState().addUpload(createMockUpload({ fileId: 'upload_2' }));
          useFileStore.getState().clearUploads();
        });

        expect(useFileStore.getState().uploads.size).toBe(0);
      });
    });
  });

  describe('View Settings', () => {
    describe('setViewMode', () => {
      it('should set view mode to grid', () => {
        act(() => {
          useFileStore.getState().setViewMode('grid');
        });

        expect(useFileStore.getState().viewMode).toBe('grid');
      });

      it('should set view mode to list', () => {
        act(() => {
          useFileStore.getState().setViewMode('list');
        });

        expect(useFileStore.getState().viewMode).toBe('list');
      });
    });

    describe('setSortBy', () => {
      it('should set sort by name', () => {
        act(() => {
          useFileStore.getState().setSortBy('name');
        });

        expect(useFileStore.getState().sortBy).toBe('name');
      });

      it('should set sort by date', () => {
        act(() => {
          useFileStore.getState().setSortBy('date');
        });

        expect(useFileStore.getState().sortBy).toBe('date');
      });

      it('should set sort by size', () => {
        act(() => {
          useFileStore.getState().setSortBy('size');
        });

        expect(useFileStore.getState().sortBy).toBe('size');
      });

      it('should set sort by type', () => {
        act(() => {
          useFileStore.getState().setSortBy('type');
        });

        expect(useFileStore.getState().sortBy).toBe('type');
      });
    });

    describe('setSortOrder', () => {
      it('should set sort order to ascending', () => {
        act(() => {
          useFileStore.getState().setSortOrder('asc');
        });

        expect(useFileStore.getState().sortOrder).toBe('asc');
      });

      it('should set sort order to descending', () => {
        act(() => {
          useFileStore.getState().setSortOrder('desc');
        });

        expect(useFileStore.getState().sortOrder).toBe('desc');
      });
    });

    describe('setSearchQuery', () => {
      it('should set search query', () => {
        act(() => {
          useFileStore.getState().setSearchQuery('documents');
        });

        expect(useFileStore.getState().searchQuery).toBe('documents');
      });

      it('should handle empty search query', () => {
        act(() => {
          useFileStore.getState().setSearchQuery('test');
          useFileStore.getState().setSearchQuery('');
        });

        expect(useFileStore.getState().searchQuery).toBe('');
      });
    });
  });

  describe('Preview', () => {
    describe('setPreviewFile', () => {
      it('should set preview file', () => {
        const file = createMockFileItem({ id: 'file_1' });

        act(() => {
          useFileStore.getState().setPreviewFile(file);
        });

        expect(useFileStore.getState().previewFile).toEqual(file);
      });

      it('should clear preview file', () => {
        const file = createMockFileItem({ id: 'file_1' });

        act(() => {
          useFileStore.getState().setPreviewFile(file);
          useFileStore.getState().setPreviewFile(null);
        });

        expect(useFileStore.getState().previewFile).toBeNull();
      });
    });
  });

  describe('Selectors', () => {
    describe('selectFilteredFiles', () => {
      it('should filter files by search query', () => {
        const files = [
          createMockFileItem({ id: 'file_1', name: 'document.pdf' }),
          createMockFileItem({ id: 'file_2', name: 'photo.jpg' }),
          createMockFileItem({ id: 'file_3', name: 'document.txt' }),
        ];

        act(() => {
          useFileStore.getState().setFiles(files);
          useFileStore.getState().setSearchQuery('document');
        });

        const result = selectFilteredFiles();
        expect(result).toHaveLength(2);
      });

      it('should sort files by name ascending', () => {
        const files = [
          createMockFileItem({ id: 'file_c', name: 'charlie.txt', isDirectory: false }),
          createMockFileItem({ id: 'file_a', name: 'alpha.txt', isDirectory: false }),
          createMockFileItem({ id: 'file_b', name: 'bravo.txt', isDirectory: false }),
        ];

        act(() => {
          useFileStore.getState().setFiles(files);
          useFileStore.getState().setSortBy('name');
          useFileStore.getState().setSortOrder('asc');
        });

        const result = selectFilteredFiles();
        expect(result[0].name).toBe('alpha.txt');
        expect(result[1].name).toBe('bravo.txt');
        expect(result[2].name).toBe('charlie.txt');
      });

      it('should sort files by name descending', () => {
        const files = [
          createMockFileItem({ id: 'file_a', name: 'alpha.txt', isDirectory: false }),
          createMockFileItem({ id: 'file_c', name: 'charlie.txt', isDirectory: false }),
        ];

        act(() => {
          useFileStore.getState().setFiles(files);
          useFileStore.getState().setSortBy('name');
          useFileStore.getState().setSortOrder('desc');
        });

        const result = selectFilteredFiles();
        expect(result[0].name).toBe('charlie.txt');
      });

      it('should sort files by size', () => {
        const files = [
          createMockFileItem({ id: 'file_1', name: 'small.txt', size: 100, isDirectory: false }),
          createMockFileItem({ id: 'file_2', name: 'large.txt', size: 10000, isDirectory: false }),
          createMockFileItem({ id: 'file_3', name: 'medium.txt', size: 1000, isDirectory: false }),
        ];

        act(() => {
          useFileStore.getState().setFiles(files);
          useFileStore.getState().setSortBy('size');
          useFileStore.getState().setSortOrder('asc');
        });

        const result = selectFilteredFiles();
        expect(result[0].size).toBe(100);
        expect(result[2].size).toBe(10000);
      });

      it('should sort files by date', () => {
        const files = [
          createMockFileItem({ id: 'file_1', name: 'new.txt', updatedAt: '2026-01-15T12:00:00Z', isDirectory: false }),
          createMockFileItem({ id: 'file_2', name: 'old.txt', updatedAt: '2026-01-10T12:00:00Z', isDirectory: false }),
        ];

        act(() => {
          useFileStore.getState().setFiles(files);
          useFileStore.getState().setSortBy('date');
          useFileStore.getState().setSortOrder('asc');
        });

        const result = selectFilteredFiles();
        expect(result[0].name).toBe('old.txt');
      });

      it('should place directories first', () => {
        const files = [
          createMockFileItem({ id: 'file_1', name: 'file.txt', isDirectory: false }),
          createMockDirectory({ id: 'dir_1', name: 'folder' }),
        ];

        act(() => {
          useFileStore.getState().setFiles(files);
        });

        const result = selectFilteredFiles();
        expect(result[0].isDirectory).toBe(true);
        expect(result[1].isDirectory).toBe(false);
      });

      it('should handle case-insensitive search', () => {
        const files = [
          createMockFileItem({ id: 'file_1', name: 'Document.PDF' }),
          createMockFileItem({ id: 'file_2', name: 'photo.jpg' }),
        ];

        act(() => {
          useFileStore.getState().setFiles(files);
          useFileStore.getState().setSearchQuery('document');
        });

        const result = selectFilteredFiles();
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Document.PDF');
      });
    });

    describe('selectBreadcrumbs', () => {
      it('should return home for root path', () => {
        act(() => {
          useFileStore.getState().setCurrentPath('/');
        });

        const result = selectBreadcrumbs();
        expect(result).toEqual([{ name: 'Home', path: '/' }]);
      });

      it('should return full breadcrumb trail', () => {
        act(() => {
          useFileStore.getState().setCurrentPath('/documents/work/projects');
        });

        const result = selectBreadcrumbs();
        expect(result).toEqual([
          { name: 'Home', path: '/' },
          { name: 'documents', path: '/documents' },
          { name: 'work', path: '/documents/work' },
          { name: 'projects', path: '/documents/work/projects' },
        ]);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle files with special characters', () => {
      const file = createMockFileItem({
        id: 'file_1',
        name: 'report (final) [v2] - 2026.pdf',
      });

      act(() => {
        useFileStore.getState().setFiles([file]);
      });

      expect(useFileStore.getState().files[0].name).toBe('report (final) [v2] - 2026.pdf');
    });

    it('should handle unicode filenames', () => {
      const file = createMockFileItem({
        id: 'file_1',
        name: '文档-报告.pdf',
      });

      act(() => {
        useFileStore.getState().setFiles([file]);
      });

      expect(useFileStore.getState().files[0].name).toBe('文档-报告.pdf');
    });

    it('should handle very long file lists', () => {
      const files = Array.from({ length: 1000 }, (_, i) =>
        createMockFileItem({ id: `file_${i}`, name: `file_${i}.txt` })
      );

      act(() => {
        useFileStore.getState().setFiles(files);
      });

      expect(useFileStore.getState().files).toHaveLength(1000);
    });

    it('should handle rapid selection changes', () => {
      const files = Array.from({ length: 100 }, (_, i) =>
        createMockFileItem({ id: `file_${i}` })
      );

      act(() => {
        useFileStore.getState().setFiles(files);
        for (let i = 0; i < 100; i++) {
          useFileStore.getState().toggleFileSelection(`file_${i}`);
        }
      });

      expect(useFileStore.getState().selectedFiles.size).toBe(100);
    });

    it('should handle upload progress updates rapidly', () => {
      const upload = createMockUpload({ fileId: 'upload_1', progress: 0 });

      act(() => {
        useFileStore.getState().addUpload(upload);
        for (let i = 0; i <= 100; i++) {
          useFileStore.getState().updateUpload('upload_1', { progress: i });
        }
      });

      expect(useFileStore.getState().uploads.get('upload_1')?.progress).toBe(100);
    });
  });
});
