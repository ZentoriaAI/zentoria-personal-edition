'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Folder,
  FolderOpen,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Trash2,
  Archive,
  MessageSquare,
  Inbox,
  Search,
  Plus,
  Hash,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { chatApi } from '@/lib/chat-api';
import {
  useEnhancedChatStore,
  useFolderState,
  selectFilteredSessions,
  selectCurrentSession,
} from '@/stores/enhanced-chat-store';
import { toast } from '@/stores/app-store';
import type { ProjectFolder, ChatSession } from '@/types';

interface FolderSidebarProps {
  onNewSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onNewFolder: () => void;
}

export function FolderSidebar({
  onNewSession,
  onSelectSession,
  onNewFolder,
}: FolderSidebarProps) {
  const queryClient = useQueryClient();
  const { folders, expandedFolders, selectedFolderId } = useFolderState();
  const filteredSessions = useEnhancedChatStore(selectFilteredSessions);
  const currentSession = useEnhancedChatStore(selectCurrentSession);
  const {
    setFolders,
    toggleFolderExpanded,
    setSelectedFolder,
    setSearchQuery,
  } = useEnhancedChatStore();

  const searchQuery = useEnhancedChatStore((state) => state.searchQuery);
  const showArchivedSessions = useEnhancedChatStore((state) => state.showArchivedSessions);
  const setShowArchivedSessions = useEnhancedChatStore((state) => state.setShowArchivedSessions);

  // Fetch folders
  const { data: folderData } = useQuery({
    queryKey: ['folders'],
    queryFn: () => chatApi.getFolderTree(),
  });

  // Sync folders to store when data changes
  useEffect(() => {
    if (folderData?.folders) {
      setFolders(folderData.folders);
    }
  }, [folderData, setFolders]);

  // Fetch sessions
  const { data: sessionsData } = useQuery({
    queryKey: ['sessions', selectedFolderId, showArchivedSessions],
    queryFn: () =>
      chatApi.getSessions({
        folderId: selectedFolderId === 'unfiled' ? undefined : selectedFolderId || undefined,
        isArchived: showArchivedSessions,
        pageSize: 100,
      }),
  });

  // Sync sessions to store when data changes
  useEffect(() => {
    if (sessionsData?.items) {
      useEnhancedChatStore.getState().setSessions(sessionsData.items);
    }
  }, [sessionsData]);

  // State for folder editing (BUG-007)
  const [editingFolder, setEditingFolder] = useState<ProjectFolder | null>(null);
  const [editFolderName, setEditFolderName] = useState('');

  // Delete folder mutation
  const deleteFolderMutation = useMutation({
    mutationFn: (folderId: string) => chatApi.deleteFolder(folderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      toast({ title: 'Folder deleted', variant: 'success' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete folder', description: error.message, variant: 'error' });
    },
  });

  // Update folder mutation (BUG-007)
  const updateFolderMutation = useMutation({
    mutationFn: ({ folderId, data }: { folderId: string; data: { name: string } }) =>
      chatApi.updateFolder(folderId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      toast({ title: 'Folder renamed', variant: 'success' });
      setEditingFolder(null);
      setEditFolderName('');
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to rename folder', description: error.message, variant: 'error' });
    },
  });

  // Handle folder edit (BUG-007)
  const handleEditFolder = (folder: ProjectFolder) => {
    setEditingFolder(folder);
    setEditFolderName(folder.name);
  };

  const handleSaveEdit = () => {
    if (!editingFolder || !editFolderName.trim()) return;
    updateFolderMutation.mutate({
      folderId: editingFolder.id,
      data: { name: editFolderName.trim() },
    });
  };

  const unfiledCount = folderData?.unfiledCount || 0;

  const handleFolderClick = useCallback(
    (folderId: string | null) => {
      setSelectedFolder(folderId);
    },
    [setSelectedFolder]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b space-y-2">
        <Button className="w-full" onClick={onNewSession}>
          <Plus className="mr-2 h-4 w-4" />
          New Chat
        </Button>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats..."
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      {/* Folder tree */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {/* All chats */}
          <FolderItem
            icon={<MessageSquare className="h-4 w-4" />}
            label="All Chats"
            isSelected={selectedFolderId === null && !searchQuery}
            onClick={() => handleFolderClick(null)}
            count={sessionsData?.total}
          />

          {/* Unfiled */}
          <FolderItem
            icon={<Inbox className="h-4 w-4" />}
            label="Unfiled"
            isSelected={selectedFolderId === 'unfiled'}
            onClick={() => handleFolderClick('unfiled')}
            count={unfiledCount}
          />

          {/* Divider */}
          <div className="h-px bg-border my-2" />

          {/* Folders header */}
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Folders
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onNewFolder}
              className="h-5 w-5"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Folder list */}
          {folders.map((folder) => (
            <FolderTreeItem
              key={folder.id}
              folder={folder}
              depth={0}
              isExpanded={expandedFolders.has(folder.id)}
              isSelected={selectedFolderId === folder.id}
              onToggle={() => toggleFolderExpanded(folder.id)}
              onClick={() => handleFolderClick(folder.id)}
              onDelete={() => deleteFolderMutation.mutate(folder.id)}
              onEdit={() => handleEditFolder(folder)}
            />
          ))}

          {folders.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              No folders yet
            </p>
          )}

          {/* Divider */}
          <div className="h-px bg-border my-2" />

          {/* Session list */}
          <div className="space-y-0.5">
            {filteredSessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isSelected={currentSession?.id === session.id}
                onClick={() => onSelectSession(session.id)}
              />
            ))}

            {filteredSessions.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                {searchQuery ? 'No matching chats' : 'No chats yet'}
              </p>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-2 border-t">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground"
          onClick={() => setShowArchivedSessions(!showArchivedSessions)}
        >
          <Archive className="mr-2 h-4 w-4" />
          {showArchivedSessions ? 'Hide Archived' : 'Show Archived'}
        </Button>
      </div>

      {/* Edit Folder Modal (BUG-007) */}
      {editingFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              setEditingFolder(null);
              setEditFolderName('');
            }}
          />
          <div className="relative bg-light-surface dark:bg-dark-elevated rounded-lg shadow-lg border p-4 w-80 max-w-[90vw]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">Rename Folder</h3>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setEditingFolder(null);
                  setEditFolderName('');
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Input
              value={editFolderName}
              onChange={(e) => setEditFolderName(e.target.value)}
              placeholder="Folder name"
              className="mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSaveEdit();
                } else if (e.key === 'Escape') {
                  setEditingFolder(null);
                  setEditFolderName('');
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditingFolder(null);
                  setEditFolderName('');
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveEdit}
                disabled={!editFolderName.trim() || updateFolderMutation.isPending}
              >
                {updateFolderMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Folder item (simple)
interface FolderItemProps {
  icon: React.ReactNode;
  label: string;
  isSelected: boolean;
  onClick: () => void;
  count?: number;
}

function FolderItem({ icon, label, isSelected, onClick, count }: FolderItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
        isSelected
          ? 'bg-zentoria-500/10 text-zentoria-500'
          : 'hover:bg-light-hover dark:hover:bg-dark-hover text-foreground'
      )}
    >
      {icon}
      <span className="flex-1 truncate text-left">{label}</span>
      {count !== undefined && (
        <Badge variant="secondary" className="h-5 min-w-[20px] text-xs">
          {count}
        </Badge>
      )}
    </button>
  );
}

