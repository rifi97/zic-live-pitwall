const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const base=JSON.parse(fs.readFileSync(path.join(root,'config.json'),'utf8'));
const clone=o=>JSON.parse(JSON.stringify(o));
function fixture(){const c=clone(base);c.sessionInfo.session_name='N1 결승';c.entries=c.entries.slice(0,4).map((e,i)=>({...e,entry_num:['21','55','56','85'][i],driver_name:['강병휘','신우진','황용섭','윤성로'][i],team_name:'ZIC UNITED'}));return c;}
async function engine(config=fixture()){
 let now=Date.parse('2026-11-01T05:15:00Z'),response={ok:true,status:200,config},state;
 const intervals=new Map(),timeouts=new Map(),events={},sockets=[];
 class Socket{static OPEN=1;constructor(url){this.url=url;this.readyState=0;this.sent=[];sockets.push(this);}open(){this.readyState=1;this.onopen();}close(){this.readyState=3;this.onclose?.();}send(b){this.sent.push(Buffer.from(b));}message(b){this.onmessage({data:b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)});}}
 const context=vm.createContext({window:{},document:{addEventListener:(n,f)=>events[n]=f,hidden:false},Date:class extends Date{static now(){return now;}},fetch:async()=>({ok:response.ok,status:response.status,json:async()=>clone(response.config)}),WebSocket:Socket,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,setInterval:(f,t)=>intervals.set(t,f),setTimeout:(f,t)=>{const id={};timeouts.set(id,{f,t});return id;},clearTimeout:id=>timeouts.delete(id)});
 vm.runInContext(fs.readFileSync(path.join(root,'engine.js'),'utf8'),context);
 const controller=await context.window.startDirectFeed(s=>state=s,()=>{});
 const snapshot=()=>{intervals.get(100)();return state;};
 return {sockets,controller,intervals,timeouts,events,snapshot,get now(){return now;},advance:n=>now+=n,setResponse:r=>response=r,refresh:()=>intervals.get(60000)(),setConfig:c=>response={ok:true,status:200,config:c}};
}
function jsonPacket(c,data){const text=Buffer.from(JSON.stringify(data)),b=Buffer.alloc(8+text.length);b.writeUInt32BE(Number(c.wsProtocol.packet.jsonPacket.header.value));b.writeUInt32LE(text.length,4);text.copy(b,8);return b;}
function dataPacket(c,at,withCan=true){const b=Buffer.alloc(withCan?68:62);b.writeUInt32BE(Number(c.wsProtocol.packet.dataPacket.header.value));b.writeUInt32LE(b.length-8,4);b.writeBigUInt64BE(BigInt('0x'+c.entries[0].device_serial),8);b.writeUInt32LE(at%4294967296,16);b.writeUInt16LE(Math.floor(at/4294967296),20);b.writeInt32LE(1272100000,28);b.writeInt32LE(372970000,32);b.writeInt16LE(1000,40);b.writeUInt16LE(withCan?1:0,60);if(withCan){b.writeUInt16LE(c.signalList.indexOf('_sig_EngRPM'),62);b.writeInt32LE(16000,64);}return b;}
function handshake(c,s){const b=Buffer.alloc(16);b.writeUInt32BE(Number(c.wsProtocol.packet.setClientId.header.value));b.writeUInt32LE(8,4);b.writeBigUInt64BE(1n,8);s.message(b);s.message(jsonPacket(c,{cmdType:'reqTimeSync'}));}

