import { Dashboard } from './dashboard';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Image from 'next/image';

export default async function DashboardPage() {
  const user = auth();
  if (!user.userId) redirect('/sign-in');

  const userInfo = await clerkClient.users.getUser(user.userId);

  return (
    <div className='flex h-screen bg-gray-100'>
      {/* Sidebar */}
      <aside className='w-64 bg-white p-6 shadow-md'>
        <h1 className='text-2xl font-bold mb-6'>Qario</h1>
      </aside>

      {/* Main content */}
      <main className='flex-1 overflow-y-auto'>
        <Dashboard />
      </main>

      {/* User profile */}
      <aside className='w-64 bg-white p-6 shadow-md'>
        <div className='flex items-center space-x-4 mb-6'>
          <Image
            src={userInfo.imageUrl}
            width={48}
            height={48}
            alt='Profile picture'
            className='w-12 h-12 rounded-full object-cover'
          />
          <div>
            <h3 className='font-bold'>
              {userInfo.firstName} {userInfo.lastName}
            </h3>
            <p className='text-sm text-gray-500'>
              {userInfo.emailAddresses[0].emailAddress}
            </p>
          </div>
        </div>
        {/* <Link href={`/user-profile`}>
          <Button variant='outline' className='w-full'>
            View Profile
          </Button>
        </Link> */}
      </aside>
    </div>
  );
}
