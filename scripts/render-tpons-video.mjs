import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";

sharp.cache(false);
sharp.concurrency(1);

const root = process.cwd();
const width = 1920;
const height = 1080;
const fps = 30;
const duration = 12;
const frameCount = fps * duration;
const workDir = path.join(root, ".video-render", "tpons-launch");
const framesDir = path.join(workDir, "frames");
const logoPath = path.join(root, "public", "brand", "telepons-mark.png");

fs.mkdirSync(framesDir, { recursive: true });

const logoData = fs.readFileSync(logoPath).toString("base64");
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
const smooth = (v) => { const x = clamp(v); return x * x * (3 - 2 * x); };
function person(x, y, scale, opacity) {
  return `<g transform="translate(${x} ${y}) scale(${scale})" opacity="${opacity}">
    <circle cx="0" cy="-18" r="14" fill="#dfffee"/>
    <path d="M-27 27c2-27 12-38 27-38s25 11 27 38" fill="#51f29b"/>
  </g>`;
}

function frameSvg(frame) {
  const t = frame / fps;
  const intro = ease(t / 1.4);
  const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 3);
  const arm = smooth((t - 2.15) / 1.15) * (1 - smooth((t - 4.0) / 0.55));
  const press = Math.sin(clamp((t - 3.25) / 0.38) * Math.PI);
  const deploy = ease((t - 4.0) / 1.8);
  const community = ease((t - 6.65) / 2.7);
  const final = ease((t - 9.65) / 1.1);
  const sceneOneOut = 1 - smooth((t - 3.8) / 0.7);
  const coreOpacity = clamp((t - 3.85) / 0.5) * (1 - smooth((t - 9.6) / 0.55));
  const logoX = 580 - 310 * smooth((t - 1.65) / 0.65);
  const logoY = 525 - 20 * Math.sin(t * 1.9) * sceneOneOut;
  const logoScale = 0.78 - 0.13 * smooth((t - 1.65) / 0.65);
  const armEndX = 710 + arm * 500;
  const buttonY = 560 + press * 12;
  const tokenScale = 0.22 + deploy * 0.78;
  const tokenGlow = 20 + deploy * 70 + pulse * 12;
  const terminalOpacity = clamp((t - 1.75) / 0.55) * sceneOneOut;
  const seed = crypto.createHash("md5").update(String(Math.floor(t * 8))).digest();
  const particles = Array.from({ length: 30 }, (_, i) => {
    const a = (i / 30) * Math.PI * 2 + t * (i % 2 ? .25 : -.18);
    const radius = 150 + ((i * 47 + seed[i % 16]) % 280) * deploy;
    const x = 960 + Math.cos(a) * radius;
    const y = 535 + Math.sin(a) * radius * .62;
    const r = 2 + (i % 4);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${i % 3 ? "#51f29b" : "#8d78ff"}" opacity="${coreOpacity * (0.25 + (i % 5) / 8)}"/>`;
  }).join("");

  const nodes = [
    [410,270],[675,210],[960,195],[1245,210],[1510,270],
    [340,520],[1580,520],[430,795],[720,855],[1200,855],[1490,795]
  ];
  const connections = nodes.map(([x,y], i) => {
    const local = clamp((community * 3.0 - i * .16));
    return `<line x1="960" y1="535" x2="${960 + (x-960)*local}" y2="${535 + (y-535)*local}" stroke="url(#lineGradient)" stroke-width="3" opacity="${local * .7}"/>`;
  }).join("");
  const people = nodes.map(([x,y], i) => person(x,y,.8,clamp(community * 2.2 - i * .11))).join("");

  const finalY = 70 * (1 - final);
  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <radialGradient id="bg" cx="50%" cy="42%"><stop offset="0" stop-color="#123d2d"/><stop offset=".56" stop-color="#072219"/><stop offset="1" stop-color="#020b08"/></radialGradient>
      <linearGradient id="mint" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#89ffc0"/><stop offset="1" stop-color="#1fe985"/></linearGradient>
      <linearGradient id="lineGradient"><stop stop-color="#51f29b"/><stop offset="1" stop-color="#8d78ff"/></linearGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="${tokenGlow}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="softGlow"><feGaussianBlur stdDeviation="14" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse"><path d="M64 0H0V64" fill="none" stroke="#56d895" stroke-opacity=".055" stroke-width="1"/></pattern>
    </defs>
    <rect width="1920" height="1080" fill="url(#bg)"/>
    <rect width="1920" height="1080" fill="url(#grid)" opacity="${1-final}"/>
    <ellipse cx="960" cy="1060" rx="720" ry="180" fill="#2eea8a" opacity=".055"/>

    <g opacity="${sceneOneOut}">
      <g transform="translate(${logoX} ${logoY}) scale(${logoScale}) translate(-256 -256)" opacity="${intro}">
        <image href="data:image/png;base64,${logoData}" width="512" height="512"/>
        <ellipse cx="220" cy="197" rx="9" ry="7" fill="#a6ffd0" opacity="${.35 + pulse*.65}" filter="url(#softGlow)"/>
        <ellipse cx="284" cy="197" rx="9" ry="7" fill="#a6ffd0" opacity="${.35 + pulse*.65}" filter="url(#softGlow)"/>
        <circle cx="336" cy="102" r="${18 + pulse*14}" fill="none" stroke="#51f29b" stroke-width="4" opacity="${.7-pulse*.35}"/>
      </g>
      <g opacity="${terminalOpacity}">
        <text x="920" y="345" fill="#a6bdb2" font-family="Arial, sans-serif" font-size="28" font-weight="700" letter-spacing="7">TELEPONS LAUNCH TERMINAL</text>
        <text x="920" y="414" fill="#f2fff8" font-family="Arial, sans-serif" font-size="48" font-weight="700">Community token ready</text>
        <rect x="920" y="470" width="390" height="116" rx="28" fill="#123f2d" stroke="#51f29b" stroke-width="3" transform="translate(0 ${press*12})"/>
        <text x="1115" y="543" fill="#baffd8" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="800" letter-spacing="4" transform="translate(0 ${press*12})">LAUNCH</text>
        <circle cx="1115" cy="528" r="${55+press*85}" fill="none" stroke="#51f29b" stroke-width="5" opacity="${press*.6}"/>
      </g>
      <g opacity="${arm}">
        <path d="M650 520 L${760 + arm*80} 500 L${armEndX-55} ${buttonY}" fill="none" stroke="#dfffee" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M650 520 L${760 + arm*80} 500 L${armEndX-55} ${buttonY}" fill="none" stroke="#2be88a" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${760 + arm*80}" cy="500" r="27" fill="#08261c" stroke="#51f29b" stroke-width="9"/>
        <circle cx="${armEndX-55}" cy="${buttonY}" r="23" fill="#eafff2"/>
      </g>
    </g>

    <g opacity="${coreOpacity}">
      ${particles}
      ${connections}
      ${people}
      <g transform="translate(960 535) scale(${tokenScale})" filter="url(#glow)">
        <circle r="165" fill="#062319" stroke="#51f29b" stroke-width="8"/>
        <circle r="132" fill="url(#mint)" opacity=".13" stroke="#b9ffda" stroke-width="3"/>
        <circle r="105" fill="#071c15" stroke="#51f29b" stroke-width="4"/>
        <text y="18" fill="#effff6" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="900">$TPONS</text>
      </g>
      <text x="960" y="805" text-anchor="middle" fill="#51f29b" font-family="Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="8" opacity="${deploy}">TOKEN DEPLOYED • COMMUNITY CONNECTED</text>
    </g>

    <g opacity="${final}" transform="translate(0 ${finalY})">
      <image href="data:image/png;base64,${logoData}" x="130" y="100" width="150" height="150"/>
      <text x="315" y="165" fill="#51f29b" font-family="Arial, sans-serif" font-size="30" font-weight="800" letter-spacing="7">TELEPONS</text>
      <text x="315" y="211" fill="#b5c8be" font-family="Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="4">LAUNCH • CONNECT • GROW</text>
      <text x="960" y="410" text-anchor="middle" fill="#effff6" font-family="Arial, sans-serif" font-size="72" font-weight="900">NOW WE'RE USING IT OURSELVES.</text>
      <text x="960" y="500" text-anchor="middle" fill="#51f29b" font-family="Arial, sans-serif" font-size="38" font-weight="800" letter-spacing="8">TELEPONS COMMUNITY TOKEN</text>
      <text x="960" y="640" text-anchor="middle" fill="#effff6" font-family="Arial, sans-serif" font-size="96" font-weight="900">$TPONS</text>
      <rect x="720" y="716" width="480" height="90" rx="45" fill="url(#mint)"/>
      <text x="960" y="775" text-anchor="middle" fill="#04150f" font-family="Arial, sans-serif" font-size="30" font-weight="900" letter-spacing="5">COMING SOON</text>
      <text x="960" y="896" text-anchor="middle" fill="#b5c8be" font-family="Arial, sans-serif" font-size="27" font-weight="700">t.me/teleponscom</text>
    </g>
  </svg>`;
}

function createAudio() {
  const sampleRate = 48000;
  const samples = duration * sampleRate;
  const data = Buffer.alloc(samples * 2 * 2);
  const events = [
    [0.55, 0.22, 520, .12], [1.05, .18, 720, .09],
    [3.30, .08, 150, .34], [3.38, .25, 880, .13],
    [4.0, 2.2, 120, .10], [4.2, 1.8, 360, .08],
    [7.0, .16, 660, .07], [7.55, .16, 780, .07], [8.1, .16, 900, .07], [8.65, .18, 1020, .07],
    [10.15, .7, 520, .10], [10.22, .75, 780, .08], [10.30, .8, 1040, .06]
  ];
  for (let i = 0; i < samples; i++) {
    const time = i / sampleRate;
    let v = Math.sin(2*Math.PI*54*time) * .013;
    for (const [start, len, freq, gain] of events) {
      const q = (time - start) / len;
      if (q >= 0 && q <= 1) {
        const env = Math.sin(Math.PI*q) * Math.exp(-1.7*q);
        const sweep = freq * (1 + .18*q);
        v += Math.sin(2*Math.PI*sweep*(time-start)) * gain * env;
      }
    }
    v = Math.max(-.9, Math.min(.9, v));
    const s = Math.round(v * 32767);
    data.writeInt16LE(s, i*4);
    data.writeInt16LE(s, i*4+2);
  }
  const wav = Buffer.alloc(44 + data.length);
  wav.write("RIFF",0); wav.writeUInt32LE(36+data.length,4); wav.write("WAVE",8);
  wav.write("fmt ",12); wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(2,22);
  wav.writeUInt32LE(sampleRate,24); wav.writeUInt32LE(sampleRate*4,28); wav.writeUInt16LE(4,32); wav.writeUInt16LE(16,34);
  wav.write("data",36); wav.writeUInt32LE(data.length,40); data.copy(wav,44);
  fs.writeFileSync(path.join(workDir, "sound.wav"), wav);
}

console.log(`Rendering ${frameCount} frames…`);
for (let i = 0; i < frameCount; i++) {
  const outputPath = path.join(framesDir, `frame_${String(i).padStart(4,"0")}.png`);
  if (fs.existsSync(outputPath)) continue;
  const svg = frameSvg(i);
  await sharp(Buffer.from(svg)).png({ compressionLevel: 3 }).toFile(outputPath);
  if (i % 60 === 0) console.log(`${Math.round(i/frameCount*100)}%`);
}
createAudio();
console.log(`Frames and audio ready in ${workDir}`);
