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
import { uploadFile } from './upload-actions';

const initialState = { message: '', status: '' };

export default function CreatePodcastButton() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(uploadFile, initialState);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Create New Podcast</Button>

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

            {/* Left Camera Video */}
            <div>
              <Label htmlFor='leftCamera'>Left Camera Video</Label>
              <Input name='leftCamera' type='file' accept='video/*' />
            </div>

            {/* Main Camera Video */}
            <div>
              <Label htmlFor='mainCamera'>Main Camera Video</Label>
              <Input name='mainCamera' type='file' accept='video/*' />
            </div>

            {/* Right Camera Video */}
            <div>
              <Label htmlFor='rightCamera'>Right Camera Video</Label>
              <Input name='rightCamera' type='file' accept='video/*' />
            </div>

            {/* Left Speaker Audio */}
            <div>
              <Label htmlFor='leftAudio'>Left Speaker Audio</Label>
              <Input name='leftAudio' type='file' accept='audio/*' />
            </div>

            {/* Right Speaker Audio */}
            <div>
              <Label htmlFor='rightAudio'>Right Speaker Audio</Label>
              <Input name='rightAudio' type='file' accept='audio/*' />
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
