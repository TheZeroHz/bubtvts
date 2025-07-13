// --- Data & Utils ---
const stopages = {
  agargaon:[23.777087,90.380567], bubt:[23.811480,90.357005],
  duwaripara:[23.826225,90.356942], "ecb chattor":[23.822415,90.393328],
  "kalsi bridge":[23.821083,90.383570], mirpur10:[23.807165,90.368403],
  mirpur11:[23.819040,90.365251], mirpur12:[23.827667,90.364253],
  mirpur14:[23.798536,90.387174], prosikha:[23.809475,90.361078],
  shyamoli:[23.774889,90.365304]
};
const routes = [
  ["bubt","duwaripara","mirpur12","kalsi bridge","ecb chattor"],
  ["bubt","prosikha","mirpur11","mirpur10","mirpur14"],
  ["bubt","mirpur10","agargaon","shyamoli"]
];
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

// --- Fetch wrappers ---
async function fetchOsrm(coords, profile='driving'){
  const s = coords.map(c=>`${c[1]},${c[0]}`).join(';'),
        url = `https://router.project-osrm.org/route/v1/${profile}/${s}?overview=full&geometries=geojson`,
        res = await fetch(url), j = await res.json();
  return j.routes[0].geometry.coordinates.map(p=>[p[1],p[0]]);
}
async function fetchOsrmRaw(coords, profile='driving'){
  const s = coords.map(c=>`${c[1]},${c[0]}`).join(';'),
        url = `https://router.project-osrm.org/route/v1/${profile}/${s}?overview=false&geometries=geojson`,
        res = await fetch(url), j = await res.json();
  return j.routes[0];
}
async function fetchBus1(){
  const r = await fetch('/api/bus1');
  return r.json();
}

// --- Map Setup ---
const map = L.map('map').setView([23.81,90.37],13);
const baseLayers = {
  osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}),
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19}),
  terrain: L.tileLayer('https://stamen-tiles.a.ssl.fastly.net/terrain/{z}/{x}/{y}.jpg',{maxZoom:18})
};
baseLayers.osm.addTo(map);
document.getElementById('mapTypeSelect')
  .addEventListener('change', e=>{
    Object.values(baseLayers).forEach(l=>map.removeLayer(l));
    baseLayers[e.target.value].addTo(map);
  });

// --- Icons & Fixed Markers ---
const userIcon = L.icon({ iconUrl:'https://cdn-icons-png.flaticon.com/512/149/149071.png', iconSize:[40,40], iconAnchor:[20,40] });
const stopIcon = L.icon({ iconUrl:'https://cdn-icons-png.flaticon.com/512/252/252025.png', iconSize:[40,40], iconAnchor:[20,40] });
const uniIcon  = L.icon({ iconUrl:'https://i.imgur.com/KC7Np7H.png', iconSize:[60,60], iconAnchor:[30,60] });
const busIcon  = L.icon({ iconUrl:'https://cdn-icons-png.flaticon.com/512/296/296216.png', iconSize:[50,50], iconAnchor:[25,50] });
const destIcon = L.icon({ iconUrl:'https://cdn-icons-png.flaticon.com/512/684/684908.png', iconSize:[50,50], iconAnchor:[25,50] });

Object.entries(stopages).forEach(([name,coords])=>{
  const icon = name==='bubt' ? uniIcon : stopIcon;
  L.marker(coords, { icon })
    .addTo(map)
    .bindPopup(name)
    .bindTooltip(name, {
      permanent: true,
      direction: 'top',
      offset: [0, -(name==='bubt'?60:40)],
      className: 'marker-label'
    });
});

// --- Geolocation & User Marker ---
let userLat, userLon, userMarker;
async function showMyLocation(){
  if(!navigator.geolocation) return alert('No geolocation');
  navigator.geolocation.getCurrentPosition(p=>{
    userLat=p.coords.latitude; userLon=p.coords.longitude;
    if(userMarker) map.removeLayer(userMarker);
    userMarker = L.marker([userLat,userLon], { icon: userIcon })
      .addTo(map)
      .bindPopup('You')
      .bindTooltip('You', {
        permanent: true,
        direction: 'top',
        offset: [0,-40],
        className: 'marker-label'
      })
      .openPopup();
    map.setView([userLat,userLon],14);
  }, ()=>alert('Unable to get location'));
}
document.getElementById('locBtn').addEventListener('click', showMyLocation);
map.whenReady(showMyLocation);

