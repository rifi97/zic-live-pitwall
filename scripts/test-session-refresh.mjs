// Exercise the actual browser engine through active -> zero entrants -> active.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const ended=JSON.parse(readFileSync(new URL('../config.json',import.meta.url)));
const active=structuredClone(ended);
active.sessionInfo={...active.sessionInfo,id:'test-active',session_name:'N1 결승',num_entries:1};
active.entries=[{device_serial:'test-device',entry_num:'21',driver_name:'강병휘',team_name:'ZIC UNITED'}];
let current=active,state;
const timers=[],statuses=[],sockets=[];
class Socket{
 static OPEN=1;
 readyState=1;
 constructor(){sockets.push(this)}
 close(){this.readyState=3;this.onclose?.()}
 send(){}
}
const context=vm.createContext({window:{},TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,WebSocket:Socket,
 fetch:async()=>({ok:true,json:async()=>structuredClone(current)}),
 setInterval:(fn,ms)=>{timers.push({fn,ms})},setTimeout:()=>{},clearTimeout:()=>{},
 document:{addEventListener:()=>{}},performance});
vm.runInContext(readFileSync(new URL('../leaderboard.js',import.meta.url),'utf8'),context);
vm.runInContext(readFileSync(new URL('../engine.js',import.meta.url),'utf8'),context);
await context.window.startDirectFeed(next=>{state=next},status=>statuses.push(status));
const snapshot=timers.find(t=>t.ms===100).fn,refresh=timers.find(t=>t.ms===60000).fn;
snapshot();assert.equal(state.cars.length,1);
current=ended;current.sessionInfo={...current.sessionInfo,id:'test-ended',num_entries:0};current.entries=[];
await refresh();assert.equal(state.cars.length,0);assert.equal(state.session.id,'test-ended');assert.equal(sockets.length,2);
const incomplete=structuredClone(active);incomplete.entries=[];current=incomplete;
await refresh();snapshot();assert.equal(state.session.id,'test-ended');assert.equal(sockets.length,2);
current=active;await refresh();assert.equal(state.cars.length,1);assert.equal(state.session.id,'test-active');assert.equal(sockets.length,3);
console.log('PASS: active -> empty session -> active; incomplete roster rejected');
