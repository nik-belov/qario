import Link from 'next/link';
import MaxWidthWrapper from './max-width-wrapper';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs';
// import Image from 'next/image';
// import { Button } from '@/components/ui/button';

export default function Navbar() {
  return (
    <nav className='md:sticky z-[100] h-20 inset-x-0 top-0 w-full border-b border-gray-200 bg-slate-50 backdrop-blur-lg transition-all'>
      <MaxWidthWrapper>
        <div className='flex h-20 items-center justify-between border-b border-zinc-200 px-4 lg:px-0'>
          <Link
            href='/'
            className='flex z-40 items-center gap-1.5 text-3xl text-black'
          >
            {/* <Image src='/Logo.svg' alt='Logo' width={40} height={40} /> */}
            Qario
          </Link>

          <div>
            <SignedOut>
              <SignInButton />
            </SignedOut>
            <SignedIn>
              <UserButton />
            </SignedIn>
          </div>
        </div>
      </MaxWidthWrapper>
    </nav>
  );
}