// Folder tree item (with nesting)
interface FolderTreeItemProps {
  folder: ProjectFolder;
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onClick: () => void;
  onDelete: () => void;
  onEdit: () => void;
}

function FolderTreeItem({
  folder,
  depth,
  isExpanded,
  isSelected,
  onToggle,
  onClick,
  onDelete,
  onEdit,
}: FolderTreeItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const hasChildren = folder.children && folder.children.length > 0;

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1 px-2 py-1.5 rounded-md text-sm transition-colors',
          isSelected
            ? 'bg-zentoria-500/10 text-zentoria-500'
            : 'hover:bg-light-hover dark:hover:bg-dark-hover'
        )}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {/* Expand/collapse */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="p-0.5 hover:bg-light-surface dark:hover:bg-dark-elevated rounded"
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <div className="w-4" />
        )}

        {/* Folder icon */}
        <button onClick={onClick} className="flex items-center gap-2 flex-1 min-w-0">
          {isExpanded ? (
            <FolderOpen
              className="h-4 w-4 shrink-0"
              style={{ color: folder.color || undefined }}
            />
          ) : (
            <Folder
              className="h-4 w-4 shrink-0"
              style={{ color: folder.color || undefined }}
            />
          )}
          <span className="truncate">{folder.name}</span>
          {folder.sessionCount !== undefined && folder.sessionCount > 0 && (
            <Badge variant="secondary" className="h-5 min-w-[20px] text-xs ml-auto">
              {folder.sessionCount}
            </Badge>
          )}
        </button>

        {/* Menu */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-6 w-6 opacity-0 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1 w-40 bg-light-surface dark:bg-dark-elevated rounded-lg shadow-lg border z-20 py-1">
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-light-hover dark:hover:bg-dark-hover"
                  onClick={() => {
                    setShowMenu(false);
                    onEdit();
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Rename
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-500 hover:bg-red-500/10"
                  onClick={() => {
                    setShowMenu(false);
                    onDelete();
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {folder.children!.map((child) => (
            <FolderTreeItem
              key={child.id}
              folder={child}
              depth={depth + 1}
              isExpanded={useEnhancedChatStore.getState().expandedFolders.has(child.id)}
              isSelected={useEnhancedChatStore.getState().selectedFolderId === child.id}
              onToggle={() => useEnhancedChatStore.getState().toggleFolderExpanded(child.id)}
              onClick={() => useEnhancedChatStore.getState().setSelectedFolder(child.id)}
              onDelete={() => {}}
              onEdit={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Session item
interface SessionItemProps {
  session: ChatSession;
  isSelected: boolean;
  onClick: () => void;
}

function SessionItem({ session, isSelected, onClick }: SessionItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-start gap-2 px-2 py-2 rounded-md text-sm transition-colors text-left',
        isSelected
          ? 'bg-zentoria-500/10 text-zentoria-500'
          : 'hover:bg-light-hover dark:hover:bg-dark-hover'
      )}
    >
      <Hash className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{session.title}</span>
          {session.isPinned && (
            <span className="text-zentoria-500 text-xs">Pinned</span>
          )}
        </div>
        {session.agent && (
          <span className="text-xs text-muted-foreground">
            {session.agent.displayName}
          </span>
        )}
      </div>
      {session.messageCount > 0 && (
        <span className="text-xs text-muted-foreground">
          {session.messageCount}
        </span>
      )}
    </button>
  );
}
