let abortController = null; // 用于取消 fetch 请求
let totalSegments = 0; // 全局存储 totalSegments
let isFrontPage = true; // 跟踪当前页面（正/反）

// 初始化主题
window.tts_getStorageData(['theme']).then((result) => {
  const theme = result.theme || 'light'; // 默认 light 主题
  document.body.classList.add(theme); // 添加 light 或 dark 类
  console.log(`Applied theme: ${theme}`); // 调试日志
}).catch((error) => {
  console.error('Failed to load theme:', error);
  document.body.classList.add('light'); // 错误时回退到 light
});

// 确保 func.js 的函数可用
if (!window.tts_getStorageData) {
  console.error('getStorageData not found. Ensure func.js is loaded.');
}
/**
 * 创建浮动 UI 界面
 * @returns {HTMLElement} 返回创建的 UI 元素
 */
function createFloatingUI() {
  // 动态加载 CSS 文件
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('css/content.css'); // 扩展内的相对路径
  link.onerror = () => console.error('无法加载 content.css，请检查路径或文件内容');
  document.head.appendChild(link);

  // 创建 UI 容器
  const ui = document.createElement('div');
  ui.id = 'tts-floating-ui';
  ui.innerHTML = `
    <div id="tts-loading-overlay">
      <span>loading...</span>
    </div>
    
    <div id="tts-ui-container">
      <div id="tts-flip-container" class="front">
        <div id="tts-front-page" class="tts-page">
          <div id="tts-time-display">00:00:00 00:00:00</div>
          <button id="tts-play-pause-btn">▶</button>
        </div>
        <div id="tts-back-page" class="tts-page">
          <div id="tts-segment-display">0/0</div>
          <button id="tts-download-btn" disabled>💾</button>
        </div>
      </div>
      <button id="tts-flip-btn">↔</button>
      <button id="tts-close-btn">✖</button>
    </div>
  `;
  document.body.appendChild(ui);
  return ui;
}

// 创建浮动 UI 元素并将其添加到页面
const floatingUI = createFloatingUI();

// 监听 sendMessage 的消息监听器
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 消息中的 action 包含 'getPageContent'
  if (message.action === 'getPageContent') {
    // 获取当前页面 body 元素中的纯文本内容（不包括标签）
    const fullText = document.body.innerText;
    // 将获取到的内容发送给调用方
    sendResponse({ fullText });
    // 返回 true 表示该监听函数阻塞了消息，直到响应被发送完毕。
    return true;
  }

  // 消息中的 action 包含 'generateAudio'
  if (message.action === 'generateAudio') {
    // 从 message 中获取 segments, voice, speed, format, concurrency 
    const { segments, voice, speed, format, concurrency  } = message;

    // 创建新的 AbortController 用于取消 fetch
    abortController = new AbortController();

    // 显示浮动 UI 元素
    floatingUI.style.display = 'block';

    // 获取并显示输出组元素
    const uiContainer = document.getElementById('tts-ui-container');
    uiContainer.style.display = 'block';

    // 显示加载遮罩层
    const loadingOverlay = document.getElementById('tts-loading-overlay');
    loadingOverlay.style.display = 'block'; 

    // 统一计算 totalSegments
    totalSegments = segments.length; // 计算总分段数

    // 调用 window 的 fetchSegmentsSerially 函数，按序列获取 segments 中的音频片段
    window.tts_fetchSegmentsSerially(segments, voice, speed, format, concurrency, abortController.signal).then(() => {
      window.tts_updateTimeAndProgress(totalSegments);
    }).catch((error) => {
      if (error.name === 'AbortError') {
        console.log('Fetch aborted');
      } else {
        console.error('Fetch error:', error);
      }
    });;
    
    // 发送响应消息给调用方，表示操作已经开始
    sendResponse({ status: 'started' });
    // 返回 true 表示该监听函数阻塞了消息，直到响应被发送完毕。
    return true;
  }
});

// 定义所有需要检查的 DOM 元素到一个对象中
const elements = {
  ttsPlayPauseBtn: document.getElementById('tts-play-pause-btn'),
  ttsDownloadBtn: document.getElementById('tts-download-btn'),
  ttsCloseBtn: document.getElementById('tts-close-btn'),
  ttsFlipBtn: document.getElementById('tts-flip-btn'),
  ttsFlipContainer: document.getElementById('tts-flip-container')
};

