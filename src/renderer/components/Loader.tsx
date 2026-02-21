import React from 'react';

interface LoaderProps {
  title?: string;
  message?: string;
  loadingText?: string;
}

const Loader: React.FC<LoaderProps> = ({
  title = 'Synchronizing',
  // title = 'Preparing your pharmacy workspace',
  message = 'Synchronizing inventory, supplier insights, and prescription data so everything is ready the moment you arrive.',
  loadingText = 'Loading data',
}) => {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-white text-black">
      {/* Background gradient effects */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -inset-32 rounded-full bg-[radial-gradient(circle_at_top,_rgb(var(--color-white)_/_0.28),_transparent_62%)] opacity-40 animate-soft-glow" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgb(var(--color-lime-300)_/_0.2),_transparent_60%)] opacity-50" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgb(var(--color-emerald-800)_/_0.25),_transparent_55%)] opacity-60 mix-blend-screen" />
      </div>

      {/* Main content */}
      <div className="relative flex flex-col items-center gap-12 px-6 text-center">
        {/* Logo/Icon section with animated borders */}

        {/* Text and progress section */}
        <div className="flex flex-col items-center gap-5 max-w-xl">
          <h2 className="text-3xl font-bold tracking-wide drop-shadow-lg">{title}</h2>
          {/* <p className="text-sm md:text-base text-black leading-relaxed">
            {message}
          </p> */}
          <div className="relative h-2 w-64 overflow-hidden rounded-full bg-black shadow-inner shadow-white/40">
            <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-lime-200 via-white to-emerald-200 animate-progress-sweep" />
          </div>
          <span className="text-[11px] uppercase tracking-[0.55em] text-black/70 animate-blink-slow">
            {loadingText}
          </span>
        </div>
      </div>
    </div>
  );
};

export default Loader;
