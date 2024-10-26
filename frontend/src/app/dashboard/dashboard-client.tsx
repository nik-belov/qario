'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { ProgressBar } from './progress-bar';

export function DashboardProgress({ projectId }: { projectId: string }) {
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<
    'uploading' | 'processing' | 'completed' | 'error'
  >('uploading');

  const handleProgressUpdate = (
    newProgress: number,
    newStatus: 'uploading' | 'processing' | 'completed' | 'error'
  ) => {
    setUploadProgress(newProgress);
    setUploadStatus(newStatus);
  };

  return (
    <Card className='fixed bottom-4 right-4 p-4 w-80 shadow-lg'>
      <ProgressBar
        progress={uploadProgress}
        status={uploadStatus}
        projectId={projectId}
        onProgressUpdate={handleProgressUpdate}
      />
    </Card>
  );
}
