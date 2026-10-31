ZIC United Live Pitwall

Static GitHub Pages dashboard. Each visitor's browser connects directly to the
public JP-RACE WebSocket. No Mac, Tailscale, API relay or server-side race archive
is required. Server storage is not used for visitor recordings.

Recording is opt-in using the Start/Stop button. Raw frames and the public session
configuration are held in that browser's IndexedDB. Stop exports a JSONL download.
Keep the page open while recording; browser/device suspension interrupts capture.
Local records remain in IndexedDB if a download is interrupted.

The public config.json is refreshed by a scheduled GitHub Action. Scheduled jobs
can be delayed; the manual workflow can be run if the source session changes.

Map geometry and protocol metadata originate from https://hnf.jp-race.com/live/map.
Race rank follows lap-count/track-progress calculations; official timing remains
separate. This is an independent dashboard, not an official timing service.