// 监听播放暂停按钮的状态
elements.ttsPlayPauseBtn.addEventListener('click', () => {
  // 如果没有生成音频，请先生成音频
  if (window.tts_audioBuffer.length === 0) {
    window.tts_showErrorNotification('noAudioGenerated');
    return;
  }

  // 检查 audioPlayer 是否有有效的 src
  if (!window.tts_audioPlayer.src || window.tts_audioPlayer.readyState === 0) {
    // 如果没有 src 或音频未加载，尝试加载第一个片段
    if (window.tts_audioBuffer[window.tts_currentSegmentIndex]) {
      window.tts_audioPlayer.src = window.tts_audioBuffer[window.tts_currentSegmentIndex].url;
    } else {
      console.error('No valid audio segment available');
      window.tts_showErrorNotification('noAudioAvailable');
      return;
    }
  }

  // 如果当前不是播放状态
  if (!window.tts_isPlaying) {
    window.tts_audioPlayer.play().then(() => {
      elements.ttsPlayPauseBtn.textContent = '⏸';
      window.tts_isPlaying = true;
    })
    .catch(error => {
      console.error('Failed to play audio:', error);
      window.tts_showErrorNotification('playAudioFailed');
    });
  } else {
    window.tts_audioPlayer.pause();
    elements.ttsPlayPauseBtn.textContent = '▶';
    window.tts_isPlaying = false;
  }
});

// 监听下载按钮的点击事件
elements.ttsDownloadBtn.addEventListener('click', async () => {
  // 获取设置信息
  const settings = await new Promise(resolve => chrome.storage.sync.get(['settings'], resolve)).settings || { format: 'mp3' };

  // 获取配置下载音频格式
  const format = settings.format;

  // 检查 audioBuffer 是否有内容
  if (window.tts_audioBuffer.length === 0 || !window.tts_audioBuffer.every(item => item.blob instanceof Blob)) {
    window.tts_showErrorNotification('noAudioToDownload');
    return;
  }
  
  try {
    // 获取所有音频片段的 Blob 对象
  
    const blobs = window.tts_audioBuffer.map(item => item.blob);
    // 合并所有的音频片段为一个 Blob 对象
    const mergedBlob = new Blob(blobs, { type: `audio/${format}` });

    // 创建一个临时 URL
    const url = URL.createObjectURL(mergedBlob);

    // 生成时间戳
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

    // 创建一个下载链接元素
    const a = document.createElement('a');
    a.href = url;
    // 设置下载文件名
    a.download = `speech_${timestamp}.${format}`;
    // 触发点击事件进行下载
    a.click();
    // 回收临时 URL
    URL.revokeObjectURL(url);
    // 清除 audioBuffer 中的 blob
    window.tts_audioBuffer.forEach(item => delete item.blob);
  } catch (error) {
    console.error('Failed to generate downloadable audio:', error);
    window.tts_showErrorNotification('downloadAudioFailed');
  }
});

// 问题 5：优化翻转按钮事件监听
elements.ttsFlipBtn.addEventListener('click', () => {
  isFrontPage = !isFrontPage;
  elements.ttsFlipContainer.classList.remove('front', 'back'); // 先清除所有类
  elements.ttsFlipContainer.classList.add(isFrontPage ? 'front' : 'back'); // 添加正确类
});

// 监听关闭按钮的点击事件
elements.ttsCloseBtn.addEventListener('click', () => {
  // 取消所有正在进行的 fetch 请求
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  // 隐藏浮动 UI 元素
  floatingUI.style.display = 'none';
  // 暂停音频播放
  window.tts_audioPlayer.pause();
  // 更新按钮文本为播放符号
  elements.ttsPlayPauseBtn.textContent = '▶';
  // 设置为未播放状态
  window.tts_isPlaying = false;
  // 清空 audioPlayer 的 src 属性
  window.tts_audioPlayer.src = '';
  // 回收所有音频片段的 URL
  window.tts_audioBuffer.forEach(item => URL.revokeObjectURL(item.url));
  // 清空 audioBuffer 数组
  window.tts_audioBuffer.length = 0;
  // 清除 audioBuffer 中的 blob
  window.tts_audioBuffer.forEach(item => delete item.blob);
  // 重置当前段落索引为0
  window.tts_currentSegmentIndex = 0;
  // 重置累计缓存时长为0
  // window.tts_totalCachedDuration = 0;
  // 禁用下载按钮
  elements.ttsDownloadBtn.disabled = true;
  totalSegments = 0; // 重置 totalSegments
  // 重置时间显示
  document.getElementById('tts-time-display').textContent = '00:00:00 / 00:00:00';
  // 重置分片
  document.getElementById('tts-segment-display').textContent = '0/0';
  // 隐藏加载遮罩层
  document.getElementById('tts-loading-overlay').style.display = 'none';
  // 重置正反面
  document.getElementById('tts-ui-container').style.display = 'none';
});

// 监听 audioPlayer 的 timeupdate 事件，每当音频播放时间更新时触发
window.tts_audioPlayer.ontimeupdate = async () => {
  // 调用 updateTimeAndProgress 函数更新时间进度条和相关文本
  window.tts_updateTimeAndProgress(totalSegments);
};