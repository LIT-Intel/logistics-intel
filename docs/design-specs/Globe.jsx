// Globe.jsx — Interactive 3D spinning globe with trade route arcs
// Requires D3 v7 and TopoJSON loaded globally
'use strict';

const COUNTRY_IDS = {
  'China':    '156', 'USA':       '840', 'India':   '356',
  'Germany':  '276', 'Japan':     '392', 'S.Korea': '410',
  'Mexico':   '484', 'UK':        '826', 'Brazil':  '076',
  'Australia':'036', 'Vietnam':   '704', 'Canada':  '124',
};

const GLOBE_FLAGS = {
  'China':'🇨🇳','USA':'🇺🇸','India':'🇮🇳','Germany':'🇩🇪','Japan':'🇯🇵',
  'S.Korea':'🇰🇷','Mexico':'🇲🇽','UK':'🇬🇧','Brazil':'🇧🇷','Australia':'🇦🇺',
  'Vietnam':'🇻🇳','Canada':'🇨🇦',
};

const GLOBE_LANES = [
  { id:'cn-us', from:'China',    to:'USA',     coords:[[104.2,35.9],  [-95.7,37.1]],  shipments:42800, teu:'182K', trend:'+12%', up:true },
  { id:'in-us', from:'India',    to:'USA',     coords:[[78.9,20.6],   [-95.7,37.1]],  shipments:18400, teu:'76K',  trend:'+8%',  up:true },
  { id:'de-us', from:'Germany',  to:'USA',     coords:[[10.5,51.2],   [-95.7,37.1]],  shipments:12200, teu:'48K',  trend:'+3%',  up:true },
  { id:'jp-us', from:'Japan',    to:'USA',     coords:[[138.3,36.2],  [-95.7,37.1]],  shipments:9800,  teu:'38K',  trend:'-2%',  up:false },
  { id:'kr-us', from:'S.Korea',  to:'USA',     coords:[[127.8,35.9],  [-95.7,37.1]],  shipments:8400,  teu:'31K',  trend:'+5%',  up:true },
  { id:'vn-us', from:'Vietnam',  to:'USA',     coords:[[108.3,14.1],  [-95.7,37.1]],  shipments:6900,  teu:'26K',  trend:'+22%', up:true },
  { id:'us-mx', from:'USA',      to:'Mexico',  coords:[[-95.7,37.1],  [-102.6,23.6]], shipments:6200,  teu:'22K',  trend:'+18%', up:true },
];

