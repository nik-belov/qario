'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useActionState } from '@/lib/hooks';
import { trimVideo } from '@/app/dashboard/upload-actions';

export default function TrimForm({ projectId }) {
  const [trimStartTime, setTrimStartTime] = useState(0);
  const [trimEndTime, setTrimEndTime] = useState(0);
  const { execute, state } = useActionState(trimVideo);

  const handleTrim = async (e) => {
    e.preventDefault();
    await execute(projectId, trimStartTime, trimEndTime);
    if (state.status === 'success') {
      window.location.reload();
    }
  };

  return (
    <form onSubmit={handleTrim}>
      <input
        type="number"
        value={trimStartTime}
        onChange={(e) => setTrimStartTime(parseFloat(e.target.value))}
        step="0.01"
        min="0"
        className="mb-2 p-2 border rounded"
      />
      <input
        type="number"
        value={trimEndTime}
        onChange={(e) => setTrimEndTime(parseFloat(e.target.value))}
        step="0.01"
        min="0"
        className="mb-2 p-2 border rounded"
      />
      <Button type="submit" variant='outline' className='w-full'>
        Trim {trimStartTime.toFixed(2)}s - {trimEndTime.toFixed(2)}s
      </Button>
      {state.status === 'error' && <p className="text-red-500">{state.message}</p>}
    </form>
  );
}
