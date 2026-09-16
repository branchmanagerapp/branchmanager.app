#!/usr/bin/env python3
"""
photo-ingest.py — nightly: camera roll → Branch Manager work-day DRAFTS.

Reads the Mac Photos library READ-ONLY, finds GPS photos/videos since the last run,
keeps only those within 150 m of a client address (never the yard, never anything
that matches no client), groups them by client + day, uploads full-size copies to
the PRIVATE `work-drafts` bucket and writes one DRAFT `work_days` row per client-day.

Nothing here is public. Doug approves drafts on the approve page; approval copies
the files to the public bucket. Personal photos never leave this Mac.

stdlib only (runs on the mini too). Optional: ffmpeg (video shrink), sips (photo shrink).

usage:  photo-ingest.py            # normal nightly run
        photo-ingest.py --dry-run  # print what would happen, write nothing
        photo-ingest.py --since 2026-08-01   # backfill from a date (first run)
"""
import os, sys, json, math, glob, sqlite3, datetime, re, subprocess, urllib.request, urllib.parse, collections, uuid as uuidlib

HOME = os.path.expanduser('~')
LIB = f'{HOME}/Pictures/Photos Library.photoslibrary'
STATE = f'{HOME}/Desktop/_ops/photo-ingest-state.json'
LOG = f'{HOME}/Desktop/_ops/photo-ingest.log'
CREDS = f'{HOME}/Desktop/_Credentials/supabase-service-role.txt'
TENANT = '93af4348-8bba-4045-ac3e-5e71ec1cc8c5'
YARD = (41.304877792311, -73.923926736945)   # 1 Highland Industrial Park — never a job
RADIUS_M = 150
MAX_PER_DAY = 12
MAX_VIDEO_MB = 45

DRY = '--dry-run' in sys.argv
SINCE = None
if '--since' in sys.argv: SINCE = sys.argv[sys.argv.index('--since')+1]

def log(msg):
    line = f"{datetime.datetime.now():%Y-%m-%d %H:%M:%S} {msg}"
    print(line)
    if not DRY:
        os.makedirs(os.path.dirname(LOG), exist_ok=True)
        open(LOG,'a').write(line+'\n')

# ---------- creds ----------
env = {}
for l in open(CREDS):
    if '=' in l and not l.startswith('#'):
        k,v = l.strip().split('=',1); env[k]=v.strip().strip('"').strip("'")
URL, KEY = env['SUPABASE_URL'].rstrip('/'), env['SUPABASE_SERVICE_KEY']
H = {'apikey':KEY,'Authorization':'Bearer '+KEY}

def rest(path, method='GET', body=None, headers=None, raw=False):
    hh = dict(H); hh.update(headers or {})
    data = None
    if body is not None:
        data = body if raw else json.dumps(body).encode()
        if not raw: hh['Content-Type']='application/json'
    last = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(URL+path, data=data, method=method, headers=hh)
            with urllib.request.urlopen(req, timeout=300) as r:
                t = r.read()
                return json.loads(t) if t and r.headers.get('Content-Type','').startswith('application/json') else t
        except (urllib.error.URLError, ConnectionError, OSError) as e:
            last = e; import time; time.sleep(3*(attempt+1))
    raise last

# ---------- helpers ----------
def hav(a,b,c,d):
    R=6371000; p1,p2=math.radians(a),math.radians(c); dp=math.radians(c-a); dl=math.radians(d-b)
    x=math.sin(dp/2)**2+math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2; return 2*R*math.asin(math.sqrt(x))
def town_of(addr):
    m = re.search(r',\s*([A-Za-z .\-]+?),?\s*(NY|New York)\b', addr or '')
    t = (m.group(1).strip() if m else '')
    return {'Cortlandt':'Cortlandt Manor','Cortlandt manor':'Cortlandt Manor','Croton on Hudson':'Croton-on-Hudson','Coldspring':'Cold Spring'}.get(t,t)