function Globe({ selectedLane, onLaneHover, size = 340, lanes: customLanes }) {
  const lanes = customLanes || GLOBE_LANES;
  const canvasRef = React.useRef(null);
  const stateRef  = React.useRef({
    world: null, rotation: [0, -25], targetRotation: null,
    spinning: true, animFrame: null, dashOffset: 0, loaded: false, t: 0,
  });
  const lanesRef = React.useRef(lanes);
  React.useEffect(() => { lanesRef.current = lanes; }, [lanes]);
  const [loaded, setLoaded] = React.useState(false);
  const [flagPositions, setFlagPositions] = React.useState(null);
  const selectedRef = React.useRef(selectedLane);
  React.useEffect(() => { selectedRef.current = selectedLane; }, [selectedLane]);

  // Load world data once
  React.useEffect(() => {
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      .then(r => r.json())
      .then(data => { stateRef.current.world = data; stateRef.current.loaded = true; setLoaded(true); })
      .catch(() => setLoaded(true));
    return () => { if (stateRef.current.animFrame) cancelAnimationFrame(stateRef.current.animFrame); };
  }, []);

  // Rotate globe when lane selected
  React.useEffect(() => {
    const s = stateRef.current;
    const activeLanes = lanesRef.current;
    if (selectedLane) {
      const lane = activeLanes.find(l => l.id === selectedLane);
      if (lane) {
        const midLon = (lane.coords[0][0] + lane.coords[1][0]) / 2;
        const midLat = (lane.coords[0][1] + lane.coords[1][1]) / 2;
        s.targetRotation = [-midLon, -midLat];
        s.spinning = false;
      }
    } else {
      s.spinning = true; s.targetRotation = null;
      setFlagPositions(null);
    }
  }, [selectedLane]);

  // Animation loop
  React.useEffect(() => {
    if (!loaded) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = size * dpr; canvas.height = size * dpr;
    canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const s = stateRef.current;
    let lastFlagSig = '';

    function tick() {
      s.animFrame = requestAnimationFrame(tick);
      s.t += 1;

      // Smooth rotation
      if (s.targetRotation) {
        const [tr0, tr1] = s.targetRotation;
        s.rotation[0] += (tr0 - s.rotation[0]) * 0.035;
        s.rotation[1] += (tr1 - s.rotation[1]) * 0.035;
        if (Math.abs(s.rotation[0]-tr0) < 0.05 && Math.abs(s.rotation[1]-tr1) < 0.05) {
          s.rotation = [tr0, tr1]; s.targetRotation = null;
        }
      } else if (s.spinning) {
        s.rotation[0] += 0.1;
      }
      s.dashOffset = (s.dashOffset + 0.4) % 24;

      const R = size / 2 - 8;
      const proj = d3.geoOrthographic()
        .scale(R)
        .translate([size / 2, size / 2])
        .rotate([s.rotation[0], s.rotation[1], 0])
        .clipAngle(90);
      const path = d3.geoPath(proj, ctx);
      const W = size, H = size;
      const cx = W/2, cy = H/2;

      ctx.clearRect(0, 0, W, H);

      // Atmosphere halo (outer)
      const halo = ctx.createRadialGradient(cx, cy, R, cx, cy, R + 14);
      halo.addColorStop(0, 'rgba(96,165,250,0.35)');
      halo.addColorStop(0.6,'rgba(96,165,250,0.10)');
      halo.addColorStop(1, 'rgba(96,165,250,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(cx, cy, R+14, 0, Math.PI*2); ctx.fill();

      // Ocean base — deeper, with subtle vertical depth
      const ocean = ctx.createRadialGradient(cx - R*0.25, cy - R*0.3, R*0.15, cx, cy, R);
      ocean.addColorStop(0, '#3B72C7');   // hi-light highlight
      ocean.addColorStop(0.55,'#1E4F9C');
      ocean.addColorStop(1, '#0E2F66');   // deep edge
      ctx.beginPath(); path({type:'Sphere'});
      ctx.fillStyle = ocean; ctx.fill();

      // Graticule
      ctx.beginPath(); path(d3.geoGraticule().step([20,20])());
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 0.5; ctx.stroke();

      // Countries
      if (s.world) {
        const sel = selectedRef.current;
        let hlIds = new Set();
        if (sel) {
          const lane = GLOBE_LANES.find(l => l.id === sel);
          if (lane) {
            [lane.from, lane.to].forEach(name => { if (COUNTRY_IDS[name]) hlIds.add(COUNTRY_IDS[name]); });
          }
        }
        const features = topojson.feature(s.world, s.world.objects.countries).features;
        features.forEach(f => {
          const isHl = hlIds.has(String(f.id));
          ctx.beginPath(); path(f);
          if (isHl) {
            ctx.fillStyle = '#3B82F6';
          } else {
            // Land — soft warm green/khaki
            ctx.fillStyle = '#A8B88A';
          }
          ctx.fill();
          ctx.strokeStyle = isHl ? 'rgba(15,23,42,0.35)' : 'rgba(60,80,40,0.35)';
          ctx.lineWidth = 0.4; ctx.stroke();
        });
      }

      // Sphere edge ring
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1; ctx.stroke();

      // Route arc + endpoint dots; collect flag screen positions
      const sel = selectedRef.current;
      let flagsThisFrame = null;
      if (sel) {
        const lane = lanesRef.current.find(l => l.id === sel);
        if (lane) {
          const arc = { type:'LineString', coordinates:[lane.coords[0], lane.coords[1]] };
          // Glow
          ctx.beginPath(); path(arc);
          ctx.strokeStyle = 'rgba(96,165,250,0.35)'; ctx.lineWidth = 8;
          ctx.setLineDash([]); ctx.stroke();
          // Animated dash
          ctx.beginPath(); path(arc);
          ctx.strokeStyle = '#FBBF24'; ctx.lineWidth = 2.5;
          ctx.setLineDash([8,4]); ctx.lineDashOffset = -s.dashOffset; ctx.stroke();
          ctx.setLineDash([]);

          // Endpoint dots + pulse, capture flag positions
          flagsThisFrame = [];
          lane.coords.forEach((coord, i) => {
            const camera = [-s.rotation[0]*Math.PI/180, -s.rotation[1]*Math.PI/180];
            const visible = d3.geoDistance(coord, camera) < Math.PI/2 - 0.05;
            let px, py;
            if (visible) {
              [px, py] = proj(coord) || [];
              if (px == null) return;
              // Pulse ring
              const pr = 7 + (s.dashOffset % 12) * 0.9;
              const alpha = Math.max(0, 0.55 - (s.dashOffset % 12) / 24);
              ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI*2);
              ctx.strokeStyle = `rgba(251,191,36,${alpha})`; ctx.lineWidth = 1.5; ctx.stroke();
              // Dot
              ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI*2);
              ctx.fillStyle = '#FBBF24'; ctx.fill();
              ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
            } else {
              // Project backside endpoint onto the visible rim of the sphere
              // by computing the bearing from camera to point and placing it at the limb.
              const lon = coord[0]*Math.PI/180, lat = coord[1]*Math.PI/180;
              const cx0 = camera[0], cy0 = camera[1];
              // Convert to 3D, rotate so camera is +X, then project to YZ plane angle
              const sx = Math.cos(lat)*Math.cos(lon), sy = Math.cos(lat)*Math.sin(lon), sz = Math.sin(lat);
              // Rotate around Z by -cx0 (to put camera lon at 0), then around Y by +cy0 (to put camera lat at 0)
              const c1 = Math.cos(-cx0), s1 = Math.sin(-cx0);
              let rx = sx*c1 - sy*s1;
              let ry = sx*s1 + sy*c1;
              let rz = sz;
              const c2 = Math.cos(cy0), s2 = Math.sin(cy0);
              const rx2 = rx*c2 + rz*s2;
              const rz2 = -rx*s2 + rz*c2;
              // After rotation, camera looks at +X. Limb direction is (ry, rz2). Normalize.
              const mag = Math.hypot(ry, rz2) || 1;
              const dy = ry/mag, dz = rz2/mag;
              // Place at rim — note canvas Y is inverted from world Z
              px = cx + dy * R;
              py = cy - dz * R;
              void rx2;
            }
            flagsThisFrame.push({
              country: i === 0 ? lane.from : lane.to,
              role: i === 0 ? 'from' : 'to',
              x: px, y: py, visible,
            });
          });
        }
      }

      // Update flag overlay state at modest rate to avoid React thrash
      if (s.t % 3 === 0) {
        const sig = flagsThisFrame
          ? flagsThisFrame.map(f => `${f.country}:${Math.round(f.x)}:${Math.round(f.y)}:${f.visible?1:0}`).join('|')
          : '';
        if (sig !== lastFlagSig) {
          lastFlagSig = sig;
          setFlagPositions(flagsThisFrame);
        }
      }
    }
    s.animFrame = requestAnimationFrame(tick);
    return () => { if (s.animFrame) cancelAnimationFrame(s.animFrame); };
  }, [loaded, size]);

  return (
    <div style={{position:'relative',width:size,height:size,flexShrink:0}}>
      <canvas ref={canvasRef} style={{display:'block',borderRadius:'50%'}} />

      {/* Flag pins on highlighted lane endpoints — both shown, backside muted at rim */}
      {flagPositions && flagPositions.map((f, i) => {
        const flag = GLOBE_FLAGS[f.country];
        if (!flag) return null;
        const top = f.y - 30;
        const left = f.x;
        const muted = !f.visible;
        return (
          <div key={i} style={{position:'absolute',left,top,transform:'translate(-50%,0)',pointerEvents:'none',zIndex:2,opacity:muted?0.78:1,transition:'opacity 200ms'}}>
            <div style={{
              display:'inline-flex',alignItems:'center',gap:4,
              background: muted ? 'rgba(30,79,156,0.85)' : 'rgba(15,23,42,0.92)',
              backdropFilter:'blur(6px)',
              border:`1px solid ${muted?'rgba(255,255,255,0.25)':'rgba(255,255,255,0.18)'}`,
              borderRadius:9999,
              padding:'2px 7px 2px 4px',
              boxShadow:'0 4px 12px rgba(15,23,42,0.35)',
              whiteSpace:'nowrap',
            }}>
              <span style={{fontSize:13,lineHeight:1,filter:muted?'grayscale(0.2)':'none'}}>{flag}</span>
              <span style={{fontSize:9,fontWeight:700,color:'#F8FAFC',fontFamily:'Space Grotesk,sans-serif',letterSpacing:'0.04em'}}>{f.country.toUpperCase()}</span>
              {muted && <span title="Behind globe" style={{fontSize:8,color:'#CBD5E1',fontFamily:'JetBrains Mono,monospace',marginLeft:2,opacity:0.85}}>↻</span>}
            </div>
            <div style={{width:1,height:14,background:muted?'rgba(255,255,255,0.25)':'rgba(255,255,255,0.4)',margin:'0 auto'}}></div>
          </div>
        );
      })}

      {!loaded && (
        <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'#1E4F9C',borderRadius:'50%'}}>
          <div style={{fontSize:11,color:'#CBD5E1',fontFamily:'Space Grotesk,sans-serif'}}>Loading…</div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { Globe, GLOBE_LANES });
