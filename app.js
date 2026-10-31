const $=id=>document.getElementById(id),team=[{number:'21',name:'강병휘',color:'#baff41'},{number:'55',name:'신우진',color:'#58caff'},{number:'56',name:'황용섭',color:'#ffb35b'},{number:'85',name:'윤성로',color:'#c999ff'}];
let state=null,onlyTeam=false,selected=null;
let lastHttpSuccess=0,failedPolls=0;
function serverNow(){return state?state.now+Math.max(0,performance.now()-lastHttpSuccess):Date.now()}
// Display-only buffer; raw recordings and sensor values are never interpolated.
const positionTracks=new Map();
let motionSession=null,motionBufferMs=600,minTransportOffset=Infinity,playhead=0,lastAnimationAt=0;
function interpolatePosition(samples,t){
 if(!samples?.length)return null;
 if(t<=samples[0].t)return samples[0];
 for(let i=1;i<samples.length;i++){
  const a=samples[i-1],b=samples[i];if(t>b.t)continue;
  const dt=b.t-a.t;
  const metres=Math.hypot((b.lat-a.lat)*.011132,(b.lon-a.lon)*.00886);
  // Never animate across a long outage or an implausible GPS jump.
  if(dt<=0||dt>1500||metres>Math.max(30,dt*.12))return a;
  const f=Math.max(0,Math.min(1,(t-a.t)/dt));
  return {lat:a.lat+(b.lat-a.lat)*f,lon:a.lon+(b.lon-a.lon)*f};
 }
 return samples.at(-1); // Hold the last observation; no extrapolation.
}
function ingestPositions(next){
 const now=performance.now(),session=next.session?.id;
 if(session!==motionSession){positionTracks.clear();motionSession=session;playhead=0;minTransportOffset=Infinity;}
 for(const c of next.cars){
  if(!c.data||!Number.isFinite(c.data.lat)||!Number.isFinite(c.data.lon))continue;
  let samples=positionTracks.get(c.serial);
  if(!samples){samples=[];positionTracks.set(c.serial,samples);}
  const points=c.positions?.length?c.positions:[[c.source_ms,c.data.lat,c.data.lon,c.received_ms]];
  for(const [t,lat,lon,received] of points){
    if(!Number.isFinite(t)||!Number.isFinite(lat)||!Number.isFinite(lon))continue;
    const last=samples.at(-1);if(last&&t<=last.t)continue;
    samples.push({t,lat,lon});
    if(Number.isFinite(received)&&received>=t)minTransportOffset=Math.min(minTransportOffset,received-t);
  }
  while(samples.length>2&&samples[1].t<(samples.at(-1).t-16000))samples.shift();
  if(c.focus){const previous=state?.cars.find(old=>old.serial===c.serial)?.history??[];const merged=[...previous];for(const h of c.history??[])if(!merged.length||h.t>merged.at(-1).t)merged.push(h);c.history=merged.slice(-150);}
 }
 const ages=next.cars.filter(c=>Number.isFinite(c.source_ms)&&next.now-c.received_ms<2500).map(c=>Math.max(0,next.now-c.source_ms-(Number.isFinite(minTransportOffset)?minTransportOffset:0))).sort((a,b)=>a-b);
 const required=ages.length?ages[Math.floor((ages.length-1)*.75)]+150:350;
 motionBufferMs+=.15*(Math.max(350,Math.min(1400,required))-motionBufferMs);
}
const fmt=(v,n=0)=>Number.isFinite(v)?v.toFixed(n):'—',clamp=(v,max)=>Math.max(0,Math.min(max,v??0));
function lap(ms){if(!Number.isFinite(ms)||ms<=0)return'—';return Math.floor(ms/60000)+':'+(ms%60000/1000).toFixed(3).padStart(6,'0')}
for(const c of team){const card=document.createElement('article');card.className='driver';card.id='driver-'+c.number;card.style.setProperty('--accent',c.color);card.innerHTML=`<div class="driver-head"><span class="driver-number">${c.number}</span><div class="driver-identity"><h3>${c.name}</h3><small>ZIC UNITED · N1</small></div><span class="age">WAITING</span></div><div class="speed-row"><span class="speed">—</span><span class="speed-unit">KM/H</span><svg class="spark" viewBox="0 0 120 44" preserveAspectRatio="none"><path fill="none" stroke="${c.color}" stroke-width="1.8"/></svg></div><div class="rpm-row"><span>ENGINE RPM</span><div><strong class="rpm">—</strong> rpm</div></div><div class="rpm-bar"><i></i></div><div class="pedals"><div><div class="pedal-label">THROTTLE <b class="throttle">—</b></div><div class="pedal-bar throttle"><i></i></div></div><div><div class="pedal-label">BRAKE <b class="brake">—</b></div><div class="pedal-bar brake"><i></i></div></div></div><div class="sensors"><div class="sensor"><small>STEERING</small><b class="steer">—</b><em>°</em></div><div class="sensor"><small>COOLANT</small><b class="coolant">—</b><em>℃</em></div><div class="sensor"><small>OIL TEMP</small><b class="oil">—</b><em>℃</em></div></div><div class="driver-bottom"><div class="rank">리더보드<b>—</b></div><div>최근 랩<b class="last-lap">—</b></div><div>최고 랩<b class="best-lap">—</b></div><div>GEAR<b class="gear">—</b></div></div>`;card.onclick=()=>{selected=selected===c.number?null:c.number;draw()};$('cards').append(card)}
const canvas=$('map'),ctx=canvas.getContext('2d'),image=new Image();image.src='./track.svg';image.onload=()=>draw();
function draw(){
 if(!state?.track)return;const r=canvas.getBoundingClientRect(),dpr=devicePixelRatio||1;
 if(canvas.width!==Math.round(r.width*dpr)||canvas.height!==Math.round(r.height*dpr)){canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr)}
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,r.width,r.height);
 const pad=25,iw=3254,ih=1430,scale=Math.min((r.width-2*pad)/iw,(r.height-140)/ih),w=iw*scale,h=ih*scale,x=(r.width-w)/2,y=(r.height-h)/2+25;
 if(image.complete&&image.naturalWidth){ctx.globalAlpha=.85;ctx.drawImage(image,x,y,w,h);ctx.globalAlpha=1}
 const track=state.track,now=serverNow(),displayAt=playhead;const mapPoint=c=>{const p=interpolatePosition(positionTracks.get(c.serial),displayAt)??c.data;return [x+(p.lon-track.track_ref_top_left_lon)/(track.track_ref_bot_right_lon-track.track_ref_top_left_lon)*w,y+(p.lat-track.track_ref_top_left_lat)/(track.track_ref_bot_right_lat-track.track_ref_top_left_lat)*h]};
 const cars=state.cars.filter(c=>c.data&&Number.isFinite(c.data.lat)&&Number.isFinite(c.data.lon)&&Math.abs(c.data.lat)>1&&Math.abs(c.data.lon)>1).sort((a,b)=>Number(a.focus)-Number(b.focus));
 $('map-empty').textContent=cars.length?'': '실시간 위치를 연결하고 있습니다';$('car-count').textContent=cars.length;
 for(const c of cars){if(onlyTeam&&!c.focus)continue;let [cx,cy]=mapPoint(c);if(cx<0||cx>r.width||cy<0||cy>r.height)continue;
 const stale=now-c.received_ms>2500;
 ctx.globalAlpha=stale?.25:.85;
 ctx.fillStyle=c.focus?c.color:'#8ca0ae';
 ctx.beginPath();ctx.arc(cx,cy,3.4,0,Math.PI*2);ctx.fill();
 ctx.font='9px system-ui';ctx.fillText(c.number,cx+5,cy-5);
 }ctx.globalAlpha=1;
}
function render(){if(!state)return;const now=serverNow(),age=now-state.last_frame_ms;
 $('map-quality').textContent='지도: GPS 시각 기준 보간 · 적응 버퍼 '+fmt(motionBufferMs/1000,2)+'초';
 const transportLost=failedPolls>=2&&performance.now()-lastHttpSuccess>5000;
 $('connection').className='pill '+(age<2500&&!state.catching_up&&!transportLost?'live':'stale');$('connection').textContent=transportLost?'화면 재연결 중':state.catching_up?'SYNCING':age<2500?'LIVE':'수집 데이터 지연';
 $('session').textContent=state.session?.session_name??'LIVE';$('class-label').textContent=state.session?.session_name?.match(/N\d+(?:-[A-Z])?/i)?.[0]??'HNF';$('record-status').textContent=state.recording?'내 기기에 기록 중':'브라우저 직접 수신 중';$('last-update').textContent=state.last_frame_ms?'최근 수신 '+fmt(Math.max(0,age)/1000,1)+'초 전':'데이터 수신 대기';
 const nf=state.official_feed;$('feed-note').textContent=nf&&nf.class?.match(/\bN\d\b/i)?.[0]?.toUpperCase()===state.session?.session_name?.match(/\bN\d\b/i)?.[0]?.toUpperCase()?'순위: JP-RACE 리더보드 주행 기준 · '+nf.class+' · '+nf.session:'현재 경기 순위 수신 대기 · '+(nf?'현재 순위 피드: '+nf.class:'GPS·차량 센서는 실시간 표시');
 let active=0;
 for(const t of team){const card=$('driver-'+t.number),c=state.cars.find(c=>c.number===t.number&&c.focus);if(!c?.data){card.classList.add('stale');card.querySelector('.age').textContent='현재 경기 미출전';for(const q of ['.speed','.rpm','.throttle','.brake','.steer','.coolant','.oil','.gear','.rank b','.last-lap','.best-lap'])card.querySelector(q).textContent='—';for(const bar of card.querySelectorAll('.rpm-bar i,.pedal-bar i'))bar.style.width='0%';card.querySelector('.spark path').setAttribute('d','');continue;}const elapsed=now-c.received_ms,fresh=elapsed<2500;if(fresh)active++;card.classList.toggle('stale',!fresh);
 const set=(q,v)=>card.querySelector(q).textContent=v,can=k=>c.can?.[k]?.value??null;
 set('.age',fresh?'LIVE · '+Math.round(Math.max(0,elapsed))+' ms':(elapsed<10000?'DELAY · ':'WAIT · ')+fmt(elapsed/1000,1)+'s');card.querySelector('.age').className='age '+(fresh?'live':'');
 card.title=fresh?'최근 수신한 차량 데이터':'차량 데이터 지연: 마지막 수신값을 표시합니다. 위치를 예측해 움직이지 않습니다.';
 set('.speed',fmt(c.data.speed));const rpm=can('_sig_EngRPM'),throttle=can('_sig_ThrPos'),brake=can('_sig_BrkPres');set('.rpm',fmt(rpm));set('.throttle',Number.isFinite(throttle)?fmt(clamp(throttle,100))+'%':'—');set('.brake',Number.isFinite(brake)?fmt(Math.max(0,brake),1)+' bar':'—');
 card.querySelector('.rpm-bar i').style.width=clamp(rpm/8000*100,100)+'%';card.querySelector('.pedal-bar.throttle i').style.width=clamp(throttle,100)+'%';card.querySelector('.pedal-bar.brake i').style.width=clamp(brake/150*100,100)+'%';
 set('.steer',fmt(can('_sig_AngleSteer'),1));set('.coolant',fmt(can('_sig_EngCoolTemp'),1));set('.oil',fmt(can('_sig_EngOilTemp'),1));set('.gear',fmt(can('_sig_Gear')));
 const validRank=c.rank&&now-c.rank.received_ms<10000;set('.rank b',c.live_rank?.position?'P'+c.live_rank.position:'—');set('.last-lap',lap(validRank?c.rank.last_ms:null));set('.best-lap',lap(validRank?c.rank.best_ms:null));
 const hist=c.history??[];if(hist.length>1){const span=Math.max(30,...hist.map(p=>p.speed??0)),d=hist.map((p,i)=>(i?'L':'M')+(i/(hist.length-1)*120).toFixed(1)+','+(42-clamp(p.speed/span,1)*38).toFixed(1)).join(' ');card.querySelector('.spark path').setAttribute('d',d)}
 }$('team-status').textContent=active+'/4 LIVE'+(active<4?' · '+(4-active)+'대 지연':'');
}
function acceptState(next){ingestPositions(next);state=next;lastHttpSuccess=performance.now();failedPolls=0;render()}
let directController=null;
window.startDirectFeed(acceptState,status=>{if(status!=='connected')failedPolls++;if(state)render()}).then(c=>{directController=c;$('record-local').disabled=false}).catch(e=>{$('connection').textContent='연결 오류';$('feed-note').textContent=e.message});
$('record-local').onclick=async()=>{const button=$('record-local');button.disabled=true;try{if(!button.dataset.active){await directController.startRecording();button.dataset.active='1';button.textContent='■ 기록 종료 · 다운로드'}else{const result=await directController.stopRecording();delete button.dataset.active;button.textContent='● 내 기기에 기록';$('record-note').textContent=result.frames+'개 패킷 · 다운로드 시작'}}catch(e){$('record-note').textContent='저장 오류: '+e.message}finally{button.disabled=false}};
$('filter').onclick=()=>{onlyTeam=!onlyTeam;$('filter').textContent=onlyTeam?'우리 팀만':'전체 차량';draw()};$('reset').onclick=()=>{selected=null;onlyTeam=false;$('filter').textContent='전체 차량';draw()};$('fullscreen').onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();
setInterval(()=>{$('clock').textContent=new Date().toLocaleTimeString('en-GB',{timeZone:'Asia/Seoul'});if(state)render()},250);window.addEventListener('resize',draw);
function animateMap(at){
 if(state){const desired=serverNow()-(Number.isFinite(minTransportOffset)?minTransportOffset:0)-motionBufferMs;
  const dt=lastAnimationAt?at-lastAnimationAt:0;
  if(!playhead||dt>2000)playhead=desired;
  else playhead+=Math.max(0,dt)*Math.max(.75,Math.min(1.15,1+(desired-playhead)/1000));
  draw();
 }lastAnimationAt=at;requestAnimationFrame(animateMap)
}requestAnimationFrame(animateMap);
