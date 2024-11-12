import MaxWidthWrapper from '@/components/max-width-wrapper';
import Navbar from '@/components/nav-bar';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function Home() {
  return (
    <div>
      <Navbar />
      <section>
        <MaxWidthWrapper className='pb-24 pt-10 sm:pb-32 lg:pt-24 xl:pt-32 lg:pb-52 flex flex-col justify-center h-screen -mt-20'>
          <div className='mx-auto text-center flex flex-col gap-2 items-center w-fit text-balance font-bold text-gray-900 text-4xl md:text-7xl tracking-wide'>
            <h1>
              First <span className='text-blue-600'>Real</span> AI video editor.
            </h1>
            <p className='mt-3 md:mt-4 text-base md:text-lg max-w-prose text-center text-balance md:text-wrap'>
              Upload footage, simplify editing with AI, and stay in control
            </p>
          </div>
          <Link className='mt-10 text-center' href='/dashboard'>
            <Button className='text-2xl px-6 py-8 bg-blue-600 hover:scale-105 transition-all duration-300 hover:bg-blue-600'>
              Get Started
            </Button>
          </Link>
        </MaxWidthWrapper>
      </section>
    </div>
  );
}
