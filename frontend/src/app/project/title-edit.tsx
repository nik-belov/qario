'use client';

import { useTransition } from 'react';
import { Input } from '@/components/ui/input';
import { updateProjectTitle } from '@/server/queries';
import { toast } from 'sonner';

interface ProjectTitleInputProps {
  projectId: string;
  initialTitle: string;
}

export default function ProjectTitleInput({
  projectId,
  initialTitle,
}: ProjectTitleInputProps) {
  const [isPending, startTransition] = useTransition();

  const handleChange = (
    event:
      | React.FocusEvent<HTMLInputElement>
      | React.KeyboardEvent<HTMLInputElement>
  ) => {
    const newTitle = event.currentTarget.value;
    if (newTitle !== initialTitle) {
      startTransition(async () => {
        try {
          await updateProjectTitle({ projectId, title: newTitle });
          toast.success('Project title updated successfully');
        } catch (error) {
          console.error('Failed to update project title:', error);
          toast.error('Failed to update project title');
          event.currentTarget.value = initialTitle;
        }
      });
    }
  };

  return (
    <div className='flex items-center space-x-2'>
      <Input
        type='text'
        name='title'
        defaultValue={initialTitle}
        className='w-full px-3 py-2 border-none shadow-none text-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-150 ease-in-out'
        onBlur={handleChange}
        onKeyDown={(e) => e.key === 'Enter' && handleChange(e)}
        disabled={isPending}
        required
      />
    </div>
  );
}