function app(){
 let now=100000,accept;const nodes=new Map();
 class Element{constructor(){this.textContent='';this.childNodes=[];this.style={setProperty(){}};this.attrs={};this.children=new Map();this.classList={add(){},toggle(){}};}querySelector(q){if(!this.children.has(q))this.children.set(q,new Element());return this.children.get(q);}querySelectorAll(){return [];}getAttribute(k){return this.attrs[k];}setAttribute(k,v){this.attrs[k]=v;}append(e){nodes.set(e.id,e);}getContext(){return {};}}
 const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 const context=vm.createContext({document:{getElementById:get,createElement:()=>new Element(),documentElement:{},hidden:false},window:{startDirectFeed:async fn=>{accept=fn;return {};},addEventListener(){}},performance:{now:()=>now},Date,Image:class {},ResizeObserver:class{observe(){}},IntersectionObserver:class{observe(){}},setInterval(){},requestAnimationFrame(){}});
 vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8'),context);
 return {get,accept:s=>{now=s.now;accept(clone(s));},run:code=>vm.runInContext(code,context)};
}
function uiState(){return {now:100000,last_frame_ms:100000,transport_status:'connected',configuration_revision:0,session:{id:'N1',session_name:'N1 결승'},cars:[{serial:'car',number:'21',name:'강병휘',focus:true,received_ms:100000,source_ms:100000,data:{speed:100,lat:372970000,lon:1272100000},can:{_sig_EngRPM:{value:4000,received_ms:100000}},history:[]} ]};}
const raceId='cbf255e0-31ec-439c-a697-944df4227775';
function raceConfig(){const c=fixture();c.sessionInfo.id=raceId;return c;}
function result(overrides={}){return {cmdType:'rmResult',ClassName:'KUMHO N1',SessionName:'R6 결승 (일)',ranking:[{RacerNumber:'21',RacerName:'강병휘 (C)',RacePosition:7,LastLap:120000,BestLapTime:119000,Laps:1}],...overrides};}
test('official row binds exact class/session, normalized name and number',async()=>{const c=raceConfig(),e=await engine(c);e.sockets[0].open();e.sockets[0].message(jsonPacket(c,result()));const r=e.snapshot().cars[0].rank;assert.equal(r.position,7);assert.equal(r.session_id,raceId);assert.equal(r.session_name,'R6 결승 (일)');});
for(const [name,override] of Object.entries({round:{SessionName:'R5 결승 (일)'},phase:{SessionName:'R6 예선 (일)'},class:{ClassName:'NEXEN N2 Masters'},name:{ranking:[{RacerNumber:21,RacerName:'다른 선수',RacePosition:1}]},absent:{ranking:[]},malformed:{ranking:{}}}))test(`rejects/clears ${name} mismatch`,async()=>{const c=raceConfig(),e=await engine(c);e.sockets[0].open();e.sockets[0].message(jsonPacket(c,result()));assert.ok(e.snapshot().cars[0].rank);e.sockets[0].message(jsonPacket(c,result(override)));assert.equal(e.snapshot().cars[0].rank,null);});
test('unknown future session never inherits this official-result mapping',async()=>{const c=raceConfig();c.sessionInfo.id='future';const e=await engine(c);e.sockets[0].open();e.sockets[0].message(jsonPacket(c,result()));assert.equal(e.snapshot().cars[0].rank,null);});
function rankedState(){const s=uiState();s.session.id=raceId;s.cars[0].live_rank={position:3};s.cars[0].rank={position:7,received_ms:s.now,session_id:raceId,session_name:'R6 결승 (일)',last_ms:120000,best_ms:119000};return s;}
test('fresh official position wins over GPS, explicit source shown',()=>{const a=app(),s=rankedState();a.accept(s);const card=a.get('driver-21');assert.equal(card.querySelector('.rank b').textContent,'P7');assert.equal(card.querySelector('.rank-label').textContent,'공식 순위');assert.equal(card.querySelector('.last-lap').textContent,'2:00.000');});
test('10-second expiration falls back to labelled GPS and clears stale lap display',()=>{const a=app(),s=rankedState();s.cars[0].rank.received_ms-=10000;a.accept(s);const card=a.get('driver-21');assert.equal(card.querySelector('.rank b').textContent,'P3');assert.equal(card.querySelector('.rank-label').textContent,'GPS 추정');assert.equal(card.querySelector('.last-lap').textContent,'—');});
for(const value of [0,-1,1.5,'bad',null])test(`invalid official position ${value} falls back`,()=>{const a=app(),s=rankedState();s.cars[0].rank.position=value;a.accept(s);assert.equal(a.get('driver-21').querySelector('.rank b').textContent,'P3');assert.equal(a.get('driver-21').querySelector('.rank-label').textContent,'GPS 추정');});
test('different subscribed session rejects even recently received row',()=>{const a=app(),s=rankedState();s.cars[0].rank.session_id='old';a.accept(s);assert.equal(a.get('driver-21').querySelector('.rank b').textContent,'P3');});
test('fresh official rank and laps render without any GPS telemetry',()=>{const a=app(),s=rankedState();s.cars[0].data=null;a.accept(s);const card=a.get('driver-21');assert.equal(card.querySelector('.rank b').textContent,'P7');assert.equal(card.querySelector('.rank-label').textContent,'공식 순위');assert.equal(card.querySelector('.last-lap').textContent,'2:00.000');assert.equal(card.querySelector('.speed').textContent,'—');});
test('nonparticipant without official or GPS row stays blank and labelled',()=>{const a=app(),s=rankedState();s.cars=[];a.accept(s);assert.equal(a.get('driver-21').querySelector('.rank b').textContent,'—');});
test('map number is centred seven pixels above circle with no leader line',()=>{const a=app(),s=uiState();s.track={track_ref_top_left_lon:0,track_ref_bot_right_lon:200,track_ref_top_left_lat:0,track_ref_bot_right_lat:200};s.cars[0].data={lat:100,lon:100,speed:1};a.accept(s);const drawn=JSON.parse(a.run(`JSON.stringify((()=>{globalThis.devicePixelRatio=1;mapSize={width:600,height:400};var marks=[];for(const k of ['setTransform','clearRect','beginPath','fill'])ctx[k]=()=>{};ctx.measureText=()=>({width:20});ctx.arc=(x,y)=>marks.push({kind:'circle',x,y});ctx.strokeText=(n,x,y)=>marks.push({kind:'label',n,x,y});ctx.fillText=()=>{};ctx.lineTo=()=>{throw Error('Leader line must not be drawn')};draw();return marks;})())`));assert.equal(drawn[1].n,'21');assert.equal(drawn[1].x,drawn[0].x-10);assert.equal(drawn[1].y,drawn[0].y-7);});
