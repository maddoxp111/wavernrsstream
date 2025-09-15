/* Core logic for the artist page */
async function fetchJSON(path){
  const res = await fetch(path, { cache: "no-store" });
  if(!res.ok) throw new Error("Failed to load " + path);
  return res.json();
}

function fmtDate(iso){
  const d = new Date(iso);
  return d.toLocaleString(undefined, { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}

function pad(n){ return n.toString().padStart(2,'0'); }

function diffParts(targetDate){
  const now = new Date().getTime();
  const t = new Date(targetDate).getTime();
  let delta = Math.max(0, t - now);
  const d = Math.floor(delta / (24*3600*1000));
  delta -= d*24*3600*1000;
  const h = Math.floor(delta / (3600*1000));
  delta -= h*3600*1000;
  const m = Math.floor(delta / (60*1000));
  delta -= m*60*1000;
  const s = Math.floor(delta / 1000);
  return { d,h,m,s, remaining: t - now };
}

const state = {
  releases: [],
  flatTracks: [],
  currentIndex: -1,
  nextUpcoming: null,
};

function renderArtistHeader(cfg){
  const nameEl = document.getElementById("artistName");
  const avatar = document.getElementById("artistAvatar");
  const banner = document.getElementById("artistBanner");
  nameEl.textContent = cfg.artist.name;
  avatar.src = cfg.artist.avatarUrl;
  banner.style.backgroundImage = `url('${cfg.artist.bannerUrl}')`;
}

function renderReleasesGrid(){
  const grid = document.getElementById("releasesGrid");
  grid.innerHTML = "";
  document.getElementById("releaseCount").textContent = state.releases.length + " releases";

  state.releases.forEach((rel, idx) => {
    const playable = new Date(rel.releaseDate).getTime() <= Date.now();
    const card = document.createElement("div");
    card.className = "card";

    const cover = document.createElement("div");
    cover.className = "cover";
    cover.style.backgroundImage = `url('${rel.coverUrl}')`;

    if(!playable){
      const badge = document.createElement("div");
      badge.className = "badge";
      badge.textContent = "Coming " + fmtDate(rel.releaseDate);
      cover.appendChild(badge);
    }

    const body = document.createElement("div");
    body.className = "body";

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = rel.title;

    const subtitle = document.createElement("div");
    subtitle.className = "subtitle";
    subtitle.textContent = (rel.type || "release").toUpperCase() + " • " + new Date(rel.releaseDate).toLocaleDateString();

    const actions = document.createElement("div");
    actions.className = "actions";

    const playBtn = document.createElement("button");
    playBtn.className = "action play" + (playable ? "" : " disabled");
    playBtn.textContent = playable ? "Play" : "Locked";
    playBtn.addEventListener("click", () => {
      if(!playable) return;
      // Queue the release's tracks to play (start at first track of this release)
      const idxInFlat = state.flatTracks.findIndex(t => t.releaseIndex === idx && t.trackIndex === 0);
      if(idxInFlat >= 0){
        playIndex(idxInFlat);
      }
    });

    const openBtn = document.createElement("button");
    openBtn.className = "action";
    openBtn.textContent = "View";
    openBtn.addEventListener("click", () => {
      // Scroll into view and show tracklist modal (lightweight: inline expand)
      const already = card.querySelector(".tracklist");
      if(already){ already.remove(); return; }
      const list = document.createElement("div");
      list.className = "tracklist";
      list.style.marginTop = "10px";
      rel.tracks.forEach((t, tIdx) => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.justifyContent = "space-between";
        row.style.padding = "8px 0";
        row.style.borderTop = "1px solid #2a2a2a";

        const left = document.createElement("div");
        left.textContent = (tIdx+1) + ". " + t.title;

        const right = document.createElement("div");
        const playT = document.createElement("button");
        playT.className = "action" + (playable ? "" : " disabled");
        playT.textContent = "Play";
        playT.addEventListener("click", () => {
          if(!playable) return;
          const find = state.flatTracks.findIndex(ft => ft.releaseIndex === idx && ft.trackIndex === tIdx);
          if(find >= 0) playIndex(find);
        });
        right.appendChild(playT);

        row.appendChild(left);
        row.appendChild(right);
        list.appendChild(row);
      });
      body.appendChild(list);
    });

    actions.appendChild(playBtn);
    actions.appendChild(openBtn);

    body.appendChild(title);
    body.appendChild(subtitle);
    body.appendChild(actions);

    card.appendChild(cover);
    card.appendChild(body);
    grid.appendChild(card);
  });
}

function buildFlatTracks(){
  state.flatTracks = [];
  state.releases.forEach((rel, rIdx) => {
    const playable = new Date(rel.releaseDate).getTime() <= Date.now();
    if(!playable) return; // lock entire release until date/time
    rel.tracks.forEach((t, tIdx) => {
      state.flatTracks.push({
        releaseIndex: rIdx,
        trackIndex: tIdx,
        title: t.title,
        releaseTitle: rel.title,
        audioUrl: t.audioUrl,
        coverUrl: rel.coverUrl
      });
    });
  });
}

function setupCountdown(){
  const upcoming = state.releases
    .filter(r => new Date(r.releaseDate).getTime() > Date.now())
    .sort((a,b)=> new Date(a.releaseDate)-new Date(b.releaseDate))[0] || null;

  state.nextUpcoming = upcoming;
  const sec = document.getElementById("countdownSection");
  if(!upcoming){ sec.classList.add("hidden"); return; }
  sec.classList.remove("hidden");

  document.getElementById("cdTitle").textContent = upcoming.title;
  document.getElementById("cdDate").textContent = fmtDate(upcoming.releaseDate);

  function tick(){
    const parts = diffParts(upcoming.releaseDate);
    const timer = document.getElementById("cdTimer");
    const daysStr = parts.d > 0 ? parts.d + "d " : "";
    timer.textContent = daysStr + [parts.h,parts.m,parts.s].map(pad).join(":");
    if(parts.remaining <= 0){
      // unlock: reload data
      loadAll();
    }
  }
  tick();
  if(window._cdInterval) clearInterval(window._cdInterval);
  window._cdInterval = setInterval(tick, 1000);
}

function bindPlayer(){
  const audio = document.getElementById("player");
  const btn = document.getElementById("globalPlay");
  const seek = document.getElementById("seek");

  btn.addEventListener("click", () => {
    if(state.currentIndex < 0 && state.flatTracks.length){
      playIndex(0);
      return;
    }
    if(audio.paused) audio.play(); else audio.pause();
  });

  audio.addEventListener("play", ()=> btn.querySelector(".icon").textContent = "⏸");
  audio.addEventListener("pause",()=> btn.querySelector(".icon").textContent = "▶");

  audio.addEventListener("timeupdate", () => {
    if(audio.duration){
      seek.value = (audio.currentTime / audio.duration) * 100;
    }
  });
  seek.addEventListener("input", () => {
    if(audio.duration){
      audio.currentTime = (seek.value/100) * audio.duration;
    }
  });
  audio.addEventListener("ended", () => {
    // autoplay next
    if(state.currentIndex + 1 < state.flatTracks.length){
      playIndex(state.currentIndex + 1);
    }
  });
}

function playIndex(i){
  const audio = document.getElementById("player");
  const track = state.flatTracks[i];
  if(!track) return;
  state.currentIndex = i;
  audio.src = track.audioUrl;
  document.getElementById("npTitle").textContent = track.title;
  document.getElementById("npSubtitle").textContent = track.releaseTitle;
  // Set cover as banner subtle visual
  audio.play().catch(()=>{});
}

async function loadAll(){
  try{
    const cfg = window.APP_CONFIG;
    renderArtistHeader(cfg);

    // Load releases listed in config
    const loaded = [];
    for(const relPath of cfg.releases){
      try{
        const data = await fetchJSON(relPath);
        // normalize required fields
        if(!data.title || !data.releaseDate || !data.coverUrl || !Array.isArray(data.tracks)){
          console.warn("Invalid release file:", relPath);
          continue;
        }
        // ensure ISO format
        const iso = new Date(data.releaseDate).toISOString();
        data.releaseDate = iso;
        loaded.push(data);
      }catch(e){
        console.error("Failed to load", relPath, e);
      }
    }
    state.releases = loaded.sort((a,b)=> new Date(b.releaseDate) - new Date(a.releaseDate));
    buildFlatTracks();
    renderReleasesGrid();
    setupCountdown();
  }catch(e){
    console.error(e);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  bindPlayer();
  loadAll();
});
