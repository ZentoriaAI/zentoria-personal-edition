'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Workflow,
  Play,
  Pause,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Timer,
  Activity,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { apiClient } from '@/lib/api-client';
import { toast } from '@/stores/app-store';
import { cn, formatRelativeTime, formatDuration } from '@/lib/utils';
import type { Workflow as WorkflowType, WorkflowExecution, WorkflowStatus } from '@/types';

export default function WorkflowsPage() {
  const queryClient = useQueryClient();
  const [expandedWorkflow, setExpandedWorkflow] = useState<string | null>(null);

  // Fetch workflows
  const { data: workflows, isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => apiClient.listWorkflows(),
    refetchInterval: 10000,
  });

  // Fetch recent executions
  const { data: executionsData } = useQuery({
    queryKey: ['workflowExecutions'],
    queryFn: () => apiClient.getWorkflowExecutions(undefined, 1, 20),
    refetchInterval: 5000,
  });

  // Activate workflow
  const activateWorkflow = useMutation({
    mutationFn: (id: string) => apiClient.activateWorkflow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      toast({ title: 'Workflow activated', variant: 'success' });
    },
    onError: (error) => {
      toast({ title: 'Failed to activate', description: error.message, variant: 'error' });
    },
  });

  // Deactivate workflow
  const deactivateWorkflow = useMutation({
    mutationFn: (id: string) => apiClient.deactivateWorkflow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      toast({ title: 'Workflow deactivated', variant: 'success' });
    },
  });

  // Trigger workflow
  const triggerWorkflow = useMutation({
    mutationFn: (id: string) => apiClient.triggerWorkflow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflowExecutions'] });
      toast({ title: 'Workflow triggered', variant: 'success' });
    },
    onError: (error) => {
      toast({ title: 'Failed to trigger', description: error.message, variant: 'error' });
    },
  });

  const activeCount = workflows?.filter(w => w.status === 'active').length || 0;
  const errorCount = workflows?.filter(w => w.status === 'error').length || 0;
  const totalRuns = workflows?.reduce((sum, w) => sum + w.runCount, 0) || 0;
  const recentExecutions = executionsData?.items || [];

  const getStatusIcon = (status: WorkflowStatus) => {
    switch (status) {
      case 'active':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'paused':
        return <Pause className="h-4 w-4 text-yellow-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: WorkflowStatus) => {
    const variants: Record<WorkflowStatus, 'running' | 'stopped' | 'error' | 'pending'> = {
      active: 'running',
      inactive: 'stopped',
      error: 'error',
      paused: 'pending',
    };
    return (
      <Badge variant={variants[status]} dot pulse={status === 'active'}>
        {status}
      </Badge>
    );
  };

  const getExecutionIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'running':
        return <Loader2 className="h-4 w-4 text-zentoria-500 animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Workflows"
          value={workflows?.length || 0}
          description="Configured workflows"
          icon={<Workflow className="h-4 w-4 text-zentoria-500" />}
        />
        <StatCard
          title="Active"
          value={activeCount}
          description="Currently running"
          icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
        />
        <StatCard
          title="Errors"
          value={errorCount}
          description="Workflows with errors"
          icon={<XCircle className="h-4 w-4 text-red-500" />}
        />
        <StatCard
          title="Total Executions"
          value={totalRuns}
          description="All time runs"
          icon={<Activity className="h-4 w-4 text-blue-500" />}
        />
      </div>

      <Tabs defaultValue="workflows" className="space-y-4">
        <TabsList>
          <TabsTrigger value="workflows">Workflows</TabsTrigger>
          <TabsTrigger value="executions">Recent Executions</TabsTrigger>
        </TabsList>

        {/* Workflows Tab */}
        <TabsContent value="workflows" className="space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="skeleton h-24 rounded-lg" />
              ))}
            </div>
          ) : workflows && workflows.length > 0 ? (
            workflows.map((workflow) => (
              <Card key={workflow.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    {/* Status icon */}
                    <div className={cn(
                      'w-12 h-12 rounded-lg flex items-center justify-center shrink-0',
                      workflow.status === 'active' ? 'bg-green-500/10' :
                      workflow.status === 'error' ? 'bg-red-500/10' : 'bg-gray-500/10'
                    )}>
                      <Workflow className={cn(
                        'h-6 w-6',
                        workflow.status === 'active' ? 'text-green-500' :
                        workflow.status === 'error' ? 'text-red-500' : 'text-gray-500'
                      )} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold truncate">{workflow.name}</h3>
                        {getStatusBadge(workflow.status)}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {workflow.description || 'No description'}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Activity className="h-3 w-3" />
                          {workflow.runCount} runs
                        </span>
                        {workflow.errorCount > 0 && (
                          <span className="flex items-center gap-1 text-red-500">
                            <XCircle className="h-3 w-3" />
                            {workflow.errorCount} errors
                          </span>
                        )}
                        {workflow.avgDuration && (
                          <span className="flex items-center gap-1">
                            <Timer className="h-3 w-3" />
                            Avg: {formatDuration(workflow.avgDuration)}
                          </span>
                        )}
                        {workflow.lastRun && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Last: {formatRelativeTime(workflow.lastRun)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {workflow.status === 'active' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deactivateWorkflow.mutate(workflow.id)}
                          disabled={deactivateWorkflow.isPending}
                        >
                          <Pause className="h-4 w-4 mr-1" />
                          Pause
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => activateWorkflow.mutate(workflow.id)}
                          disabled={activateWorkflow.isPending}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Activate
                        </Button>
                      )}
                      <Button
                        size="sm"
                        onClick={() => triggerWorkflow.mutate(workflow.id)}
                        disabled={triggerWorkflow.isPending}
                      >
                        <RefreshCw className={cn(
                          'h-4 w-4 mr-1',
                          triggerWorkflow.isPending && 'animate-spin'
                        )} />
                        Run Now
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setExpandedWorkflow(
                          expandedWorkflow === workflow.id ? null : workflow.id
                        )}
                      >
                        {expandedWorkflow === workflow.id ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {expandedWorkflow === workflow.id && (
                    <div className="mt-4 pt-4 border-t">
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        <div>
                          <h4 className="text-sm font-medium mb-2">Tags</h4>
                          <div className="flex flex-wrap gap-1">
                            {workflow.tags && workflow.tags.length > 0 ? (
                              workflow.tags.map((tag) => (
                                <Badge key={tag} variant="secondary">{tag}</Badge>
                              ))
                            ) : (
                              <span className="text-sm text-muted-foreground">No tags</span>
                            )}
                          </div>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium mb-2">Schedule</h4>
                          <p className="text-sm text-muted-foreground">
                            {workflow.nextRun
                              ? `Next run: ${formatRelativeTime(workflow.nextRun)}`
                              : 'Manual trigger only'}
                          </p>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium mb-2">Created</h4>
                          <p className="text-sm text-muted-foreground">
                            {formatRelativeTime(workflow.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4">
                        <Button variant="outline" size="sm" asChild>
                          <a
                            href={`${process.env.NEXT_PUBLIC_API_URL?.replace(':4000', ':5678')}/workflow/${workflow.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Open in n8n
                          </a>
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-16 text-center">
                <Workflow className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No workflows configured</h3>
                <p className="text-muted-foreground mb-4">
                  Create workflows in n8n to automate your tasks
                </p>
                <Button asChild>
                  <a
                    href={process.env.NEXT_PUBLIC_API_URL?.replace(':4000', ':5678')}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open n8n
                  </a>
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Executions Tab */}
        <TabsContent value="executions">
          <Card>
            <CardHeader>
              <CardTitle>Recent Executions</CardTitle>
            </CardHeader>
            <CardContent>
              {recentExecutions.length > 0 ? (
                <div className="space-y-3">
                  {recentExecutions.map((execution) => (
                    <div
                      key={execution.id}
                      className="flex items-center gap-4 p-3 rounded-lg bg-light-surface dark:bg-dark-elevated"
                    >
                      {getExecutionIcon(execution.status)}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{execution.workflowName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatRelativeTime(execution.startedAt)}
                          {execution.duration && ` - ${formatDuration(execution.duration)}`}
                        </p>
                      </div>
                      <Badge
                        variant={
                          execution.status === 'success' ? 'success' :
                          execution.status === 'failed' ? 'error' :
                          execution.status === 'running' ? 'running' : 'pending'
                        }
                      >
                        {execution.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Activity className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground">No recent executions</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
