// --- 1. Stop coordinates (lat, lon) ---
const stopages = {
  agargaon:      [23.777087,           90.380567],
  bubt:          [23.811480,           90.357005],
  duwaripara:    [23.826225,           90.356942],
  'ecb chattor': [23.822415,           90.393328],
  'kalsi bridge':[23.821083,           90.383570],
  mirpur10:      [23.807165,           90.368403],
  mirpur11:      [23.819040,           90.365251],
  mirpur12:      [23.827667,           90.364253],
  mirpur14:      [23.798536,           90.387174],
  prosikha:      [23.809475,           90.361078],
  shyamoli:      [23.774889,           90.365304],
  rainkhola:     [23.80618992726514,   90.35171916943564],
  mirpur1:       [23.798459265373268,  90.35338104692444],
  'mazar road':  [23.783111018359094,  90.34708195900225],
  gabtoli:       [23.783414354299317,  90.34346879007764],
  'amin bazar':  [23.786614933488696,  90.3292504799446],
  hemayetpur:    [23.793526832830306,  90.27107498560746],
};

// --- 2. Predefined route sequences ---
const routes = [
  ['bubt',      'duwaripara', 'mirpur12', 'kalsi bridge',  'ecb chattor'],
  ['bubt',      'prosikha',    'mirpur11', 'mirpur10',      'mirpur14'   ],
  ['bubt',      'mirpur10',    'agargaon', 'shyamoli'                     ],
  ['bubt',      'rainkhola',   'mirpur1',  'mazar road',   'gabtoli', 'amin bazar', 'hemayetpur'],
  ['bubt',      'rainkhola',   'mirpur1',  'shyamoli'                     ],
];



const busInfoModal = document.getElementById('busInfoModal');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const modalBusName  = document.getElementById('modalBusName');
const modalBusVel   = document.getElementById('modalBusVel');
const modalBusETA   = document.getElementById('modalBusETA');

// hide modal on close click
modalCloseBtn.addEventListener('click', () => {
  busInfoModal.style.display = 'none';
});


// Haversine for distance
function hav(a,b,c,d){
  const R=6371, toR=x=>x*Math.PI/180;
  const dLat=toR(c-a), dLon=toR(d-b);
  const h=Math.sin(dLat/2)**2
          + Math.cos(toR(a))*Math.cos(toR(c))
            * Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}
function nearestStop(lat,lon){
  return Object.entries(stopages).reduce((best,[n,pt])=>{
    const d=hav(lat,lon,pt[0],pt[1]);
    return d<best.d?{d,name:n}:best;
  },{d:Infinity,name:null}).name;
}

// --- 2. Fetch wrappers ---
async function fetchOsrm(coords, profile='driving'){
  const s=coords.map(c=>`${c[1]},${c[0]}`).join(';'),
        url=`https://router.project-osrm.org/route/v1/${profile}/${s}?overview=full&geometries=geojson`,
        res=await fetch(url), j=await res.json();
  return j.routes[0].geometry.coordinates.map(p=>[p[1],p[0]]);
}
async function fetchOsrmRaw(coords, profile='driving'){
  const s=coords.map(c=>`${c[1]},${c[0]}`).join(';'),
        url=`https://router.project-osrm.org/route/v1/${profile}/${s}?overview=false&geometries=geojson`,
        res=await fetch(url), j=await res.json();
  return j.routes[0];
}
async function fetchBus(busId){
  const res=await fetch(`/api/${busId}`);
  if(!res.ok) throw new Error(`Fetch ${busId} failed: ${res.status}`);
  return res.json();
}

// --- 3. Map Setup ---
const map=L.map('map').setView([23.81,90.37],13);
const baseLayers={
  osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}),
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19})
};
baseLayers.osm.addTo(map);
window.addEventListener('resize', () => {
  // give the browser a moment to recalc layout
  setTimeout(() => map.invalidateSize(), 250);
});
document.getElementById('mapTypeSelect').addEventListener('change',e=>{
  Object.values(baseLayers).forEach(l=>map.removeLayer(l));
  baseLayers[e.target.value].addTo(map);
});

