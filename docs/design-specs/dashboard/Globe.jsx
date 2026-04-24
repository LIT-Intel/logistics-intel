// Globe.jsx — Interactive 3D spinning globe with trade route arcs
// Requires D3 v7 and TopoJSON loaded globally
'use strict';

const COUNTRY_IDS = {
  'China':    '156', 'USA':       '840', 'India':   '356',
  'Germany':  '276', 'Japan':     '392', 'S.Korea': '410',
  'Mexico':   '484', 'UK':        '826', 'Brazil':  '076',
  'Australia':'036', 'Vietnam':   '704', 'Canada':  '124',
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
    spinning: true, animFrame: null, dashOffset: 0, loaded: false,
  });
  const lanesRef = React.useRef(lanes);
  React.useEffect(() => { lanesRef.current = lanes; }, [lanes]);
  const [loaded, setLoaded] = React.useState(false);
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

    function tick() {
      s.animFrame = requestAnimationFrame(tick);

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

      const proj = d3.geoOrthographic()
        .scale(size / 2 - 6)
        .translate([size / 2, size / 2])
        .rotate([s.rotation[0], s.rotation[1], 0])
        .clipAngle(90);
      const path = d3.geoPath(proj, ctx);
      const W = size, H = size;

      ctx.clearRect(0, 0, W, H);

      // Sphere glow shadow
      const grad = ctx.createRadialGradient(W*0.42, H*0.38, W*0.05, W/2, H/2, W/2-6);
      grad.addColorStop(0, '#F0F7FF');
      grad.addColorStop(1, '#DBEAFE');
      ctx.beginPath(); path({type:'Sphere'});
      ctx.fillStyle = grad; ctx.fill();
      ctx.strokeStyle = '#BFDBFE'; ctx.lineWidth = 1; ctx.stroke();

      // Graticule
      ctx.beginPath(); path(d3.geoGraticule().step([30,30])());
      ctx.strokeStyle = 'rgba(59,130,246,0.07)'; ctx.lineWidth = 0.5; ctx.stroke();

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
          ctx.fillStyle = isHl ? 'rgba(59,130,246,0.48)' : '#E2E8F0';
          ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.4; ctx.stroke();
        });
      }

      // Route arc
      const sel = selectedRef.current;
      if (sel) {
        const lane = lanesRef.current.find(l => l.id === sel);
        if (lane) {
          const arc = { type:'LineString', coordinates:[lane.coords[0], lane.coords[1]] };
          // Glow
          ctx.beginPath(); path(arc);
          ctx.strokeStyle = 'rgba(59,130,246,0.2)'; ctx.lineWidth = 7;
          ctx.setLineDash([]); ctx.stroke();
          // Animated dash
          ctx.beginPath(); path(arc);
          ctx.strokeStyle = '#3B82F6'; ctx.lineWidth = 2.5;
          ctx.setLineDash([8,4]); ctx.lineDashOffset = -s.dashOffset; ctx.stroke();
          ctx.setLineDash([]);

          // Endpoint dots + pulse
          lane.coords.forEach(coord => {
            const visible = d3.geoDistance(coord, [-s.rotation[0]*Math.PI/180, -s.rotation[1]*Math.PI/180]) < Math.PI/2;
            if (!visible) return;
            const [px, py] = proj(coord) || [];
            if (px == null) return;
            // Pulse ring
            const pr = 7 + (s.dashOffset % 12) * 0.9;
            const alpha = Math.max(0, 0.45 - (s.dashOffset % 12) / 26);
            ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI*2);
            ctx.strokeStyle = `rgba(59,130,246,${alpha})`; ctx.lineWidth = 1.5; ctx.stroke();
            // Dot
            ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI*2);
            ctx.fillStyle = '#3B82F6'; ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
          });
        }
      }
    }
    s.animFrame = requestAnimationFrame(tick);
    return () => { if (s.animFrame) cancelAnimationFrame(s.animFrame); };
  }, [loaded, size]);

  return (
    <div style={{position:'relative',width:size,height:size,flexShrink:0}}>
      <canvas ref={canvasRef} style={{display:'block',borderRadius:'50%'}} />
      {!loaded && (
        <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'#EFF6FF',borderRadius:'50%'}}>
          <div style={{fontSize:11,color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif'}}>Loading…</div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { Globe, GLOBE_LANES });