// --- Static Route Drawer ---
let selectedLegs = [];
document.getElementById('routeSelect')
  .addEventListener('change', async e=>{
    selectedLegs.forEach(l=>map.removeLayer(l));
    selectedLegs = [];
    const idx = e.target.value;
    if(idx===""||isNaN(idx)){
      document.getElementById('infoBar').textContent = "Route info will appear here.";
      return;
    }
    const seq = routes[+idx];
    for(let i=0;i<seq.length-1;i++){
      const A=stopages[seq[i]], B=stopages[seq[i+1]],
            path=await fetchOsrm([A,B],'driving'),
            leg=L.polyline(path,{color:'#ff3300',weight:4}).addTo(map);
      selectedLegs.push(leg);
    }
    if(selectedLegs.length){
      map.fitBounds(L.featureGroup(selectedLegs).getBounds());
    }
    document.getElementById('infoBar').textContent =
      "Route: " + seq.join(" → ");
  });

// --- Dynamic Routing ---
let destMarker, busLegs=[], walkLegs=[];
document.getElementById('routeBtn').addEventListener('click', ()=>{
  const lat=parseFloat(document.getElementById('destLat').value),
        lon=parseFloat(document.getElementById('destLon').value);
  findBestRoute(lat, lon);
});
map.on('click', e=>{
  document.getElementById('destLat').value=e.latlng.lat;
  document.getElementById('destLon').value=e.latlng.lng;
  findBestRoute(e.latlng.lat, e.latlng.lng);
});
async function findBestRoute(lat, lon){
  if(isNaN(lat)||isNaN(lon)) return alert('Enter valid destination');
  [destMarker, ...busLegs, ...walkLegs].forEach(l=>l&&map.removeLayer(l));
  busLegs=[]; walkLegs=[];

  destMarker = L.marker([lat,lon], { icon: destIcon })
    .addTo(map)
    .bindPopup('Destination')
    .bindTooltip('Destination', {
      permanent: true,
      direction: 'top',
      offset: [0,-50],
      className: 'marker-label'
    })
    .openPopup();

  const entry = nearestStop(userLat,userLon),
        exit  = nearestStop(lat,lon);
  let plan = [];
  const direct = routes.find(r=>r.includes(entry)&&r.includes(exit));
  if(direct){
    plan.push({from:entry,to:exit});
  } else {
    let best={score:Infinity};
    routes.forEach(rA=>{
      if(!rA.includes(entry)) return;
      routes.forEach(rB=>{
        if(!rB.includes(exit)) return;
        rA.filter(s=>rB.includes(s)).forEach(t=>{
          const sc = hav(userLat,userLon,...stopages[t])
                     + hav(stopages[t][0],stopages[t][1], lat, lon);
          if(sc<best.score) best={score:sc,transfer:t};
        });
      });
    });
    plan.push({from:entry,to:best.transfer});
    plan.push({from:best.transfer,to:exit});
  }

  for(let seg of plan){
    const path = await fetchOsrm([stopages[seg.from],stopages[seg.to]],'driving'),
          line = L.polyline(path,{color:'#00aaff',weight:5}).addTo(map);
    busLegs.push(line);
  }

  const boardPt = stopages[plan[0].from],
        dBoard  = hav(userLat,userLon,...boardPt);
  if(dBoard>0.05){
    const pts = busLegs[0].getLatLngs().map(ll=>[ll.lat,ll.lng]);
    let bestPt = pts[0], bd = dBoard;
    pts.forEach(p=>{ const d=hav(p[0],p[1],userLat,userLon); if(d<bd){bd=d;bestPt=p;} });
    const w  = await fetchOsrm([[userLat,userLon],bestPt],'foot'),
          wl = L.polyline(w,{className:'blink',weight:4}).addTo(map);
    walkLegs.push(wl);
  }

  const last = busLegs[busLegs.length-1],
        pts2 = last.getLatLngs().map(ll=>[ll.lat,ll.lng]),
        final = stopages[plan.slice(-1)[0].to],
        dAl = hav(lat,lon,...final),
        alpt = dAl>0.05?(() => {
          let bp=pts2[pts2.length-1], bd=dAl;
          pts2.forEach(p=>{ const d=hav(p[0],p[1],lat,lon); if(d<bd){bd=d;bp=p;} });
          return bp;
        })(): final;
  if(dAl>0.05){
    const w2  = await fetchOsrm([alpt,[lat,lon]],'foot'),
          w2l = L.polyline(w2,{className:'blink',weight:4}).addTo(map);
    walkLegs.push(w2l);
  }

  map.fitBounds(busLegs[0].getBounds());
  const info = plan.map((s,i)=>(i===0
    ? `Board at ${s.from}`
    : `Then from ${s.from} to ${s.to}`
  )).join(' → ');
  document.getElementById('infoBar').textContent =
    `Entry: ${entry} — Exit: ${exit} — ${plan.length} segment(s) — ${info}`;
}

