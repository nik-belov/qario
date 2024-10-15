'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useActionState } from '@/lib/hooks';
import { cutVideo } from '@/app/dashboard/upload-actions';

export default function CutForm({ projectId }) {
  const [cutStartTime, setCutStartTime] = useState(0);
  const { execute, state } = useActionState(cutVideo);

  const handleCut = async (e) => {
    e.preventDefault();
    await execute(projectId, cutStartTime);
    if (state.status === 'success') {
      window.location.reload();
    }
  };

  return (
    <form onSubmit={handleCut}>
      <input
        type="number"
        value={cutStartTime}
        onChange={(e) => setCutStartTime(parseFloat(e.target.value))}
        step="0.01"
        min="0"
        className="mb-2 p-2 border rounded"
      />
      <Button type="submit" variant='outline' className='w-full'>
        Cut at {cutStartTime.toFixed(2)}s
      </Button>
      {state.status === 'error' && <p className="text-red-500">{state.message}</p>}
    </form>
  );
}
