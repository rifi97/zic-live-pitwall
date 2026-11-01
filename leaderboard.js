// Rank semantics independently implemented from JP-RACE's public map decoder:
// /assets/_packetDecoder-CfmwmGSk.js getSczLeaderboard/getCombinedLeaderboard.
// Race order: completed crossings, interpolated progress, then elapsed time.
(function(root){
 const trackLengths={'7f546999-10c7-44ef-8f79-4d598a9915d8':4266409};
 // Everland Speedway.jpt: uint32LE @76; SHA256
 // 353ab9dfc5ad74cd5c61477b8a5ba480b06ba1a536046650843898c20e15d3ae.
 function sampleAt(car,at,length){
  const samples=car.positionHistory??[];if(!samples.length)return null;
  let lo=0,hi=samples.length;while(lo<hi){const mid=(lo+hi)>>1;if(samples[mid].t<at)lo=mid+1;else hi=mid;}
  const b=samples[lo],a=samples[lo-1];if(!a)return b;if(!b)return a;if(b.t===at)return b;
  const fraction=(at-a.t)/(b.t-a.t);let end=b.pos;
  const wraps=a.pos>length*.95&&b.pos<length*.05;if(wraps)end+=length;
  let pos=a.pos+(end-a.pos)*fraction;if(wraps&&pos>length)pos-=length;
  return {t:at,pos,speed:a.speed+(b.speed-a.speed)*fraction};
 }
 function calculate(cars,config,displayAt,trackId){
  const length=trackLengths[trackId];if(!length||config?.raceMode!=='race'||!cars.some(c=>c.positionHistory?.length))return null;
  let target=displayAt,latestMoving=Number.MAX_SAFE_INTEGER,earliest=0;
  for(const c of cars){const sample=sampleAt(c,displayAt,length);if(sample?.speed>40)latestMoving=Math.min(latestMoving,c.source_latest??c.positionHistory.at(-1).t);earliest=Math.max(earliest,c.source_earliest??c.positionHistory?.[0]?.t??0);}
  if(target>latestMoving)target=latestMoving;else if(target<earliest)target=earliest;
  if(target<displayAt-20000)return null;
  const start=config.raceStartTime,finish=config.raceFinishTime;
  const history=new Map(cars.map(c=>[c.serial,(c.lap_timestamps??[]).filter(t=>t<target&&t>start)]));
  let finishLapCount=Number.MAX_SAFE_INTEGER;
  if(finish<Number.MAX_SAFE_INTEGER){finishLapCount=0;for(const times of history.values())finishLapCount=Math.max(finishLapCount,times.filter(t=>t<finish).length+1);}
  let cutoff=Number.MAX_SAFE_INTEGER;
  for(const times of history.values()){
   const crossings=times.filter(t=>t<finish),firstAfter=times.find(t=>t>=finish);if(firstAfter!==undefined)crossings.push(firstAfter);
   const last=crossings.at(-1);if(last>finish&&crossings.length>=finishLapCount)cutoff=Math.min(cutoff,last);
  }
  const rows=cars.map(c=>{
   const times=history.get(c.serial),crossings=times.filter(t=>t<cutoff),firstAfter=times.find(t=>t>=cutoff);if(firstAfter!==undefined)crossings.push(firstAfter);
   const sample=sampleAt(c,target,length);let finished=false,totalTime=0,lastMs=0,bestMs=0;
   if(crossings.length>1){lastMs=crossings.at(-1)-crossings.at(-2);const laps=crossings.slice(1).map((t,i)=>t-crossings[i]).filter(t=>t>0);bestMs=laps.length?Math.min(...laps):0;finished=crossings.at(-1)>=cutoff;totalTime=crossings.at(-1)-start;}
   return {serial:c.serial,number:c.number,laps:crossings.length+(c.lapOffset??0),pos:finished?0:(sample?.pos??0),totalTime,finished,last_ms:lastMs,best_ms:bestMs};
  });
  // Stable ties preserve the source entry order, exactly as the original UI.
  rows.sort((a,b)=>b.laps-a.laps||b.pos-a.pos||a.totalTime-b.totalTime);
  return {target_source_ms:target,rows:rows.map((r,i)=>({...r,position:i+1}))};
 }
 root.ZicRaceLeaderboard={calculate,sampleAt,trackLengths};
})(typeof window==='undefined'?globalThis:window);