// --- Address Search via Nominatim ---
document.getElementById('searchBtn')
  .addEventListener('click', async ()=>{
    const q=document.getElementById('searchName').value.trim();
    if(!q) return alert('Type a place name');
    const url=`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    let res, js;
    try{ res=await fetch(url); js=await res.json(); }
    catch{ return alert('Geocode error'); }
    if(!js.length) return alert(`No location for "${q}"`);
    const {lat,lon,display_name}=js[0],
          fLat=parseFloat(lat), fLon=parseFloat(lon);
    document.getElementById('destLat').value=fLat;
    document.getElementById('destLon').value=fLon;
    if(window.searchMarker) map.removeLayer(window.searchMarker);
    window.searchMarker = L.marker([fLat,fLon],{icon:destIcon})
      .addTo(map)
      .bindPopup(display_name)
      .bindTooltip(display_name, {
        permanent: true,
        direction: 'top',
        offset: [0,-50],
        className: 'marker-label'
      })
      .openPopup();
    findBestRoute(fLat,fLon);
  });

// --- Live Bus Marker & Green Trace ---
let busMarker;
const busTrace = [];
let busTraceLine;
function startBusPolling(){
  setInterval(async ()=>{
    const data = await fetchBus1();
    if(!data) return;
    const { lat, long } = data;

    // move marker
    if(busMarker) map.removeLayer(busMarker);
    busMarker = L.marker([lat,long], { icon: busIcon })
      .addTo(map)
      .bindPopup('Bus 1')
      .bindTooltip('Bus 1', {
        permanent: true,
        direction: 'top',
        offset: [0,-50],
        className: 'marker-label'
      });

    // trace
    busTrace.push([lat,long]);
    if(!busTraceLine) {
      busTraceLine = L.polyline(busTrace, { color:'green', weight:6 }).addTo(map);
    } else {
      busTraceLine.setLatLngs(busTrace);
    }
  }, 2000);
}
startBusPolling();

// --- Track Bus ETA Logic (unchanged) ---
document.getElementById('trackBtn').addEventListener('click', async () => {
  const sel   = document.getElementById('trackRouteSelect').value;
  const etaEl = document.getElementById('etaInfo');
  etaEl.textContent = '';

  if (!userLat || !userLon) {
    return alert('Please click 🔎 My Location first.');
  }
  if (sel !== "0") {
    return etaEl.textContent = 'Select the Bus 1 route.';
  }

  const dataSnapshot = await fetchBus1();
  const { lat: bLat, long: bLon, dir } = dataSnapshot;
  let seq = routes[0].slice();
  const [start, end] = dir.split('->');
  if (seq[0] !== start || seq[seq.length-1] !== end) seq.reverse();

  const myStop  = nearestStop(userLat, userLon);
  const busStop = nearestStop(bLat, bLon);
  if (!seq.includes(myStop)) {
    return etaEl.textContent = 'Bus 1 will not serve your nearest stop.';
  }
  const idxMy  = seq.indexOf(myStop);
  const idxBus = seq.indexOf(busStop);
  if (idxBus > idxMy) {
    return etaEl.textContent = `Bus 1 has already passed ${myStop}.`;
  }

  const [latStop, lonStop] = stopages[myStop];
  const latDelta = 250 / 110574;
  const lonDelta = 250 / (111320 * Math.cos(latStop * Math.PI/180));
  if (
    Math.abs(bLat - latStop) <= latDelta &&
    Math.abs(bLon - lonStop) <= lonDelta
  ) {
    return etaEl.textContent = `Bus 1 is currently within 250 m of ${myStop}.`;
  }

  const raw = await fetchOsrmRaw([[bLat,bLon], [latStop,lonStop]], 'driving');
  const mins = Math.ceil(raw.duration / 60);
  etaEl.textContent = `ETA of Bus 1 to ${myStop}: ~${mins} min`;
});
