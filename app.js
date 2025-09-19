// app.js (v6) — 最小 demo：只顯示偵測到的條碼字串
const video    = document.getElementById('video');
const btnStart = document.getElementById('btnStart');
const btnStop  = document.getElementById('btnStop');
const resultEl = document.getElementById('result');
const debugEl  = document.getElementById('debug');

let stream = null;
let codeReader = null;
let scanning = false;

function show(html){ resultEl.innerHTML = html; }
function log(...args){
  console.log(...args);
  if (debugEl) debugEl.textContent += args.join(' ') + '\n';
}

function clearLog(){ if (debugEl) debugEl.textContent = ''; }

function isISBN13(s){
  const d = (s||'').replace(/\D/g,'');
  if (d.length !== 13) return false;
  const nums = d.slice(0,12).split('').map(n=>+n), c = +d[12];
  const sum  = nums.reduce((a,n,i)=> a + n*(i%2===0?1:3), 0);
  return ((10 - (sum % 10)) % 10) === c;
}

async function startCamera(){
  // 先拿到 basic stream（啟動權限，讓裝置標籤可用）
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false
  });
  video.srcObject = stream;
  await video.play();
  log('✅ 相機串流啟動');
}

function stopCamera(){
  try { if (codeReader) codeReader.reset(); } catch {}
  codeReader = null;
  scanning = false;
  if (stream) {
    try { stream.getTracks().forEach(t=>t.stop()); } catch {}
  }
  stream = null;
  log('⏹ 已停止相機/掃描');
}

async function pickBackCameraId(){
  const devices = await ZXing.BrowserMultiFormatReader.listVideoInputDevices();
  log('🎥 視訊裝置數：', devices.length);
  const lower = s => (s||'').toLowerCase();
  let dev = devices.find(d => /back|rear|environment|後|背/.test(lower(d.label)));
  if (!dev) dev = devices[devices.length - 1] || devices[0];
  if (!dev) throw new Error('找不到相機裝置');
  log('🎯 選用裝置：', dev.label || '(無標籤)', dev.deviceId.slice(0,6)+'…');
  return dev.deviceId;
}

async function startScan(){
  scanning = true;
  clearLog();
  show('🧪 開始掃描（僅顯示偵測結果，不查書）…');

  // 只掃 EAN-13 / EAN-8
  const hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
    ZXing.BarcodeFormat.EAN_13,
    ZXing.BarcodeFormat.EAN_8
  ]);
  codeReader = new ZXing.BrowserMultiFormatReader(hints);

  const deviceId = await pickBackCameraId();

  await codeReader.decodeFromVideoDevice(deviceId, 'video', (result, err) => {
    if (!scanning) return;

    if (result) {
      const raw  = (typeof result.getText === 'function') ? result.getText() : (result.text || '');
      const text = String(raw || '').trim();

      // 直接顯示偵測到的字串（不停止相機，便於連續嘗試）
      log('📦 偵測到：', text);
      show(`
        <div>📦 偵測到條碼：<b>${text}</b></div>
        <div>${isISBN13(text) ? '✅ 這是有效的 ISBN-13' : 'ℹ️ 不是有效的 ISBN-13（或掃到別種碼）'}</div>
        <div class="tip">請讓條碼更靠近、光線充足、保持平直。</div>
      `);
    } else if (err && !(err instanceof ZXing.NotFoundException)) {
      log('⚠️ ZXing 錯誤：', err.name || err);
    }
  });
}

btnStart.addEventListener('click', async () => {
  try {
    stopCamera();                 // 清乾淨
    await startCamera();          // 啟動相機
    await startScan();            // 開始掃描
  } catch (e) {
    show('❌ 啟動失敗：' + e.message);
    log('啟動失敗：', e);
  }
});

btnStop.addEventListener('click', () => {
  stopCamera();
  show('⏹ 已停止相機。');
});
