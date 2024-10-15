import { getProjectById } from '@/server/queries';

export default async function VideoEditor({
  projectId,
}: {
  projectId: string;
}) {
  // Fetch the project including the associated video files
  const project = await getProjectById(projectId);

  if (!project || project.files.length === 0) {
    return <p>No videos available for this project.</p>;
  }

  const videoFiles = project.files.filter((file) =>
    file.format?.startsWith('video')
  );

  return (
    <div className='flex flex-col space-y-4'>
      {videoFiles.length > 0 ? (
        videoFiles.map((file) => (
          <div
            key={file.id}
            className='bg-gray-200 h-80 w-full rounded-lg shadow-md overflow-hidden'
          >
            <video className='w-full h-full' controls>
              <source src={file.url ?? ''} type={`video/${file.format}`} />
              Your browser does not support the video tag.
            </video>
          </div>
        ))
      ) : (
        <p>No video files available for this project.</p>
      )}
    </div>
  );
}
