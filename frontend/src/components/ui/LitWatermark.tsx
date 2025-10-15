import React from 'react';

export default function LitWatermark(){
  return (
    <>
      <div className="pointer-events-none select-none absolute inset-0" style={{background: 'radial-gradient(ellipse at bottom right, rgba(124,58,237,.06) 0%, rgba(2,6,23,0) 60%)'}}/>
      <div className="pointer-events-none select-none absolute right-6 bottom-6 opacity-[0.06] text-[140px] font-black leading-none bg-clip-text text-transparent bg-gradient-to-r from-violet-500 to-sky-400">LIT</div>
    </>
  );
}

