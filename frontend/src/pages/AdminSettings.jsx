import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import CardPanel from '@/components/lit/CardPanel';
import { litUI } from '@/lib/uiTokens';
import { litApi } from '@/lib/litApi';

export default function AdminSettings(){
  const [azure, setAzure] = useState({ endpoint:'', key:'' });
  const [gemini, setGemini] = useState({ endpoint:'', key:'' });
  const [third, setThird] = useState({ apollo:'', phantom:'' });

  async function saveProviders(){
    await litApi.adminSaveProviders({ azure, gemini, third });
    alert('Providers saved');
  }

  return (
    <div className={litUI.pagePadding}>
      <h1 className='text-3xl font-extrabold bg-clip-text text-transparent' style={{backgroundImage:`linear-gradient(90deg, ${'#23135b'}, ${'#7c3aed'})`}}>Admin Settings</h1>
      <div className='grid grid-cols-1 gap-5 mt-6'>
        <CardPanel title='AI Providers — Azure OpenAI'>
          <Label htmlFor='az-endpoint'>Endpoint</Label>
          <Input id='az-endpoint' placeholder='https://your-azure-endpoint...' className='mb-2' value={azure.endpoint} onChange={(e)=>setAzure(v=>({...v, endpoint:e.target.value}))}/>
          <Label htmlFor='az-key'>API Key</Label>
          <Input id='az-key' type='password' placeholder='••••••••' value={azure.key} onChange={(e)=>setAzure(v=>({...v, key:e.target.value}))}/>
          <div className='mt-3 flex gap-2'>
            <Button variant='outline' onClick={()=>alert('Testing Azure…')}>Test Azure</Button>
          </div>
        </CardPanel>
        <CardPanel title='AI Providers — Google Gemini'>
          <Label htmlFor='gm-endpoint'>Endpoint</Label>
          <Input id='gm-endpoint' placeholder='https://generativelanguage.googleapis.com/...' className='mb-2' value={gemini.endpoint} onChange={(e)=>setGemini(v=>({...v, endpoint:e.target.value}))}/>
          <Label htmlFor='gm-key'>API Key</Label>
          <Input id='gm-key' type='password' placeholder='••••••••' value={gemini.key} onChange={(e)=>setGemini(v=>({...v, key:e.target.value}))}/>
          <div className='mt-3 flex gap-2'>
            <Button variant='outline' onClick={()=>alert('Testing Gemini…')}>Test Gemini</Button>
          </div>
        </CardPanel>
        <CardPanel title='Third-Party Keys'>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <div>
              <Label htmlFor='apollo'>Apollo.io API Key</Label>
              <Input id='apollo' type='password' placeholder='••••••••' value={third.apollo} onChange={(e)=>setThird(v=>({...v, apollo:e.target.value}))}/>
            </div>
            <div>
              <Label htmlFor='phantom'>PhantomBuster API Key</Label>
              <Input id='phantom' type='password' placeholder='••••••••' value={third.phantom} onChange={(e)=>setThird(v=>({...v, phantom:e.target.value}))}/>
            </div>
          </div>
          <div className='mt-3'>
            <Button className='bg-blue-600 text-white' onClick={saveProviders}>Save All</Button>
          </div>
        </CardPanel>
      </div>
    </div>
  );
}
