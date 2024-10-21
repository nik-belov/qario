'use client';
import { useState, useActionState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { uploadZoomFile } from './upload-actions';

const initialState = { message: '', status: '' };

export default function CreateZoomButton() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(uploadZoomFile, initialState);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Create New Zoom Podcast</Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a New Podcast Project</DialogTitle>
          </DialogHeader>

          <form action={action} className='space-y-4'>
            <div>
              <Label htmlFor='projectName'>Project Name</Label>
              <Input name='projectName' />
            </div>

            {/* Zoom Video */}
            <div>
              <Label htmlFor='zoomVideo'>Zoom Video</Label>
              <Input name='zoomVideo' type='file' accept='video/*' />
            </div>

            {/* Submit Button */}
            <Button type='submit' disabled={state.status === 'pending'}>
              {state.status === 'pending' ? 'Creating...' : 'Create Podcast'}
            </Button>

            {/* Display status messages */}
            {state.status === 'error' && <p>{state.message}</p>}
            {state.status === 'success' && <p>{state.message}</p>}
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
