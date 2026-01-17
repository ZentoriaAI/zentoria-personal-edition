'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  MessageSquare,
  HardDrive,
  Workflow,
  Cpu,
  MemoryStick,
  Database,
  Zap,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Key,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import { StatCard, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress, CircularProgress } from '@/components/ui/progress';
import { apiClient } from '@/lib/api-client';
import { formatBytes, formatRelativeTime, formatDuration } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { ServiceStatus } from '@/types';

export default function DashboardPage() {
  // Fetch system health
  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiClient.getHealth(),
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Fetch metrics
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['metrics'],
    queryFn: () => apiClient.getMetrics(),
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Fetch recent conversations
  const { data: conversations } = useQuery({
    queryKey: ['conversations', { page: 1, pageSize: 5 }],
    queryFn: () => apiClient.getConversations(1, 5),
  });

  // Fetch workflows
  const { data: workflows } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => apiClient.listWorkflows(),
  });

  const getStatusColor = (status: ServiceStatus) => {
    switch (status) {
      case 'healthy':
        return 'text-green-500';
      case 'degraded':
        return 'text-yellow-500';
      case 'unhealthy':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const getStatusBadge = (status: ServiceStatus) => {
    switch (status) {
      case 'healthy':
        return <Badge variant="online" dot pulse>Online</Badge>;
      case 'degraded':
        return <Badge variant="warning" dot>Degraded</Badge>;
      case 'unhealthy':
        return <Badge variant="error" dot pulse>Offline</Badge>;
      default:
        return <Badge variant="offline" dot>Unknown</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Welcome back</h2>
          <p className="text-muted-foreground">
            Here&apos;s what&apos;s happening with your AI system
          </p>
        </div>
        <Button asChild>
          <Link href="/chat">
            <MessageSquare className="mr-2 h-4 w-4" />
            New Chat
          </Link>
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="System Status"
          value={health?.status === 'healthy' ? 'Operational' : 'Issues Detected'}
          description={health ? `Uptime: ${formatDuration(health.uptime * 1000)}` : 'Loading...'}
          icon={<Activity className={cn('h-4 w-4', getStatusColor(health?.status || 'unknown'))} />}
        />
        <StatCard
          title="Active Conversations"
          value={conversations?.total || 0}
          description="Total AI conversations"
          icon={<MessageSquare className="h-4 w-4 text-zentoria-500" />}
        />
        <StatCard
          title="Storage Used"
          value={metrics ? formatBytes(metrics.disk.used) : '--'}
          description={metrics ? `${Math.round(metrics.disk.percentage)}% of ${formatBytes(metrics.disk.total)}` : 'Loading...'}
          icon={<HardDrive className="h-4 w-4 text-blue-500" />}
        />
        <StatCard
          title="Active Workflows"
          value={workflows?.filter(w => w.status === 'active').length || 0}
          description={`${workflows?.length || 0} total workflows`}
          icon={<Workflow className="h-4 w-4 text-purple-500" />}
        />
      </div>

      {/* Two column layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* System Resources */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-zentoria-500" />
              System Resources
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* CPU */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">CPU Usage</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {metrics?.cpu.usage.toFixed(1) || '--'}%
                </span>
              </div>
              <Progress
                value={metrics?.cpu.usage || 0}
                className="h-2"
                indicatorClassName={cn(
                  metrics?.cpu.usage && metrics.cpu.usage > 80 ? 'bg-red-500' :
                  metrics?.cpu.usage && metrics.cpu.usage > 60 ? 'bg-yellow-500' : ''
                )}
              />
            </div>

            {/* Memory */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MemoryStick className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Memory</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {metrics ? `${formatBytes(metrics.memory.used)} / ${formatBytes(metrics.memory.total)}` : '--'}
                </span>
              </div>
              <Progress
                value={metrics?.memory.percentage || 0}
                className="h-2"
                indicatorClassName={cn(
                  metrics?.memory.percentage && metrics.memory.percentage > 80 ? 'bg-red-500' :
                  metrics?.memory.percentage && metrics.memory.percentage > 60 ? 'bg-yellow-500' : ''
                )}
              />
            </div>

            {/* Disk */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Storage</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {metrics ? `${formatBytes(metrics.disk.used)} / ${formatBytes(metrics.disk.total)}` : '--'}
                </span>
              </div>
              <Progress
                value={metrics?.disk.percentage || 0}
                className="h-2"
                indicatorClassName={cn(
                  metrics?.disk.percentage && metrics.disk.percentage > 90 ? 'bg-red-500' :
                  metrics?.disk.percentage && metrics.disk.percentage > 70 ? 'bg-yellow-500' : ''
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Service Health */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-zentoria-500" />
              Service Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {healthLoading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg skeleton h-14" />
                  ))}
                </div>
              ) : health?.services ? (
                health.services.map((service) => (
                  <div
                    key={service.name}
                    className="flex items-center justify-between p-3 rounded-lg bg-light-surface dark:bg-dark-elevated"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'w-2 h-2 rounded-full',
                        service.status === 'healthy' ? 'bg-green-500' :
                        service.status === 'degraded' ? 'bg-yellow-500' :
                        service.status === 'unhealthy' ? 'bg-red-500' : 'bg-gray-500',
                        service.status === 'healthy' && 'animate-pulse'
                      )} />
                      <span className="font-medium">{service.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {service.latency && (
                        <span className="text-xs text-muted-foreground">
                          {service.latency}ms
                        </span>
                      )}
                      {getStatusBadge(service.status)}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No service data available
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Conversations */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-zentoria-500" />
              Recent Conversations
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/chat">
                View All
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {conversations?.items && conversations.items.length > 0 ? (
                conversations.items.map((conv) => (
                  <Link
                    key={conv.id}
                    href={`/chat/${conv.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-light-hover dark:hover:bg-dark-hover transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-zentoria-500/10 flex items-center justify-center">
                      <MessageSquare className="h-5 w-5 text-zentoria-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{conv.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {conv.lastMessage || `${conv.messageCount} messages`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(conv.updatedAt)}
                    </div>
                  </Link>
                ))
              ) : (
                <div className="text-center py-8">
                  <MessageSquare className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground">No conversations yet</p>
                  <Button variant="outline" size="sm" className="mt-3" asChild>
                    <Link href="/chat">Start a conversation</Link>
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Workflows */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Workflow className="h-5 w-5 text-zentoria-500" />
              Workflows
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/workflows">
                View All
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {workflows && workflows.length > 0 ? (
                workflows.slice(0, 5).map((workflow) => (
                  <div
                    key={workflow.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-light-surface dark:bg-dark-elevated"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'w-10 h-10 rounded-lg flex items-center justify-center',
                        workflow.status === 'active' ? 'bg-green-500/10' :
                        workflow.status === 'error' ? 'bg-red-500/10' : 'bg-gray-500/10'
                      )}>
                        {workflow.status === 'active' ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : workflow.status === 'error' ? (
                          <AlertCircle className="h-5 w-5 text-red-500" />
                        ) : (
                          <Workflow className="h-5 w-5 text-gray-500" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{workflow.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {workflow.runCount} runs
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={
                        workflow.status === 'active' ? 'running' :
                        workflow.status === 'error' ? 'error' : 'stopped'
                      }
                      dot
                      pulse={workflow.status === 'active'}
                    >
                      {workflow.status}
                    </Badge>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <Workflow className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground">No workflows configured</p>
                  <Button variant="outline" size="sm" className="mt-3" asChild>
                    <Link href="/workflows">Configure workflows</Link>
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" asChild>
              <Link href="/chat">
                <MessageSquare className="h-6 w-6 text-zentoria-500" />
                <span>New Chat</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" asChild>
              <Link href="/files">
                <HardDrive className="h-6 w-6 text-blue-500" />
                <span>Upload Files</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" asChild>
              <Link href="/keys">
                <Key className="h-6 w-6 text-purple-500" />
                <span>Create API Key</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" asChild>
              <Link href="/settings">
                <Settings className="h-6 w-6 text-gray-500" />
                <span>Settings</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
