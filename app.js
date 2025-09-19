// app.js (v4) — 可視化除錯 + 指定後鏡頭 + 只掃 EAN-13/EAN-8
const video   = document.getElementById('video');
const btnStart= document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const resultEl= document.getElementById('result');
const debugEl = document.getElementById('debug');

let stream = null;
let codeReader = null;
let scanning = false;
let framesSinceLog = 0;

function show(html){ resultEl.innerHTML = html; }
function log(...args){ console.log(...args); debugEl.textContent += args.join(' ') + '\n'; }
function clearLog(){ debugEl.textContent = ''; }

function isISBN13(s){
  const d = (s||'').replace(/\D/g,''); if(d.length!==13) return false;
  const nums = d.slice(0,12).split('').map(n=>+n), c=+d[12];
  const sum = nums.reduce((a,n,i)=>a+n*(i%2===0?1:3),0);
  return ((10-(sum%10))%10)===c;
}

async function pickBackCamera(){
  const devices = await ZXing.BrowserMultiFormatReader.listVideoInputDevices();
  log('🎥 視訊裝置數：', devices.length);
  // 嘗試找後鏡頭關鍵字
  const lower = s => (s||'').toLowerCase();
  let dev = devices.find(d => /back|rear|environment|後|背/.test(lower(d.label)));
  if(!dev) dev = devices[devices.length-1] || devices[0];
  if(!dev) throw new Error('找不到相機裝置');
  log('🎯 選用裝置：', dev.label || '(無標籤)', dev.deviceId.slice(0,6)+'…');
  return dev.deviceId;
}

async function startCamera(){
  try{
    // 先拿權限，讓裝置 label 可用
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } }, audio: false
    });
    video.srcObject = stream; await video.play();
    log('✅ 相機串流啟動');
  }catch(err){
    show(`❌ 相機啟動失敗：${err.message}`); throw err;
  }
}

function stopCamera(){
  try{ if(codeReader){ codeReader.reset(); } }catch{}
  codeReader=null; scanning=false;
  if(stream){ try{ stream.getTracks().forEach(t=>t.stop()); }catch{} }
  stream=null; log('⏹ 已停止相機/掃描');
}

async function queryGoogleBooks(isbn){
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&projection=lite&maxResults=1`;
  const r = await fetch(url); const j = await r.json();
  const item = j.items && j.items[0]; if(!item) return null;
  const v = item.volumeInfo || {};
  return {
    title: v.title || '(未提供書名)',
    authors: (v.authors||[]).join('、') || '不詳',
    publisher: v.publisher || '不詳',
    publishedDate: v.publishedDate || '不詳',
    cover: v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || ''
  };
}

async function startScan(){
  scanning = true; clearLog();
  show('📷 相機已啟動，請將條碼置於取景區域…');
  log('🧪 開始掃描…');

  // 僅允許 EAN-13/EAN-8，提高穩定度與效能
  const hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
    ZXing.BarcodeFormat.EAN_13,
    ZXing.BarcodeFormat.EAN_8,
  ]);
  codeReader = new ZXing.BrowserMultiFormatReader(hints);

  try{
    const deviceId = await pickBackCamera();
    await codeReader.decodeFromVideoDevice(deviceId, 'video', async (result, err) => {
      framesSinceLog++;
      if(!scanning) return;

      if(result){
        const raw = (typeof result.getText==='function') ? result.getText() : (result.text||'');
        const text = String(raw||'').trim();
        if(framesSinceLog>10){ log('📦 偵測到：', text); framesSinceLog=0; } // 每隔幾幀印一次

        if(isISBN13(text)){
          scanning = false; // 防多觸發
          log('✅ 命中 ISBN-13：', text);
          show(`✅ 辨識到 ISBN：<b>${text}</b>，查詢中…`);
          try{
            const meta = await queryGoogleBooks(text);
            if(meta){
              show(`
                <div class="book">
                  <img src="${meta.cover}" alt="cover" onerror="this.style.display='none';">
                  <div>
                    <div><b>書名：</b>${meta.title}</div>
                    <div><b>作者：</b>${meta.authors}</div>
                    <div><b>出版社：</b>${meta.publisher}</div>
                    <div><b>出版日：</b>${meta.publishedDate}</div>
                    <div class="tip">🎯 之後會把它存到本機，加入「實體／電子／雙收／願望清單」</div>
                  </div>
                </div>
              `);
            }else{
              show(`⚠️ 找不到此 ISBN 的書籍資料：${text}`);
            }
          }catch(e){
            show(`❌ 查詢錯誤：${e.message}`);
          }finally{
            stopCamera(); // 顯示完成後再關鏡頭，避免 iOS 黑屏
          }
        }
      }else if(err && !(err instanceof ZXing.NotFoundException)){
        // 非「未找到」的錯誤才顯示
        log('⚠️ ZXing 錯誤：', err.name || err);
      }
    });
  }catch(e){
    show(`❌ 掃描初始化失敗：${e.message}`);
    log('初始化錯誤：', e);
  }
}

btnStart.addEventListener('click', async ()=>{
  stopCamera();
  try{ await startCamera(); await startScan(); }catch(_){}
});
btnStop.addEventListener('click', ()=>{
  stopCamera(); show('⏹ 已停止相機。');
});
