import json,re
from pathlib import Path
from urllib.request import urlopen
root=Path(__file__).resolve().parents[1]
with urlopen('https://hnf.jp-race.com/live/map',timeout=20) as r:html=r.read().decode()
m=re.search(r'streamController\.enqueue\(("(?:[^"\\]|\\.)*")\)',html)
if not m:raise RuntimeError('Original site configuration format changed')
pool=json.loads(json.loads(m.group(1)));memo={}
def unpack(i):
 if i<0:return None
 if i in memo:return memo[i]
 v=pool[i]
 if isinstance(v,dict):
  out={};memo[i]=out
  for k,n in v.items():out[str(unpack(int(k[1:])))] = unpack(n)
  return out
 if isinstance(v,list):
  out=[];memo[i]=out;out.extend(unpack(n) if isinstance(n,int) else n for n in v);return out
 return v
cfg=unpack(0)['loaderData']['features/live/pages/map']
assert cfg['wsUrl'].startswith('wss://') and cfg['sessionInfo'] and cfg['entries']
(root/'config.json').write_text(json.dumps(cfg,ensure_ascii=False))
print('Updated public viewer configuration:',cfg['sessionInfo']['session_name'])