def rev_town(lat, lng):
    """Nominatim reverse → village/hamlet/town/city (1 req/s, proper UA)."""
    try:
        import time; time.sleep(1.1)
        q = urllib.parse.urlencode({'lat':lat,'lon':lng,'format':'jsonv2','zoom':14})
        d = json.load(urllib.request.urlopen(urllib.request.Request('https://nominatim.openstreetmap.org/reverse?'+q, headers={'User-Agent':'SecondNatureTree/1.0 (info@peekskilltree.com)'}), timeout=20))
        a = d.get('address',{}); t = a.get('village') or a.get('hamlet') or a.get('town') or a.get('city') or a.get('municipality') or ''; return re.sub(r'^(Town|Village|City) of ','',t)
    except Exception: return ''
def local_file(uuid, kind):
    """Best local copy: original if present, else the largest derivative. Returns (path,size,kind)."""
    o = glob.glob(f"{LIB}/originals/{uuid[0]}/{uuid}*")
    d = glob.glob(f"{LIB}/resources/derivatives/{uuid[0]}/{uuid}*")
    if kind == 1:  # video: originals only (derivatives are 1 KB .THM)
        vids = [p for p in o if p.lower().endswith(('.mov','.mp4','.m4v'))]
        if vids:
            p = max(vids, key=os.path.getsize); return (p, os.path.getsize(p), 'video')
        return (None,0,'video-icloud-only')
    cands = [(os.path.getsize(p),p) for p in o+d if p.lower().endswith(('.jpeg','.jpg','.heic','.png'))]
    if not cands: return (None,0,'thumb')
    sz,p = max(cands)
    if sz < 100_000: return (None,sz,'thumb')
    return (p,sz,'photo')


def fetch_original(uuid, kind):
    """iCloud-only asset: ask Photos.app to export the ORIGINAL for just this item (downloads on demand).
    Only ever called for assets already matched to a client — personal photos are never fetched."""
    out = f'/tmp/photo-ingest-fetch/{uuid}'
    os.makedirs(out, exist_ok=True)
    try:
        subprocess.run(['osascript','-e','tell application "Photos"','-e',f'set theItems to (every media item whose id begins with "{uuid}")','-e',f'export theItems to POSIX file "{out}" with using originals','-e','end tell'],check=True,capture_output=True,timeout=600)
    except Exception as e:
        log(f"    fetch_original {uuid} failed: {e}"); return (None,0,'fetch-failed')
    exts = ('.mov','.mp4','.m4v') if kind==1 else ('.jpeg','.jpg','.heic','.png')
    cands=[(os.path.getsize(f'{out}/{f}'),f'{out}/{f}') for f in os.listdir(out) if f.lower().endswith(exts)]
    if not cands: return (None,0,'fetch-empty')
    sz,pth=max(cands); return (pth,sz,'video' if kind==1 else 'photo')

def shrink_photo(src, dst):
    """HEIC/large JPEG → JPEG ≤ 2000px via sips (macOS). Falls back to copy."""
    try:
        subprocess.run(['sips','-s','format','jpeg','-Z','2000',src,'--out',dst],check=True,capture_output=True)
        return dst
    except Exception:
        import shutil; shutil.copy(src,dst); return dst
def shrink_video(src, dst):
    """→ H.264 720p mp4 if ffmpeg exists; else None (skip, note it)."""
    try:
        subprocess.run(['ffmpeg','-y','-i',src,'-vf','scale=-2:720','-c:v','libx264','-preset','veryfast','-crf','28','-c:a','aac','-b:a','96k','-movflags','+faststart',dst],check=True,capture_output=True)
        return dst if os.path.getsize(dst) <= MAX_VIDEO_MB*1024*1024 else None
    except Exception:
        return None


# ---------- SocialBranch: one queue ----------
def sign(path, days=7):
    r = rest(f'/storage/v1/object/sign/work-drafts/{path}', 'POST', {'expiresIn': days*86400})
    return URL + '/storage/v1' + r['signedURL'] if isinstance(r, dict) and r.get('signedURL') else None
def social_caption(town, day, service=None):
    d = datetime.date.fromisoformat(day)
    return f"{service or 'Tree work'} in {town or 'the Hudson Valley'} — {d:%B %Y}. Our crew on site. Need the same at your place? Free estimates: peekskilltree.com · (914) 391-5233"