// --- 4. Icons & Fixed Markers ---
const userIcon=L.icon({iconUrl:'https://cdn-icons-png.flaticon.com/128/3710/3710297.png',iconSize:[60,60],iconAnchor:[20,40]});
const stopIcon=L.icon({iconUrl:'https://github.com/TheZeroHz/bubtvts/blob/main/frontend/icon/bus/busstop.png?raw=true',iconSize:[80,80],iconAnchor:[20,40]});
const uniIcon =L.icon({iconUrl:'https://cdn-icons-png.flaticon.com/128/8074/8074800.png',iconSize:[60,60],iconAnchor:[30,60]});
const destIcon=L.icon({iconUrl:'https://cdn-icons-png.flaticon.com/128/1694/1694364.png',iconSize:[50,50],iconAnchor:[25,50]});

Object.entries(stopages).forEach(([name,coords])=>{
  const icon=name==='bubt'?uniIcon:stopIcon;
  L.marker(coords,{icon})
   .addTo(map)
   .bindPopup(name)
   .bindTooltip(name,{
     permanent:true,
     direction:'top',
     offset:[0, name==='bubt'? -60:-40],
     className:'marker-label'
   });
});

// --- 5. Geolocation ---
let userLat,userLon,userMarker;
async function showMyLocation(){
  if(!navigator.geolocation) return alert('No geolocation');
  navigator.geolocation.getCurrentPosition(p=>{
    userLat=p.coords.latitude; userLon=p.coords.longitude;
    if(userMarker) map.removeLayer(userMarker);
    userMarker=L.marker([userLat,userLon],{icon:userIcon})
      .addTo(map)
      .bindTooltip('You',{permanent:true,direction:'top',offset:[0,-40],className:'marker-label'})
      .openPopup();
    map.setView([userLat,userLon],14);
  },()=>alert('Unable to get location'));
}
document.getElementById('locBtn').addEventListener('click',showMyLocation);
map.whenReady(showMyLocation);

// --- 6. Static Route (dotted) ---
let selectedLegs=[];
let destMarker, busLegs=[], walkLegs=[];
document.getElementById('routeSelect').addEventListener('change',async e=>{
  // clear dynamic & dest/search first
  if(destMarker){ map.removeLayer(destMarker); destMarker=null; }
  if(window.searchMarker){ map.removeLayer(window.searchMarker); window.searchMarker=null; }
  busLegs.forEach(l=>map.removeLayer(l)); busLegs=[];
  walkLegs.forEach(l=>map.removeLayer(l)); walkLegs=[];

  // then clear static
  selectedLegs.forEach(l=>map.removeLayer(l)); selectedLegs=[];
  const idx=e.target.value;
  if(idx===""||isNaN(idx)){
    document.getElementById('infoBar').textContent="Route info will appear here.";
    return;
  }
  const seq=routes[+idx];
  for(let i=0;i<seq.length-1;i++){
    const A=stopages[seq[i]], B=stopages[seq[i+1]],
          path=await fetchOsrm([A,B],'driving'),
          leg=L.polyline(path,{color:'#ff3300',weight:4,dashArray:'5,12'}).addTo(map);
    selectedLegs.push(leg);
  }
  if(selectedLegs.length) map.fitBounds(L.featureGroup(selectedLegs).getBounds());
  document.getElementById('infoBar').textContent="Route: "+seq.join(" → ");
});

