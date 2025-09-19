// --- 相機與條碼辨識 ---
const video = document.getElementById('video');
const btnStart = document.getElementById('btnStart');
const btnStop  = document.getElementById('btnStop');
const resultEl = document.getElementById('result');

let stream = null;
let codeReader = null;
let scanning = false;

function show(msg) {
  resultEl.innerHTML = msg;
}

async function startCamera() {
  try {
    // 後鏡頭
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
  if (codeReader) {
    codeReader.reset();
    codeReader = null;
  }
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  scanning = false;
}

function isISBN13(s) {
  const d = (s || '').replace(/\D/g, '');
  if (d.length !== 13) return false;
  const nums = d.slice(0, 12).split('').map(n => +n);
  const check = +d[12];
  const sum = nums.reduce((acc, n, i) => acc + n * (i % 2 === 0 ? 1 : 3), 0);
  const calc = (10 - (sum % 10)) % 10;
  return calc === check;
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
  codeReader = new ZXing.BrowserMultiFormatReader();
  
  show('📷 相機已啟動，請將條碼置於取景區域...');

  try {
    await codeReader.decodeFromVideoDevice(null, 'video', async (result, err) => {
      if (result) {
        const text = result.getText();
        if (isISBN13(text)) {
          show(`✅ 辨識到 ISBN：<b>${text}</b>，查詢中...`);
          stopCamera(); // 先關閉掃描避免重複觸發

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
                </div>
              </div>
            `);
          } else {
            show(`⚠️ 找不到此 ISBN 的書籍資料：${text}`);
          }
        }
      }
    });
  } catch (e) {
    show(`❌ 掃描失敗：${e.message}`);
  }
}


btnStart.addEventListener('click', async () => {
  stopCamera();
  try {
    await startCamera();
    await startScanLoop();
  } catch (_) { /* 已在 startCamera 顯示錯誤 */ }
});

btnStop.addEventListener('click', () => {
  stopCamera();
  show('⏹ 已停止相機。');
});
