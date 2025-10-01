import React, { useState } from 'react';
import CreateCompanyModal from '@/components/company/CreateCompanyModal';

export default function Companies() {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<any[]>([]);
  return (
    <div className='p-6'>
      <div className='flex items-center justify-between'>
        <h1 className='text-2xl font-bold'>Companies</h1>
        <button className='rounded border px-3 py-1.5' onClick={() => setOpen(true)}>Add Company</button>
      </div>
      <CreateCompanyModal open={open} onClose={() => setOpen(false)} onCreated={(id, name) => setList([{ id, name }, ...list])} />
      <div className='mt-4 grid gap-2'>
        {list.map(c => (
          <a key={c.id} href={`/company/${c.id}`} className='rounded border p-3 bg-white hover:shadow'>{c.name}</a>
        ))}
      </div>
    </div>
  );
}