// --- 7. Dynamic Routing ---
async function findBestRoute(lat,lon){
  // clear static
  selectedLegs.forEach(l=>map.removeLayer(l)); selectedLegs=[];
  // clear previous
  if(destMarker){ map.removeLayer(destMarker); destMarker=null; }
  busLegs.forEach(l=>map.removeLayer(l)); busLegs=[];
  walkLegs.forEach(l=>map.removeLayer(l)); walkLegs=[];

  if(isNaN(lat)||isNaN(lon)) return alert('Enter valid destination');
  destMarker=L.marker([lat,lon],{icon:destIcon})
    .addTo(map)
    .bindTooltip('Destination',{permanent:true,direction:'top',offset:[0,-50],className:'marker-label'})
    .openPopup();

  const entry=nearestStop(userLat,userLon), exit=nearestStop(lat,lon);
  let plan=[];
  const direct=routes.find(r=>r.includes(entry)&&r.includes(exit));
  if(direct){
    plan.push({from:entry,to:exit});
  } else {
    let best={score:Infinity,transfer:null};
    routes.forEach(rA=>{
      if(!rA.includes(entry)) return;
      routes.forEach(rB=>{
        if(!rB.includes(exit)) return;
        rA.filter(s=>rB.includes(s)).forEach(t=>{
          const sc=hav(userLat,userLon,...stopages[t])
                   +hav(stopages[t][0],stopages[t][1],lat,lon);
          if(sc<best.score) best={score:sc,transfer:t};
        });
      });
    });
    plan.push({from:entry,to:best.transfer},{from:best.transfer,to:exit});
  }

  // bus legs
  for(const seg of plan){
    const path=await fetchOsrm([stopages[seg.from],stopages[seg.to]],'driving'),
          line=L.polyline(path,{color:'red',weight:5,dashArray:'5,12'}).addTo(map);
    busLegs.push(line);
  }

  // walk to boarding
  const boardPt=stopages[plan[0].from], dBoard=hav(userLat,userLon,...boardPt);
  if(dBoard>0.05){
    const pts=busLegs[0].getLatLngs().map(ll=>[ll.lat,ll.lng]);
    let bestPt=pts[0], bd=dBoard;
    pts.forEach(p=>{ const d=hav(p[0],p[1],userLat,userLon); if(d<bd){bd=d;bestPt=p;} });
    const w=await fetchOsrm([[userLat,userLon],bestPt],'foot'),
          wl=L.polyline(w,{className:'blink',weight:4}).addTo(map);
    walkLegs.push(wl);
  }

  // walk from alight
  const last=busLegs[busLegs.length-1];
  const pts2=last.getLatLngs().map(ll=>[ll.lat,ll.lng]);
  const final=stopages[plan[plan.length-1].to], dAl=hav(lat,lon,...final);
  if(dAl>0.05){
    let alpt=pts2[0], bd=dAl;
    pts2.forEach(p=>{ const d=hav(p[0],p[1],lat,lon); if(d<bd){bd=d;alpt=p;} });
    const w2=await fetchOsrm([alpt,[lat,lon]],'foot'),
          w2l=L.polyline(w2,{className:'blink',weight:4}).addTo(map);
    walkLegs.push(w2l);
  }

  map.fitBounds(busLegs[0].getBounds());
  const info=plan.map((s,i)=>(i===0?`Board at ${s.from}`:`Then from ${s.from} to ${s.to}`)).join(' → ');
  document.getElementById('infoBar').textContent=`Entry: ${entry} — Exit: ${exit} — ${plan.length} segment(s) — ${info}`;
}

map.on('click',e=>findBestRoute(e.latlng.lat,e.latlng.lng));
document.getElementById('routeBtn').addEventListener('click',()=>{
  const lat=parseFloat(document.getElementById('destLat').value),
        lon=parseFloat(document.getElementById('destLon').value);
  findBestRoute(lat,lon);
});

