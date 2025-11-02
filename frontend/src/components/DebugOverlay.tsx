'use client';
import React from 'react';
import { getGatewayBase } from '@/lib/env';

function useDebugEnabled() {
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const enabled = url.searchParams.get('debug') === '1' || localStorage.getItem('LIT_DEBUG') === '1';
      setOn(!!enabled);
    } catch {
      setOn(false);
    }
  }, []);
  return on;
}

export default function DebugOverlay() {
  const enabled = useDebugEnabled();
  const [open, setOpen] = React.useState(false);
  const [last, setLast] = React.useState<{req?: any; res?: any}>({});

  React.useEffect(() => {
    if (!enabled) return;
    const orig = window.fetch;
    // @ts-ignore
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const reqUrl = typeof input === 'string' ? input : (input as any).url;
      let base = '';
      try {
        base = getGatewayBase();
      } catch {
        base = '';
      }
      const isApi = typeof reqUrl === 'string' && base && reqUrl.startsWith(base);
      let reqSnapshot: any = undefined;
      if (isApi) {
        const safeHeaders: Record<string,string> = {};
        if (init?.headers && typeof init.headers === 'object') {
          for (const [k,v] of Object.entries(init.headers as any)) {
            if (/authorization/i.test(k)) continue; // redact
            safeHeaders[k] = String(v);
          }
        }
        const bodyStr = typeof init?.body === 'string' ? init.body : undefined;
        reqSnapshot = { url: reqUrl, method: init?.method || 'GET', headers: safeHeaders, body: bodyStr };
      }
      const res = await orig(input as any, init);
      if (isApi) {
        let cloned: any = null;
        try { cloned = await res.clone().json(); } catch { cloned = await res.clone().text(); }
        setLast({ req: reqSnapshot, res: { status: res.status, ok: res.ok, body: cloned } });
      }
      return res;
    };
    return () => { /* intentionally not restoring to keep diff minimal */ };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <div style={{position:'fixed',right:16,bottom:16,zIndex:9999}}>
      <button onClick={()=>setOpen(!open)} style={{padding:'8px 12px',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.15)',background:'#fff',border:'1px solid #e5e7eb'}}>Debug</button>
      {open && (
        <div style={{position:'fixed',right:16,bottom:56,width:380,maxHeight:'50vh',overflow:'auto',background:'#fff',border:'1px solid #e5e7eb',borderRadius:12,boxShadow:'0 8px 24px rgba(0,0,0,0.2)',padding:12}}>
          <pre style={{fontSize:12,whiteSpace:'pre-wrap',wordBreak:'break-word',margin:0}}>{JSON.stringify(last, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

