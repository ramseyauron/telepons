import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

sharp.cache(false);
sharp.concurrency(1);

const root = process.cwd();
const W = 1920, H = 1080, FPS = 30, DURATION = 15, COUNT = FPS * DURATION;
const work = path.join(root, ".video-render", "tpons-3d-live");
const frames = path.join(work, "frames");
fs.mkdirSync(frames, { recursive: true });

const scenePaths = [1,2,3,4].map((n) => path.join(root, "public/social/telepons-tpons-3d", `scene-0${n}-${["awakening","signal","deployment","community"][n-1]}.png`));
const scenes = scenePaths.map((p) => fs.readFileSync(p).toString("base64"));
const clamp = (v,a=0,b=1) => Math.max(a,Math.min(b,v));
const ease = (v) => { const x=clamp(v); return x*x*(3-2*x); };
const fade = (t,a,b) => ease((t-a)/(b-a));

function imageLayer(data, opacity, scale=1, dx=0, dy=0) {
  const iw = W*scale, ih = H*scale;
  return `<image href="data:image/png;base64,${data}" x="${(W-iw)/2+dx}" y="${(H-ih)/2+dy}" width="${iw}" height="${ih}" opacity="${opacity}" preserveAspectRatio="xMidYMid slice"/>`;
}

function frameSvg(i) {
  const t=i/FPS;
  const s1=clamp(1-fade(t,2.65,3.15));
  const s2=clamp(fade(t,2.65,3.15)*(1-fade(t,5.7,6.25)));
  const s3=clamp(fade(t,5.7,6.25)*(1-fade(t,9.25,9.85)));
  const s4=clamp(fade(t,9.25,9.85));
  const final=fade(t,12.25,13.0);
  const pulse=(Math.sin(t*5.3)+1)/2;
  const deploy=fade(t,6.25,8.4);
  const connected=fade(t,9.75,11.5);
  const scan=(t*210)%H;
  const particles=Array.from({length:34},(_,n)=>{
    const x=(n*239 + t*(18+n%4*6))%W;
    const y=(n*137 + Math.sin(t*.7+n)*42 + H)%H;
    return `<circle cx="${x}" cy="${y}" r="${1+n%3}" fill="#66ffb0" opacity="${.08+(n%5)*.025}"/>`;
  }).join("");
  const ringOpacity=s2*(.15+.5*pulse);
  const coinTextOpacity=s3*deploy + s4;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="v"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".68"/></radialGradient>
    <linearGradient id="mint"><stop stop-color="#a8ffd0"/><stop offset="1" stop-color="#25e984"/></linearGradient>
    <filter id="g"><feGaussianBlur stdDeviation="12" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="1920" height="1080" fill="#020a07"/>
  ${imageLayer(scenes[0],s1,1.00+.035*ease(t/2.8),-12*ease(t/2.8),0)}
  ${imageLayer(scenes[1],s2,1.055-.035*ease((t-2.7)/3.0),12*ease((t-2.7)/3.0),0)}
  ${imageLayer(scenes[2],s3,1.00+.05*ease((t-5.8)/3.7),0,-8*ease((t-5.8)/3.7))}
  ${imageLayer(scenes[3],s4,1.04-.025*ease((t-9.3)/5.7),0,0)}
  <rect width="1920" height="1080" fill="url(#v)"/>
  ${particles}
  <line x1="0" y1="${scan}" x2="1920" y2="${scan}" stroke="#63ffad" stroke-width="2" opacity=".08"/>

  <g opacity="${ringOpacity}" fill="none" stroke="#7affbb" filter="url(#g)">
    <circle cx="495" cy="130" r="${45+pulse*75}" stroke-width="4"/>
    <circle cx="495" cy="130" r="${90+pulse*120}" stroke-width="2"/>
    <path d="M520 140 Q950 80 1410 500" stroke-width="4" stroke-dasharray="18 18"/>
  </g>

  <g opacity="${s1*fade(t,.35,.9)*(1-fade(t,2.0,2.5))}">
    <rect x="112" y="92" width="295" height="54" rx="27" fill="#061b13" stroke="#52f29b" stroke-width="2"/>
    <circle cx="148" cy="119" r="8" fill="#52f29b" filter="url(#g)"/>
    <text x="177" y="129" fill="#caffdf" font-family="Arial, sans-serif" font-size="24" font-weight="800" letter-spacing="4">SYSTEM ONLINE</text>
  </g>

  <g opacity="${s2*fade(t,3.15,3.7)}">
    <rect x="1120" y="775" width="620" height="104" rx="24" fill="#03130d" fill-opacity=".86" stroke="#53f39d" stroke-width="2"/>
    <text x="1430" y="820" text-anchor="middle" fill="#aaffd1" font-family="Arial, sans-serif" font-size="23" font-weight="700" letter-spacing="5">AUTHORIZATION SIGNAL RECEIVED</text>
    <text x="1430" y="855" text-anchor="middle" fill="#f2fff8" font-family="Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="3">TELEPONS LAUNCH TERMINAL</text>
  </g>

  <g opacity="${coinTextOpacity}" filter="url(#g)">
    <text x="${s4 ? 822 : 930}" y="${s4 ? 520 : 505}" text-anchor="middle" fill="#f4fff9" font-family="Arial, sans-serif" font-size="${s4 ? 47 : 58}" font-weight="900">$TPONS</text>
  </g>
  <g opacity="${s3*fade(t,6.2,6.8)}">
    <rect x="650" y="895" width="620" height="72" rx="36" fill="#03150e" fill-opacity=".85" stroke="#55f5a0" stroke-width="2"/>
    <text x="960" y="941" text-anchor="middle" fill="#dffff0" font-family="Arial, sans-serif" font-size="25" font-weight="800" letter-spacing="7">DEPLOYING $TPONS</text>
  </g>
  <g opacity="${s4*connected*(1-final)}">
    <rect x="650" y="900" width="620" height="70" rx="35" fill="#03150e" fill-opacity=".84" stroke="#55f5a0" stroke-width="2"/>
    <text x="960" y="945" text-anchor="middle" fill="#dffff0" font-family="Arial, sans-serif" font-size="24" font-weight="800" letter-spacing="7">COMMUNITY CONNECTED</text>
  </g>

  <g opacity="${final}">
    <rect x="0" y="0" width="1920" height="1080" fill="#010805" fill-opacity=".62"/>
    <rect x="1030" y="170" width="760" height="720" rx="36" fill="#03110c" fill-opacity=".88" stroke="#3be990" stroke-width="2"/>
    <text x="1410" y="290" text-anchor="middle" fill="#b6c9bf" font-family="Arial, sans-serif" font-size="25" font-weight="800" letter-spacing="6">WE BUILT THE LAUNCH SYSTEM.</text>
    <text x="1410" y="350" text-anchor="middle" fill="#f3fff8" font-family="Arial, sans-serif" font-size="37" font-weight="900">NOW WE'RE USING IT OURSELVES.</text>
    <line x1="1160" y1="405" x2="1660" y2="405" stroke="#50f19b" stroke-width="3"/>
    <text x="1410" y="535" text-anchor="middle" fill="url(#mint)" font-family="Arial, sans-serif" font-size="92" font-weight="900">$TPONS IS LIVE</text>
    <text x="1410" y="610" text-anchor="middle" fill="#effff6" font-family="Arial, sans-serif" font-size="29" font-weight="800" letter-spacing="5">THE TELEPONS COMMUNITY TOKEN</text>
    <rect x="1190" y="695" width="440" height="82" rx="41" fill="url(#mint)"/>
    <text x="1410" y="748" text-anchor="middle" fill="#02130c" font-family="Arial, sans-serif" font-size="30" font-weight="900" letter-spacing="5">TELEPONS.BOT</text>
    <text x="1410" y="835" text-anchor="middle" fill="#a9bdb2" font-family="Arial, sans-serif" font-size="21" font-weight="700" letter-spacing="4">LAUNCHED FOR THE COMMUNITY</text>
  </g>
  </svg>`;
}

function audio() {
  const rate=48000, samples=DURATION*rate, pcm=Buffer.alloc(samples*4);
  const events=[[.5,.7,180,.08],[1.1,.35,640,.08],[3.0,2.5,260,.06],[3.5,1.2,520,.05],[5.9,3.4,110,.10],[6.2,2.8,420,.06],[9.4,.8,220,.11],[9.8,2.2,690,.055],[10.4,.28,850,.055],[11,.28,980,.05],[12.3,1.3,420,.08],[12.4,1.3,630,.06],[12.5,1.4,840,.045]];
  for(let n=0;n<samples;n++){
    const t=n/rate; let v=Math.sin(2*Math.PI*48*t)*.012;
    for(const [st,len,f,g] of events){const q=(t-st)/len;if(q>=0&&q<=1){const e=Math.sin(Math.PI*q)*Math.exp(-1.3*q);v+=Math.sin(2*Math.PI*f*(1+.16*q)*(t-st))*g*e;}}
    const s=Math.round(Math.max(-.9,Math.min(.9,v))*32767);pcm.writeInt16LE(s,n*4);pcm.writeInt16LE(s,n*4+2);
  }
  const wav=Buffer.alloc(44+pcm.length);wav.write("RIFF");wav.writeUInt32LE(36+pcm.length,4);wav.write("WAVE",8);wav.write("fmt ",12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*4,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write("data",36);wav.writeUInt32LE(pcm.length,40);pcm.copy(wav,44);fs.writeFileSync(path.join(work,"sound.wav"),wav);
}

console.log(`Rendering ${COUNT} cinematic frames…`);
for(let i=0;i<COUNT;i++){
  const out=path.join(frames,`frame_${String(i).padStart(4,"0")}.png`);
  if(fs.existsSync(out)) continue;
  await sharp(Buffer.from(frameSvg(i))).png({compressionLevel:3}).toFile(out);
  if(i%60===0) console.log(`${Math.round(i/COUNT*100)}%`);
}
audio();
console.log("3D video frames ready.");