// --- 8. Address Search ---
document.getElementById('searchBtn').addEventListener('click',async ()=>{
  const q=document.getElementById('searchName').value.trim();
  if(!q) return alert('Type a place name');
  const res=await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`);
  const js=await res.json();
  if(!js.length) return alert(`No location for "${q}"`);
  const {lat,lon,display_name}=js[0];
  if(window.searchMarker) map.removeLayer(window.searchMarker);
  window.searchMarker=L.marker([+lat,+lon],{icon:destIcon})
    .addTo(map)
    .bindPopup(display_name)
    .bindTooltip(display_name,{permanent:true,direction:'top',offset:[0,-50],className:'marker-label'})
    .openPopup();
  findBestRoute(+lat,+lon);
});

// --- 9. Bus Icons & Multi-Bus Polling ---
const busIconPaths = {
  N:  'https://raw.githubusercontent.com/TheZeroHz/bubtvts/main/frontend/icon/bus/N.png',
  NE: 'https://raw.githubusercontent.com/TheZeroHz/bubtvts/main/frontend/icon/bus/NE.png',
  E:  'https://raw.githubusercontent.com/TheZeroHz/bubtvts/main/frontend/icon/bus/E.png',
  SE: 'https://raw.githubusercontent.com/TheZeroHz/bubtvts/main/frontend/icon/bus/SE.png',
  S:  'https://raw.githubusercontent.com/TheZeroHz/bubtvts/main/frontend/icon/bus/S.png',
  SW: 'https://raw.githubusercontent.com/TheZeroHz/bubtvts/main/frontend/icon/bus/SW.png',
  W:  'https://raw.githubusercontent.com/TheZeroHz/bubtvts/main/frontend/icon/bus/W.png',
  NW: 'https://raw.githubusercontent.com/TheZeroHz/bubtvts/main/frontend/icon/bus/NW.png'
};
const busIcons={};

function makeIcon(url,scale=0.04){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      const w=img.width*scale, h=img.height*scale;
      resolve(L.icon({iconUrl:url,iconSize:[w,h],iconAnchor:[w/2,h]}));
    };
    img.onerror=reject;
    img.src=url;
  });
}

async function preloadBusIconsAndStart(){
  await Promise.all(Object.entries(busIconPaths).map(([dir,url])=>
    makeIcon(url).then(ic=>busIcons[dir]=ic)
  ));
}
preloadBusIconsAndStart();

const busMarkers={}, busTraces={}, traceLines={};

function startBusPolling(busId) {
  // 1. Clear any existing polling interval for this bus
  if (traceLines[busId]?.interval) {
    clearInterval(traceLines[busId].interval);
  }
  // 2. Reset trace data
  busTraces[busId] = [];
  traceLines[busId] = {};

  // 3. Start new polling interval
  traceLines[busId].interval = setInterval(async () => {
    const { lat: bLat, long: bLon, rot } = await fetchBus(busId);
    const icon = busIcons[rot] || busIcons['N'];

    // Create marker if it doesn't exist yet
    if (!busMarkers[busId]) {
      busMarkers[busId] = L.marker([bLat, bLon], { icon })
        .addTo(map)
        .bindTooltip(busId, {
          permanent: true,
          className: 'marker-label'
        });

      // Enable smooth gliding on subsequent moves
      busMarkers[busId]._icon.style.transition = 'transform 0.5s linear';

    } else {
      // Move existing marker (will animate thanks to CSS transition)
      busMarkers[busId]
        .setLatLng([bLat, bLon])
        .setIcon(icon);
    }

    // Append to trace and draw/update polyline
    busTraces[busId].push([bLat, bLon]);
    if (!traceLines[busId].line) {
      traceLines[busId].line = L.polyline(busTraces[busId], {
        color: 'blue',
        weight: 6,
        dashArray: '4,0'
      }).addTo(map);
    } else {
      traceLines[busId].line.setLatLngs(busTraces[busId]);
    }
  }, 2000);
}


// --- Track‐Bus click handler with modal wiring ---
document.getElementById('trackBtn').addEventListener('click', async () => {
  const busId = document.getElementById('trackRouteSelect').value;
  const etaEl = document.getElementById('etaInfo');
  etaEl.textContent = '';

  // Ensure we have location & a selection
  if (!userLat || !userLon) {
    return alert('Please click 🔎 My Location first.');
  }
  if (!busId) {
    return etaEl.textContent = 'Please select a bus.';
  }

  // Start smooth‐glide polling
  startBusPolling(busId);

  // Fetch everything: name, vel, coords, direction
  const { name, vel, lat: bLat, long: bLon, dir } = await fetchBus(busId);

  // Zoom to the bus
  map.flyTo([bLat, bLon], 16);

  // Compute ETA to your nearest stop
  const [latStop, lonStop] = stopages[ nearestStop(userLat, userLon) ];
  const raw = await fetchOsrmRaw([[bLat, bLon], [latStop, lonStop]], 'driving');
  const mins = Math.ceil(raw.duration / 60);
  const etaTime = new Date(Date.now() + mins * 60000)
                    .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // --- SHOW THE MODAL ---
  document.getElementById('modalBusName').textContent = name;
  document.getElementById('modalBusVel').textContent  = vel.toFixed(1);
  document.getElementById('modalBusETA').textContent  = `${etaTime} (~${mins} min)`;
  document.getElementById('busInfoModal').style.display = 'flex';

  // Also update inline ETA if you like
  etaEl.textContent = `ETA: ~${mins} min`;
});


document.getElementById('modalCloseBtn').addEventListener('click', () => {
  document.getElementById('busInfoModal').style.display = 'none';
});