def upsert_social_draft(wid, town, day, photos, service=None):
    """One SocialBranch draft per work day. Doug approves THERE; the DB trigger publishes the work day everywhere."""
    urls = [u for u in (sign(p['path']) for p in photos if p['kind']=='photo') if u][:4]
    if not urls: return
    have = rest(f"/rest/v1/social_posts?select=id,status&work_day_id=eq.{wid}")
    if have:
        for sp in have:
            if sp['status']=='draft': rest(f"/rest/v1/social_posts?id=eq.{sp['id']}", 'PATCH', {'media_urls': urls, 'updated_at': datetime.datetime.utcnow().isoformat()+'Z'}, {'Prefer':'return=minimal'})
        return
    pid = f"p_{int(datetime.datetime.now().timestamp()*1000)}_wd{wid[:6]}"
    rest('/rest/v1/social_posts', 'POST', {'id': pid, 'tenant_id': TENANT, 'caption': social_caption(town, day, service), 'networks': ['facebook','instagram','gmb'], 'media_urls': urls, 'has_local_media': False, 'scheduled_at': None, 'status': 'draft', 'work_day_id': wid}, {'Prefer':'return=minimal'})
    log(f"    social draft {pid} ({len(urls)} photos)")

# ---------- state ----------
state = {'last_ts':0,'seen':[]}
if os.path.exists(STATE): state = json.load(open(STATE))
seen = set(state.get('seen',[]))
since_ts = state.get('last_ts',0)
if SINCE: since_ts = int(datetime.datetime.strptime(SINCE,'%Y-%m-%d').timestamp())
if not since_ts: since_ts = int((datetime.datetime.now()-datetime.timedelta(days=3)).timestamp())
log(f"run start dry={DRY} since={datetime.datetime.fromtimestamp(since_ts):%Y-%m-%d %H:%M}")

# ---------- clients + existing work days + jobs ----------
clients = [c for c in rest(f"/rest/v1/clients?select=id,name,address,lat,lng&tenant_id=eq.{TENANT}&limit=2000") if c.get('lat') and c.get('lng')]
existing = rest(f"/rest/v1/work_days?select=client_id,work_date&tenant_id=eq.{TENANT}&limit=5000")
have = {(w['client_id'],w['work_date']) for w in existing}
jobs = rest(f"/rest/v1/jobs?select=id,job_number,client_name,scheduled_date,completed_date,status&tenant_id=eq.{TENANT}&order=created_at.desc&limit=800")
log(f"clients geocoded={len(clients)} existing work_days={len(existing)} jobs={len(jobs)}")

# ---------- photos library ----------
db = sqlite3.connect(f'file:{LIB}/database/Photos.sqlite?mode=ro', uri=True)
rows = db.execute("select ZUUID, ZKIND, ZDATECREATED+978307200, ZLATITUDE, ZLONGITUDE from ZASSET where ZLATITUDE > -180 and ZDATECREATED+978307200 > ? order by ZDATECREATED", (since_ts,)).fetchall()
log(f"gps assets since last run: {len(rows)}")

stats = collections.Counter(); clusters = collections.defaultdict(list); max_ts = since_ts
for u,kind,ts,lat,lng in rows:
    max_ts = max(max_ts, int(ts))
    if u in seen: stats['seen']+=1; continue
    if hav(lat,lng,*YARD) < 200: stats['yard']+=1; continue
    near = min(((hav(lat,lng,float(c['lat']),float(c['lng'])),c) for c in clients), key=lambda x:x[0], default=(9e9,None))
    if near[0] > RADIUS_M: stats['no-client']+=1; continue
    c = near[1]; day = datetime.datetime.fromtimestamp(ts).strftime('%Y-%m-%d')
    clusters[(c['id'],day)].append({'uuid':u,'kind':kind,'ts':int(ts),'lat':lat,'lng':lng,'client':c,'dist':round(near[0])})
    stats['at-client']+=1
log(f"triage: {dict(stats)}  clusters={len(clusters)}")

def job_for(client_name, day):
    toks = {t.lower() for t in re.split(r'[^A-Za-z]+', client_name or '') if len(t)>2}
    d = datetime.date.fromisoformat(day)
    for j in jobs:
        jt = {t.lower() for t in re.split(r'[^A-Za-z]+', j.get('client_name') or '') if len(t)>2}
        if not (toks & jt): continue
        s = (j.get('scheduled_date') or '')[:10]; e = (j.get('completed_date') or s)[:10]
        try:
            sd = datetime.date.fromisoformat(s) if s else None; ed = datetime.date.fromisoformat(e) if e else sd
        except ValueError: continue
        if sd and (sd - datetime.timedelta(days=2)) <= d <= ((ed or sd) + datetime.timedelta(days=2)): return j
    return None

