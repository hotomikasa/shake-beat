// ===== 設定 =====
const BPM = 90;
const PERFECT = 0.07; // 秒
const GOOD = 0.14;    // 秒
const COOLDOWN = 0.25; // シェイク連続検知の抑制(秒)
const COUNT_IN = 4;   // 開始前の拍数

const interval = 60 / BPM;
const $ = (id) => document.getElementById(id);

let ctx, startTime, nextBeat = 0, judgedUpTo = -1;
let score = 0, combo = 0, lastShake = -1, prev = null;
const hit = new Set();

// ===== 開始 =====
$('startBtn').addEventListener('click', async () => {
  // iOSはユーザー操作内でセンサー許可が必要
  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    try {
      const r = await DeviceMotionEvent.requestPermission();
      if (r !== 'granted') alert('モーションセンサーが許可されませんでした。タップ/スペースキーで代用できます。');
    } catch (e) {
      alert('センサー許可に失敗: ' + e.message);
    }
  }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  await ctx.resume();
  startTime = ctx.currentTime + 1.0 + COUNT_IN * interval;
  $('start').hidden = true;
  $('game').hidden = false;
  setInterval(scheduleClicks, 25);
  requestAnimationFrame(frame);
});

// ===== 音 =====
function click(t, accent) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = accent ? 1200 : 800;
  g.gain.setValueAtTime(0.4, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + 0.07);
}

function scheduleClicks() {
  // カウントイン分も含め、startTime - COUNT_IN拍 から鳴らす
  while (startTime + (nextBeat - COUNT_IN) * interval < ctx.currentTime + 0.15) {
    click(startTime + (nextBeat - COUNT_IN) * interval, nextBeat % 4 === 0);
    nextBeat++;
  }
}

// ===== 判定 =====
const COLOR = { perfect: '#c2185b', good: '#1b8a5a', miss: '#d32f2f' };

function show(text, color) {
  const j = $('judge');
  j.textContent = text;
  j.style.color = color;
}

function setStats() {
  $('score').textContent = score;
  $('combo').textContent = combo;
}

function onShake() {
  if (!ctx) return;
  const offset = Number($('off').value) / 1000;
  const now = ctx.currentTime - offset;
  const n = Math.round((now - startTime) / interval);
  if (n < 0 || hit.has(n)) return;
  const d = Math.abs(now - (startTime + n * interval));
  if (d <= PERFECT) {
    hit.add(n); combo++; score += 100 + combo;
    show('PERFECT', COLOR.perfect);
  } else if (d <= GOOD) {
    hit.add(n); combo++; score += 50 + combo;
    show('GOOD', COLOR.good);
  } else {
    combo = 0;
    show('MISS', COLOR.miss);
  }
  setStats();
}

// 振らずに通り過ぎた拍をMISSにする
function checkPassedBeats(now) {
  while (judgedUpTo + 1 >= 0 && startTime + (judgedUpTo + 1) * interval + GOOD < now) {
    judgedUpTo++;
    if (!hit.has(judgedUpTo)) {
      combo = 0;
      show('MISS', COLOR.miss);
      setStats();
    }
  }
}

// ===== センサー =====
let evCount = 0, peak = 0;
window.addEventListener('devicemotion', (e) => {
  if (!ctx) return;
  const a = e.accelerationIncludingGravity;
  if (!a || a.x == null) return;
  evCount++;
  if (prev) {
    const d = Math.hypot(a.x - prev.x, a.y - prev.y, a.z - prev.z);
    peak = Math.max(d, peak * 0.95);
    const th = Number($('th').value);
    if (d > th && ctx.currentTime - lastShake > COOLDOWN) {
      lastShake = ctx.currentTime;
      onShake();
    }
  }
  prev = { x: a.x, y: a.y, z: a.z };
});

// PC確認用
window.addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); onShake(); } });
$('game').addEventListener('pointerdown', (e) => { if (!e.target.closest('#panel')) onShake(); });

// ===== 描画 =====
function frame() {
  const now = ctx.currentTime;
  // 画面の揺れ: 拍の瞬間(phase=0)に一番下、拍の中間で一番上になる
  const visual = now - (ctx.outputLatency || 0); // 出力遅延ぶん映像を遅らせて音と合わせる
  const phase = (((visual - startTime) / interval) % 1 + 1) % 1;
  const amp = Number($('amp').value);
  const y = amp * Math.cos(phase * 2 * Math.PI);
  $('stage').style.transform = `translateY(${y.toFixed(1)}px)`;

  checkPassedBeats(now);
  $('ampv').textContent = amp + 'px';
  $('thv').textContent = $('th').value;
  $('offv').textContent = $('off').value + 'ms';
  $('sensor').textContent = evCount
    ? `センサー受信中  振れ幅 ${peak.toFixed(1)} / 感度 ${$('th').value}`
    : 'センサー信号なし（許可・ブラウザを確認）';
  requestAnimationFrame(frame);
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
