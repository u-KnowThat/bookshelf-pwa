// app.js (v3) — 穩定掃描＋除錯輸出
const video = document.getElementById('video');
const btnStart = document.getElementById('btnStart');
const btnStop  = document.getElementById('btnStop');
const resultEl = document.getElementById('result');

let stream = null;
let codeReader = null;
let scanning = false;

function show(html) { resultEl.innerHTML = html; }
function log(msg)   { console.log(msg); }

function isISBN13(s) {
  const d = (s || '').replace(/\D/g, '');
  if (d.length !== 13) return false;
  const nums = d.slice(0, 12).split('').map(n => +n);
  const check = +d[12];
  const sum = nums.reduce((acc, n, i) => acc + n * (i % 2 === 0 ? 1 : 3), 0);
  const calc = (10 - (sum % 10)) % 10;
  return calc === check;
}

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
  } catch (err) {
    show(`❌ 相機啟動失敗：${err.message}`);
    throw err;
  }
}

function stopCamera() {
  try { if (codeReader) { codeReader.reset(); } } catch {}
  codeReader = null;
  if (stream) {
    try { stream.getTracks().forEach(t => t.stop()); } catch {}
  }
  stream = null;
  scanning = false;
}

async function queryGoogleBooks(isbn) {
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&projection=lite&maxResults=1`;
  const r = await fetch(url);
  const j = await r.json();
  const item = j.items && j.items[0];
  if (!item) return null;

  const v = item.volumeInfo || {};
  return {
    title: v.title || '(未提供書名)',
    authors: (v.authors || []).join('、') || '不詳',
    publisher: v.publisher || '不詳',
    publishedDate: v.publishedDate || '不詳',
    cover: v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || ''
  };
}

async function startScanLoop() {
  scanning = true;
  codeReader = new ZXing.BrowserMultiFormatReader();

  show('📷 相機已啟動，請將條碼置於取景區域...');
  log('startScanLoop: begin');

  try {
    // 持續解碼（不要用 decodeOnce）
    await codeReader.decodeFromVideoDevice(null, 'video', async (result, err) => {
      if (!scanning) return;

      if (result) {
        // 兼容不同版本的屬性/方法
        const raw = (typeof result.getText === 'function') ? result.getText() : (result.text || '');
        const text = String(raw || '').trim();
        log('decode result:', text);

        if (isISBN13(text)) {
          scanning = false; // 防多次觸發
          show(`✅ 辨識到 ISBN：<b>${text}</b>，查詢中...`);
          // 先停止掃描器（避免 callback 再進來）
          try { codeReader.reset(); } catch {}
          try {
            const meta = await queryGoogleBooks(text);
            if (meta) {
              show(`
                <div class="book">
                  <img src="${meta.cover}" alt="cover" onerror="this.style.display='none';">
                  <div>
                    <div><b>書名：</b>${meta.title}</div>
                    <div><b>作者：</b>${meta.authors}</div>
                    <div><b>出版社：</b>${meta.publisher}</div>
                    <div><b>出版日：</b>${meta.publishedDate}</div>
                    <div class="tip">🎯 接下來我們會把它存到本機（LocalStorage/IndexedDB）</div>
                  </div>
                </div>
              `);
            } else {
              show(`⚠️ 找不到此 ISBN 的書籍資料：${text}`);
            }
          } catch (e) {
            show(`❌ 查詢發生錯誤：${e.message}`);
          } finally {
            // 查詢完再關鏡頭，避免 iOS 黑屏
            stopCamera();
          }
        }
      } else if (err) {
        // 常見：NotFoundException（沒掃到）→ 忽略；其他錯誤顯示出來
        if (!(err instanceof ZXing.NotFoundException)) {
          log('decode error:', err);
          // 不要在這裡 stopCamera(); 讓它繼續掃
        }
      }
    });
  } catch (e) {
    show(`❌ 掃描初始化失敗：${e.message}`);
  }
}

btnStart.addEventListener('click', async () => {
  stopCamera(); // 確保乾淨狀態
  try {
    await startCamera();
    await startScanLoop();
  } catch (_) {}
});

btnStop.addEventListener('click', () => {
  stopCamera();
  show('⏹ 已停止相機。');
});
