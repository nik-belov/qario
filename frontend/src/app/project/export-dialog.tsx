'use client';

import { useState } from 'react';
import { Clock, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function Component() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='outline'>Export Video</Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-[425px] bg-white'>
        <DialogHeader>
          <DialogTitle className='text-2xl font-bold text-gray-900'>
            Export your video
          </DialogTitle>
        </DialogHeader>
        <div className='mt-4 space-y-4'>
          <div className='rounded-lg border border-gray-200 bg-gray-100 aspect-video relative overflow-hidden'>
            <div className='absolute bottom-0 left-0 right-0 p-2 bg-black/50 flex items-center gap-2 text-white'>
              <Clock className='h-4 w-4' />
              <span className='text-sm'>00:00</span>
            </div>
            <div className='flex items-center justify-center h-full'>
              <Video className='h-12 w-12 text-gray-400' />
            </div>
          </div>

          <div className='space-y-4'>
            <div className='flex justify-between items-center'>
              <label className='text-sm text-gray-600'>Format</label>
              <Select defaultValue='mp4'>
                <SelectTrigger className='w-[180px] bg-white border-gray-200'>
                  <SelectValue placeholder='Select format' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='mp4'>MP4</SelectItem>
                  <SelectItem value='mov'>MOV</SelectItem>
                  <SelectItem value='webm'>WebM</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className='flex justify-between items-center'>
              <label className='text-sm text-gray-600'>Frame Rate</label>
              <Select defaultValue='30'>
                <SelectTrigger className='w-[180px] bg-white border-gray-200'>
                  <SelectValue placeholder='Select frame rate' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='24'>24 FPS</SelectItem>
                  <SelectItem value='30'>30 FPS</SelectItem>
                  <SelectItem value='60'>60 FPS</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className='flex justify-between items-center'>
              <label className='text-sm text-gray-600'>Resolution</label>
              <Select defaultValue='1080p'>
                <SelectTrigger className='w-[180px] bg-white border-gray-200'>
                  <SelectValue placeholder='Select resolution' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='720p'>1280 x 720 (720p)</SelectItem>
                  <SelectItem value='1080p'>1920 x 1080 (1080p)</SelectItem>
                  <SelectItem value='4k'>3840 x 2160 (4K)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className='flex justify-between items-center'>
              <label className='text-sm text-gray-600'>Quality</label>
              <Select defaultValue='high'>
                <SelectTrigger className='w-[180px] bg-white border-gray-200'>
                  <SelectValue placeholder='Select quality' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='low'>Low</SelectItem>
                  <SelectItem value='medium'>Medium</SelectItem>
                  <SelectItem value='high'>High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            className='w-full bg-blue-600 hover:scale-105 transition-all duration-300 hover:bg-blue-600 text-white'
            onClick={() => setOpen(false)}
          >
            Export now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
