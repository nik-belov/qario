import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { getFilesByProject } from '@/server/queries';
import { projects } from '@/server/db/schema';
import { Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { deleteFileAction } from '@/app/dashboard/upload-actions';

export default async function ProjectManager({
  project,
}: {
  project: typeof projects.$inferSelect;
}) {
  const files = await getFilesByProject(project);

  return (
    <div className='space-y-4'>
      <div className='grid gap-4'>
        <Label className='text-lg font-bold'>Your Files</Label>
        <ul className='flex flex-col gap-3'>
          {files.map((file) => (
            <li key={file.id} className='flex justify-between items-center'>
              <span>
                {file.fileKey}.{file.format}
              </span>
              <DeleteFileDialog file={file} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DeleteFileDialog({ file }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className='h-8 w-8'
          aria-label={`Delete ${file.fileKey}`}
        >
          <Trash2 className='h-4 w-4' />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Delete {file.fileKey}.{file.format}
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to delete {file.fileKey}.
            {file.format}?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant='outline'>Cancel</Button>
          <form action={deleteFileAction.bind(null, file.id)}>
            <Button type='submit' variant='destructive'>
              Delete
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