created = 0
for (cid, day), items in sorted(clusters.items(), key=lambda kv: kv[0][1]):
    c = items[0]['client']
    if (cid, day) in have: stats['already']+=1; continue
    stills = [i for i in items if i['kind']!=1]; vids = [i for i in items if i['kind']==1]
    usable = []
    for i in stills:
        p,sz,k = local_file(i['uuid'],0)
        if not p and not DRY: p,sz,k = fetch_original(i['uuid'],0)
        if p: usable.append((i,p,sz,'photo'))
    for i in vids:
        p,sz,k = local_file(i['uuid'],1)
        if not p and not DRY: p,sz,k = fetch_original(i['uuid'],1)
        if p: usable.append((i,p,sz,'video'))
    usable.sort(key=lambda x: x[0]['ts']); usable = usable[:MAX_PER_DAY]
    j = job_for(c['name'], day)
    tn = town_of(c.get('address')) or rev_town(items[0]['lat'], items[0]['lng'])
    log(f"  {day} {c['name'][:28]:<28} {tn:<16} stills={len(stills)} videos={len(vids)} usable={len(usable)} job={j['job_number'] if j else '-'}")
    if not usable: stats['no-usable-file']+=1; continue
    if DRY: continue
    wid = str(uuidlib.uuid4()); photos = []; tmp = f'/tmp/photo-ingest-{wid}'; os.makedirs(tmp, exist_ok=True)
    for n,(i,p,sz,kind) in enumerate(usable):
        if kind=='photo':
            out = shrink_photo(p, f'{tmp}/{n:02d}.jpeg'); ctype='image/jpeg'; name=f'{n:02d}.jpeg'
        else:
            out = shrink_video(p, f'{tmp}/{n:02d}.mp4'); ctype='video/mp4'; name=f'{n:02d}.mp4'
            if not out: log(f"    video {i['uuid']} skipped (no ffmpeg or > {MAX_VIDEO_MB} MB)"); continue
        path = f'{wid}/{name}'
        rest(f'/storage/v1/object/work-drafts/{path}', 'POST', open(out,'rb').read(), {'Content-Type':ctype,'x-upsert':'true'}, raw=True)
        photos.append({'path':path,'kind':kind,'taken_at':datetime.datetime.fromtimestamp(i['ts']).isoformat(),'lat':i['lat'],'lng':i['lng'],'asset':i['uuid']})
    if not photos: continue
    row = {'id':wid,'tenant_id':TENANT,'client_id':cid,'client_name':c['name'],'town':tn,'work_date':day,
           'lat':round(sum(x['lat'] for x in items)/len(items),6),'lng':round(sum(x['lng'] for x in items)/len(items),6),
           'job_id':(j or {}).get('id'),'job_number':(j or {}).get('job_number'),
           'photos':photos,'photo_count':len(photos),'cover_path':next((p['path'] for p in photos if p['kind']=='photo'),photos[0]['path']),
           'status':'draft','title':f"{tn or 'Tree work'} — {datetime.date.fromisoformat(day):%b %-d, %Y}"}
    rest('/rest/v1/work_days','POST',row,{'Prefer':'return=minimal'})
    upsert_social_draft(wid, tn, day, photos)
    created += 1; seen.update(i['uuid'] for i in items)
    import shutil; shutil.rmtree(tmp, ignore_errors=True); shutil.rmtree('/tmp/photo-ingest-fetch', ignore_errors=True)

if not DRY:
    for w in rest(f"/rest/v1/work_days?select=id,town,work_date,photos,service&status=eq.draft&tenant_id=eq.{TENANT}"):
        upsert_social_draft(w['id'], w['town'], w['work_date'], w['photos'], w.get('service'))
    seen.update(u for u,_,_,_,_ in rows)   # everything triaged this run is done, personal included
    state = {'last_ts':max_ts,'seen':sorted(seen)[-20000:]}
    os.makedirs(os.path.dirname(STATE), exist_ok=True); json.dump(state, open(STATE,'w'))
log(f"done: drafts created={created} {dict(stats)}")
