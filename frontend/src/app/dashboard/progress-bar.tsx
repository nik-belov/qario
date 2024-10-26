'use client';

import { useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

interface ProgressBarProps {
  progress: number;
  status: 'uploading' | 'processing' | 'completed' | 'error';
  projectId: string;
  onProgressUpdate: (
    progress: number,
    status: 'uploading' | 'processing' | 'completed' | 'error'
  ) => void;
}

type ProjectPayload = {
  processingProgress: string;
  error?: boolean;
};

export function ProgressBar({
  progress,
  status,
  projectId,
  onProgressUpdate,
}: ProgressBarProps) {
  useEffect(() => {
    const channel = supabase
      .channel('projects-progress')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'qario_projects',
          filter: `id=eq.${projectId}`,
        },
        (payload) => {
          if (payload.new) {
            const project = payload.new as ProjectPayload;
            if (project.processingProgress) {
              const newProgress = Number(project.processingProgress);
              let newStatus = status;

              if (project.processingProgress === '100') {
                newStatus = 'completed';
              } else if (project.error) {
                newStatus = 'error';
              } else {
                newStatus = 'processing';
              }

              onProgressUpdate(newProgress, newStatus);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, onProgressUpdate, status]);

  const getStatusText = () => {
    switch (status) {
      case 'uploading':
        return 'Uploading...';
      case 'processing':
        return 'Processing...';
      case 'completed':
        return 'Completed';
      case 'error':
        return 'Error';
      default:
        return '';
    }
  };

  return (
    <div className='w-full space-y-2'>
      <div className='flex justify-between text-sm text-muted-foreground'>
        <span>{getStatusText()}</span>
        <span>{Math.round(progress)}%</span>
      </div>
      <Progress
        value={progress}
        className={cn(
          'w-full',
          status === 'error' && 'text-destructive [&>div]:bg-destructive'
        )}
      />
    </div>
  );
}
