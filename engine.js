window.startDirectFeed=async function(onState,onStatus){
class Buffer extends Uint8Array {
 static alloc(n){return new Buffer(n)}
 static from(v){if(typeof v==='string')return new Buffer(new TextEncoder().encode(v));return new Buffer(v instanceof ArrayBuffer?v:v.buffer?v.buffer.slice(v.byteOffset,v.byteOffset+v.byteLength):v)}
 static concat(arr){const out=new Buffer(arr.reduce((n,b)=>n+b.length,0));let i=0;for(const b of arr){out.set(b,i);i+=b.length}return out}
 subarray(a,b){return new Buffer(super.subarray(a,b))}
 toString(encoding){return encoding==='hex'?[...this].map(x=>x.toString(16).padStart(2,'0')).join(''):new TextDecoder().decode(this)}
 copy(target,offset){target.set(this,offset)}
}
for(const [name,fn,size] of [['UInt8','getUint8',1],['Int8','getInt8',1],['UInt16','getUint16',2],['Int16','getInt16',2],['UInt32','getUint32',4],['Int32','getInt32',4],['BigUInt64','getBigUint64',8]]){
 for(const endian of size===1?['']:['LE','BE'])Buffer.prototype['read'+name+endian]=function(pos){return new DataView(this.buffer,this.byteOffset,this.byteLength)[fn](pos,endian==='LE')};
}
Buffer.prototype.writeUInt32BE=function(v,p){new DataView(this.buffer,this.byteOffset,this.byteLength).setUint32(p,v,false)};
Buffer.prototype.writeUInt32LE=function(v,p){new DataView(this.buffer,this.byteOffset,this.byteLength).setUint32(p,v,true)};

let cfg=await (await fetch('./config.json',{cache:'no-store'})).json(),proto=cfg.wsProtocol.packet;
const colors={'21':'#baff41','55':'#58caff','56':'#ffb35b','85':'#c999ff'},cars=new Map();
let raceConfig={raceStartTime:Date.parse(cfg.sessionInfo.race_start_timestamp+'Z'),raceFinishTime:Date.parse(cfg.sessionInfo.race_end_timestamp+'Z'),raceMode:cfg.sessionInfo.race_mode},pending=Buffer.alloc(0),frames=0,lastFrame=0,error=null,official=null,recording=false;
for(const e of cfg.entries)cars.set(e.device_serial,{serial:e.device_serial,number:e.entry_num,name:e.driver_name,team:e.team_name,focus:/\bzic\b/i.test(e.team_name),color:colors[e.entry_num]??'#8393a7',can:{},history:[],lapOffset:e.num_laps_offset??0,positionHistory:[]});
function calculateLiveRanks(all,start,now){
  if(!Number.isFinite(start)||start<=0||start>now)return new Map();
  const moving=all.filter(c=>c.data?.speed>40&&now-c.received_ms<2500);
  if(!moving.length)return new Map();
  const target=Math.min(...moving.map(c=>c.source_ms));
  if(now-target>4000)return new Map();
  const rows=all.filter(c=>c.data&&now-c.received_ms<2500).map(c=>{
    const samples=c.positionHistory??[],a=[...samples].reverse().find(p=>p.t<=target),b=samples.find(p=>p.t>target);
    let pos=a?.pos??c.data.posIdx;
    if(a&&b&&b.t-a.t<=1500&&b.pos>=a.pos)pos=a.pos+(b.pos-a.pos)*(target-a.t)/(b.t-a.t);
    const times=(c.lap_timestamps??[]).filter(t=>t>start&&t<target);
    return {c,laps:times.length+(c.lapOffset??0),pos,time:times.length?times.at(-1)-start:0};
  });
  rows.sort((a,b)=>b.laps-a.laps||b.pos-a.pos||a.time-b.time||Number(a.c.number)-Number(b.c.number));
  return new Map(rows.map((r,i)=>[r.c.serial,{position:i+1,source:'GPS progress estimate',received_ms:now,target_source_ms:target}]));
}

const types={uint8:['readUInt8',1],int8:['readInt8',1],uint16:['readUInt16',2],int16:['readInt16',2],uint32:['readUInt32',4],int32:['readInt32',4],uint64:['readBigUInt64',8]};
function normalizeDriverName(name){return String(name??'').normalize('NFKC').replace(/\s*\(C\)\s*$/i,'').replace(/\s+/g,'').trim();}
function packet(b,received){
  const type=Object.keys(proto).find(k=>Number(proto[k].header.value)===b.readUInt32BE(0));
  if(type==='dataPacket'||type==='dataPacketWithPosIdx'){
    const def=proto[type],v={};
    for(const [key,s] of Object.entries(def.signals)){
      if(key==='signal')continue;
      const t=types[s.type];if(!t||s.bytePos+t[1]>b.length)continue;
      const val=b[t[0]+(t[1]===1?'':s.isLittleEndian?'LE':'BE')](s.bytePos);
      v[key]=key==='deviceSerial'?BigInt(val).toString(16).padStart(16,'0'):Number(val)*(s.scale??1)+(s.offset??0);
    }
    let c=cars.get(v.deviceSerial);
    if(!c)return; // Only show vehicles identified in the current session entry list.
    const entry=cfg.entries.find(e=>e.device_serial===v.deviceSerial),dbc=cfg.dbcList[String(entry?.dbc_id)];
    if(dbc&&v.numSignals&&def.signals.signal){
      for(let i=0;i<v.numSignals;i++){
        const pos=def.signals.signal.pos+i*6;if(pos+6>b.length)break;
        const name=cfg.signalList[b.readUInt16LE(pos)],s=dbc.signals.find(s=>s.signalName===name);
        if(!s)continue;
        const raw=b.readInt32LE(pos+2);let value=raw*s.scale+s.offset;
        if(name==='_sig_BrkPres'&&value>60000*s.scale)value=0;
        c.can[name]={value,unit:s.unit,raw,received_ms:received};
      }
    }
    const source=v.timestampH*4294967296+v.timestampL;
    c.data=v;c.source_ms=source;c.received_ms=received;
    c.positionHistory??=[];
    if(!c.positionHistory.length||source>c.positionHistory.at(-1).t)c.positionHistory.push({t:source,pos:v.posIdx,lat:v.lat,lon:v.lon,speed:v.speed,received_ms:received});
    while(c.positionHistory.length>80)c.positionHistory.shift();
    if(c.focus){
      if(!c.history.length||source-c.history.at(-1).t>=200)c.history.push({t:source,speed:v.speed});
      while(c.history.length>150)c.history.shift();
    }
  }else if(type==='lapHistory'){
    const p=proto[type],serial=b.subarray(p.deviceSerial.pos,p.deviceSerial.pos+8).toString('hex'),c=cars.get(serial);
    if(!c)return;
    const count=b.readUInt32LE(p.numLaps.pos),times=[Number(b.readBigUInt64LE(p.baseTimestamp.pos))];
    for(let i=0;i<count;i++)if(p.lapsTimestamp.pos+4*i+4<=b.length)times.push(times[0]+b.readUInt32LE(p.lapsTimestamp.pos+4*i));
    const laps=times.slice(1).map((t,i)=>t-times[i]).filter(v=>v>0);
    c.laps={count,last_ms:laps.at(-1)??null,best_ms:laps.length?Math.min(...laps):null,source:'JP-RACE lapHistory'};
    c.lap_timestamps=times;
  }else if(type==='jsonPacket'){
    const d=JSON.parse(b.subarray(proto[type].jsonString.pos).toString().replace(/\0+$/,''));
    if(d.cmdType==='sessionConfig'&&d.sessionId===cfg.sessionInfo.id)raceConfig=d;
    if(d.cmdType==='rmResult'){
      official={class:d.ClassName,session:d.SessionName,received_ms:received};
      // Car numbers repeat between classes: only explicitly N1-labelled ranks qualify.
      if((d.ClassName??'').match(/\bN\d\b/i)?.[0]?.toUpperCase()===(cfg.sessionInfo.session_name??'').match(/\bN\d\b/i)?.[0]?.toUpperCase()){
        for(const c of cars.values()){const r=d.ranking?.find(r=>Number(r.RacerNumber)===Number(c.number)&&normalizeDriverName(r.RacerName)===normalizeDriverName(c.name));if(r)c.rank={position:r.RacePosition,last_ms:r.LastLap,best_ms:r.BestLapTime,laps:r.Laps,received_ms:received,class:d.ClassName};}
      }
    }
  }
}
function frame(b,received){
  pending=Buffer.concat([pending,b]);
  while(pending.length>=8){
    if(!Object.values(proto).some(p=>Number(p.header.value)===pending.readUInt32BE(0))){pending=pending.subarray(1);continue;}
    const len=pending.readUInt32LE(4)+8;if(len>32*1024*1024){pending=Buffer.alloc(0);throw Error('Invalid packet length');}
    if(pending.length<len)break;
    const p=pending.subarray(0,len);pending=pending.subarray(len);handleControl(p);packet(p,received);
  }
}

function snapshot(compact,positionCursor=null){const now=Date.now();
  const liveRanks=calculateLiveRanks([...cars.values()],raceConfig?.raceStartTime,now);
  for(const c of cars.values())c.live_rank=liveRanks.get(c.serial)??null;
  const sensorNames=['_sig_EngRPM','_sig_ThrPos','_sig_BrkPres','_sig_AngleSteer','_sig_EngCoolTemp','_sig_EngOilTemp','_sig_Gear'];
  const payloadCars=compact?[...cars.values()].map(c=>{
    const since=positionCursor?.get(c.serial)??0;
    const positions=(c.positionHistory??[]).filter(p=>p.t>since).slice(-60).map(p=>[p.t,p.lat,p.lon,p.received_ms]);
    if(positions.length)positionCursor?.set(c.serial,positions.at(-1)[0]);
    return {serial:c.serial,number:c.number,name:c.name,focus:c.focus,color:c.color,data:c.data?{lat:c.data.lat,lon:c.data.lon,speed:c.data.speed}:null,source_ms:c.source_ms,received_ms:c.received_ms,positions,...(c.focus?{can:Object.fromEntries(sensorNames.filter(k=>c.can[k]).map(k=>[k,{value:c.can[k].value,received_ms:c.can[k].received_ms}])),history:positionCursor?c.history.slice(-2):c.history,rank:c.rank,live_rank:c.live_rank}:{})};
  }):[...cars.values()];
  return {now,last_frame_ms:lastFrame,frames,catching_up:false,recording:recording,capture_end:null,track:cfg?.trackInfo,session:cfg?.sessionInfo,official_feed:official,cars:payloadCars,error};
}
let socket,clientId='',subscribed=false,retry=0,reconnectTimer,closed=false;
const cursor=new Map();
function send(cmd){if(socket?.readyState!==WebSocket.OPEN)return;const text=Buffer.from(JSON.stringify(cmd)),b=Buffer.alloc(text.length+10);b.writeUInt32BE(Number(proto.jsonPacket.header.value),proto.jsonPacket.header.pos);b.writeUInt32LE(text.length,proto.jsonPacket.payloadLength.pos);text.copy(b,proto.jsonPacket.jsonString.pos);socket.send(b)}
function handleControl(b){const header=b.readUInt32BE(0);if(header===Number(proto.setClientId.header.value)){clientId=b.subarray(proto.setClientId.clientId.pos,proto.setClientId.clientId.pos+8).toString('hex');send({clientId,cmdType:'reqTimeSync',timestamp1:Date.now(),timestamp2:null,timestamp3:null})}else if(header===Number(proto.jsonPacket.header.value)){const d=JSON.parse(b.subarray(proto.jsonPacket.jsonString.pos).toString().replace(/\0+$/,''));if(d.cmdType==='reqTimeSync'&&!subscribed){subscribed=true;send({clientId,cmdType:'reqSvc',serviceType:'raceEvent',serviceName:cfg.urlParams.seriesKey,sessionId:cfg.sessionInfo.id})}}}
function connect(){if(closed)return;subscribed=false;clientId='';pending=Buffer.alloc(0);const current=new WebSocket(cfg.wsUrl);socket=current;current.binaryType='arraybuffer';current.onopen=()=>{if(socket!==current)return;retry=0;onStatus('connected')};current.onmessage=e=>{if(socket!==current)return;lastFrame=Date.now();frames++;if(recording)saveFrame(e.data,lastFrame);try{frame(Buffer.from(e.data),lastFrame)}catch(e){error=e.message;pending=Buffer.alloc(0)}};current.onerror=()=>current.close();current.onclose=()=>{if(socket!==current)return;onStatus('reconnecting');clearTimeout(reconnectTimer);reconnectTimer=setTimeout(connect,Math.min(15000,1000*2**retry++))}}
connect();setInterval(()=>{if(clientId)send({clientId,cmdType:'keepAlive'});if(lastFrame&&Date.now()-lastFrame>45000&&socket.readyState===WebSocket.OPEN)socket.close()},30000);
setInterval(()=>{onState(snapshot(true,cursor))},100);
let db,recordId,recordCount=0,queue=[],flushing=Promise.resolve();
async function database(){if(db)return db;db=await new Promise((resolve,reject)=>{const r=indexedDB.open('zic-local-recordings',1);r.onupgradeneeded=()=>r.result.createObjectStore('chunks',{autoIncrement:true});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});return db}
function flush(){if(!queue.length)return flushing;const batch=queue;queue=[];flushing=flushing.then(async()=>{const d=await database();await new Promise((resolve,reject)=>{const t=d.transaction('chunks','readwrite');for(const row of batch)t.objectStore('chunks').add(row);t.oncomplete=resolve;t.onerror=()=>reject(t.error)})});return flushing}
function saveFrame(bytes,at){let binary='';const arr=new Uint8Array(bytes);for(let i=0;i<arr.length;i+=8192)binary+=String.fromCharCode(...arr.subarray(i,i+8192));queue.push({recordId,line:JSON.stringify({kind:'frame',received_unix_ms:at,data:btoa(binary),encoding:'base64'})+'\n'});recordCount++;if(queue.length>=100)flush().catch(e=>{recording=false;onStatus('기록 저장 오류: '+e.message)})}
setInterval(()=>{if(recording)flush()},1000);
const configurationKey=c=>JSON.stringify([c.wsUrl,c.sessionInfo.id,c.entries.map(e=>[e.device_serial,e.entry_num,e.driver_name,e.team_name]),c.wsProtocol]);
let refreshing=false;
async function refreshConfiguration(){
 if(refreshing)return;refreshing=true;
 try{const r=await fetch('./config.json?v='+Date.now(),{cache:'no-store'});if(!r.ok)return;const next=await r.json();if(configurationKey(next)===configurationKey(cfg))return;
  if(!next.sessionInfo?.id||!next.entries?.length||!next.wsUrl?.startsWith('wss://'))throw Error('Invalid session configuration');
  clearTimeout(reconnectTimer);const previous=socket;socket=null;if(previous)previous.close();
  cfg=next;proto=cfg.wsProtocol.packet;cars.clear();cursor.clear();official=null;error=null;lastFrame=0;
  raceConfig={raceStartTime:Date.parse(cfg.sessionInfo.race_start_timestamp+'Z'),raceFinishTime:Date.parse(cfg.sessionInfo.race_end_timestamp+'Z'),raceMode:cfg.sessionInfo.race_mode};
  for(const e of cfg.entries)cars.set(e.device_serial,{serial:e.device_serial,number:e.entry_num,name:e.driver_name,team:e.team_name,focus:/\bzic\b/i.test(e.team_name),color:colors[e.entry_num]??'#8393a7',can:{},history:[],lapOffset:e.num_laps_offset??0,positionHistory:[]});
  if(recording)queue.push({recordId,line:JSON.stringify({kind:'config',at:new Date().toISOString(),config:cfg})+'\n'});
  onState(snapshot(true,cursor));connect();
 }catch(e){onStatus('설정 갱신 확인: '+e.message)}finally{refreshing=false}
}
setInterval(refreshConfiguration,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshConfiguration()});

return {async startRecording(){await database();recordId=new Date().toISOString();recordCount=0;queue.push({recordId,line:JSON.stringify({kind:'config',at:recordId,config:cfg})+'\n'});recording=true;return recordId},async stopRecording(){recording=false;await flush();const d=await database(),parts=[];await new Promise((resolve,reject)=>{const t=d.transaction('chunks','readonly'),r=t.objectStore('chunks').openCursor();r.onsuccess=()=>{const c=r.result;if(!c)return resolve();if(c.value.recordId===recordId)parts.push(c.value.line);c.continue()};r.onerror=()=>reject(r.error)});const blob=new Blob(parts,{type:'application/x-ndjson'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='zic-race-'+recordId.replaceAll(':','-')+'.jsonl';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);return {frames:recordCount,bytes:blob.size}}};
};
