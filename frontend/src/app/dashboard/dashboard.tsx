import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  //   CardContent,
  //   CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Trash2 } from 'lucide-react';
import { deleteProject, getMyProjects } from '@/server/queries';
import CreatePodcastButton from './create-podcast-button';
import CreateZoomButton from './create-zoom-button';

export async function Dashboard() {
  const projects = await getMyProjects();

  return (
    <div className='flex-1 p-8 overflow-y-auto'>
      <div className='flex justify-between items-center mb-6'>
        <h2 className='text-3xl font-bold'>Your Projects</h2>
        <CreatePodcastButton />
        <CreateZoomButton />
      </div>

      {/* Search bar */}
      {/* <div className='mb-6'>
        <Input
          type='search'
          placeholder='Search projects...'
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className='w-full'
        />
      </div> */}

      {/* Project grid */}
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
        {projects.map((project) => (
          <Link
            href={`/project/${project.id}`}
            key={project.id}
            passHref
            legacyBehavior
          >
            <Card className='cursor-pointer hover:scale-105 transition-all duration-150 ease-in-out'>
              <CardHeader>
                <CardTitle>{project.title}</CardTitle>
                {/* <CardDescription>
                  Last edited {new Date(project.updatedAt).toLocaleDateString()}
                </CardDescription> */}
              </CardHeader>
              {/* <CardContent>
              <div className='aspect-video bg-gray-200 rounded-md mb-4'>
                {project.title && <p>{project.title}</p>}
              </div>
            </CardContent> */}
              <CardFooter className='flex justify-between'>
                <Link href={`/project?projectId=${project.id}`}>
                  <Button variant='outline'>Edit</Button>
                </Link>
                <form
                  action={async () => {
                    'use server';
                    await deleteProject(project.id);
                  }}
                >
                  <Button type='submit' variant='ghost'>
                    <Trash2 className='w-5 h-5' />
                  </Button>
                </form>
              </CardFooter>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
