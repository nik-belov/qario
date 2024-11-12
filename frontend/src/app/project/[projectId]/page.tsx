import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Wand2 } from 'lucide-react';
import ProjectManager from '../project-manager';
import { getProjectById } from '@/server/queries';
import ProjectTitleEditor from '../title-edit';
import { exportProject } from '@/server/queries';
import ExportDialog from '../export-dialog';

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const projectId = (await params).projectId;
  const project = await getProjectById(projectId);

  return (
    <div className='flex flex-col h-screen bg-gray-100'>
      {/* Header */}
      <header className='bg-white shadow-md p-4'>
        <div className='flex justify-between items-center'>
          <Link
            href='/dashboard'
            className='flex items-center space-x-2 text-gray-700 hover:text-gray-900'
          >
            <ArrowLeft className='w-5 h-5' />
            <span>Back to Dashboard</span>
          </Link>
          <ProjectTitleEditor
            projectId={projectId.toString()}
            initialTitle={project.title}
          />
          <ExportDialog />
        </div>
      </header>

      {/* Main content */}
      <main className='flex-1 flex overflow-hidden'>
        {/* Left sidebar - Project Manager */}
        <aside className='w-64 bg-white p-4 shadow-md overflow-y-auto'>
          <ProjectManager project={project} />
        </aside>

        {/* Center - Video Editor */}
        <section className='flex-1 p-4 flex flex-col'>
          {/* Add the process video button */}
          {/* <form action={action} className='mb-4'>
            <Button type='submit'>Process Video</Button>
          </form> */}

          {/* Display the processed video if available */}
          {project.finalVideoUrl ? (
            <div className='flex justify-center items-center'>
              <video controls className='w-full max-w-lg'>
                <source src={project.finalVideoUrl} type='video/mp4' />
                Your browser does not support the video tag.
              </video>
            </div>
          ) : (
            <p>No processed video available yet.</p>
          )}
        </section>

        {/* Right sidebar - Editing Tools */}
        <aside className='w-80 bg-white p-4 shadow-md overflow-y-auto'>
          <Tabs defaultValue='edit'>
            <TabsList className='w-full'>
              <TabsTrigger value='edit' className='flex-1'>
                Edit
              </TabsTrigger>
              <TabsTrigger value='ai' className='flex-1'>
                AI Tools
              </TabsTrigger>
            </TabsList>
            <TabsContent value='edit'>
              <h2 className='text-lg font-semibold mb-4'>Editing Tools</h2>
              <div className='space-y-4'>
                <Button variant='outline' className='w-full'>
                  Cut
                </Button>
                <Button variant='outline' className='w-full'>
                  Trim
                </Button>
                <Button variant='outline' className='w-full'>
                  Add Text
                </Button>
                <Button variant='outline' className='w-full'>
                  Add Effects
                </Button>
              </div>
            </TabsContent>
            <TabsContent value='ai'>
              <h2 className='text-lg font-semibold mb-4'>AI Tools</h2>
              <div className='space-y-4'>
                <Button className='w-full'>
                  <Wand2 className='w-5 h-5 mr-2' />
                  Auto Edit
                </Button>
                <Button className='w-full'>
                  <Wand2 className='w-5 h-5 mr-2' />
                  Generate Captions
                </Button>
                <Button className='w-full'>
                  <Wand2 className='w-5 h-5 mr-2' />
                  Enhance Audio
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </aside>
      </main>
    </div>
  );
}
