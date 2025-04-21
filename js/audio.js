const audioPlayer = new Audio();
const audioBuffer = []; // 音频缓冲区,数据结构为 { url: 'blob_url', duration: 0, blob: Blob }
let currentSegmentIndex = 0;
let totalCachedDuration = 0;
let isPlaying = false;

// 处理分片播放结束
function handleEnded() {
  if (currentSegmentIndex < audioBuffer.length - 1) {
    currentSegmentIndex++;
    audioPlayer.src = audioBuffer[currentSegmentIndex].url;
    audioPlayer.play().catch(err => {
      console.error('播放失败:', err);
      tts_isPlaying = false;
    });
  } else {
    tts_isPlaying = false;
    audioBuffer.forEach(segment => URL.revokeObjectURL(segment.url)); // 释放资源
    console.log('所有分片播放完毕');
  }
}

// 检测 CSP 是否阻止 blob: URL
async function checkCSPSupportForBlob(blob = null) {
  return new Promise((resolve) => {
    try {
      // 如果提供了实际的 blob，使用它进行测试；否则创建一个小的测试 blob
      const testBlob = blob || new Blob([new Uint8Array(2048)], { type: 'audio/mpeg' });
      const testUrl = URL.createObjectURL(testBlob);
      const testAudio = new Audio(testUrl);

      testAudio.onloadedmetadata = () => {
        URL.revokeObjectURL(testUrl);
        resolve(true); // CSP 允许 blob:
      };

      testAudio.onerror = () => {
        console.warn('CSP test audio error:', testAudio.error?.message || 'Unknown error', testAudio.error);
        // 显示错误通知给用户
        alert('The website\'s security settings do not support this plugin. Please try with another website.');
        // 隐藏浮动 UI 元素
        floatingUI.style.display = 'none';
        URL.revokeObjectURL(testUrl);
        resolve(false); // CSP 可能阻止了 blob:
      };

      // 增加超时时间，防止误判
      setTimeout(() => {
        URL.revokeObjectURL(testUrl);
        resolve(false); // 超时，假设 CSP 阻止
      }, 3000); // 延长到 3 秒
    } catch (error) {
      console.error('CSP check failed:', error);
      resolve(false); // 异常情况，假设 CSP 阻止
    }
  });
}

// 获取单个音频分片
async function fetchAudioSegment(segment, voice, speed, format, index, signal) {
  try {
    // 从存储中获取设置
    const { settings } = await window.tts_getStorageData(['settings']);

    // 确保 DEFAULT_SETTINGS 存在
    if (!window.tts_DEFAULT_SETTINGS) {
      throw new Error('DEFAULT_SETTINGS is not defined. Ensure func.js is loaded.');
    }

    // 合并默认设置，确保 openai 字段存在
    const effectiveSettings = {
      ...window.tts_DEFAULT_SETTINGS,
      ...settings,
      openai: {
        ...window.tts_DEFAULT_SETTINGS.openai,
        ...(settings?.openai || {})
      }
    };

    const { apiUrl, apiKey } = effectiveSettings.openai;

    // 验证 apiUrl 和 apiKey
    if (!apiUrl || !apiKey) {
      throw new Error('API URL or API Key is missing in settings.');
    }

    const adjustedSpeed = effectiveSettings.speed !== undefined ? effectiveSettings.speed : 1; // 默认 1
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        input: segment,
        voice,
        speed: adjustedSpeed, // 直接使用存储值（0-2）
        response_format: format
      }),
      signal // 传递 AbortController 的 signal
    });

    // 检查响应状态
    if (!response.ok) {
      const errorText = await response.text(); // 获取详细错误信息
      throw new Error(`Segment ${index} failed with status ${response.status}: ${errorText}`);
    }
    
    // 获取响应的二进制数据
    const blob = await response.blob();
  
    // 验证 blob 数据
    if (blob.size === 0 || !blob.type.startsWith('audio/')) {
      throw new Error(`Invalid audio blob for segment ${index}: size=${blob.size}, type=${blob.type}`);
    }
    // console.log(`Segment ${index} blob:`, { size: blob.size, type: blob.type });
    
    // 检查 CSP 是否支持 blob:，使用实际的音频 blob
    const isBlobSupported = await checkCSPSupportForBlob(blob);
    if (!isBlobSupported) {
      throw new Error('cspBlocked');
    }
    
    // 创建临时音频对象
    const tempAudio = new Audio(URL.createObjectURL(blob));
    // 获取音频时长（秒）
    await new Promise((resolve, reject) => {
      tempAudio.onloadedmetadata = resolve;
      tempAudio.onerror = () => reject(new Error(`Metadata loading failed for segment ${index}`));
    });

    // 获取音频时长
    const duration = Math.floor(tempAudio.duration);

    // 累加总时长（秒）
    totalCachedDuration += duration;
    
    return { index, blob, duration, success: true };
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log(`Fetch aborted for segment ${index}`);
      return { index, success: false, error: { message: 'Fetch aborted', code: 'ABORT_ERROR' } };
    }
    console.error(`Error fetching segment ${index}:`, error.message);
    window.tts_showErrorNotification('fetchSegmentError', { index, error: error.message });
    return { 
      index, 
      success: false, 
      error: { 
        message: error.message, 
        code: error.code || 'UNKNOWN_ERROR' 
      } 
    };
  }
}

// 获取音频分片并串行处理
async function fetchSegmentsSerially(segments, voice, speed, format, maxConcurrency, signal) {
  totalCachedDuration = 0; // 初始化总缓存时长和音频缓冲区
  audioBuffer.length = 0; // 清空音频缓冲区
  let loadedSegments = 0; // 新增计数器，跟踪成功加载的段数
  const queue = segments.map((segment, index) => ({ segment, index })); // 队列中存储 { segment, index } 对象
  let hasError = false; // 标记是否发生错误
  
  // 当队列中有未处理的数据时循环执行
  while (queue.length > 0) {
    if (signal?.aborted) { // 检查是否已取消
      console.log('FetchSegmentsSerially aborted');
      throw new DOMException('Fetch aborted', 'AbortError');
    }

    const currentBatch = queue.splice(0, maxConcurrency); // 取出当前批次的任务（最多 maxConcurrency 个）

    // 对每个任务发起请求并收集结果
    const requests = currentBatch.map(({ segment, index }) =>
      fetchAudioSegment(segment, voice, speed, format, index, signal)  // 单分片音频转换请求
    );

    const results = await Promise.all(requests); // 等待所有请求完成

    for (const result of results) {  // 遍历所有请求的结果
      if (result.success) {
        audioBuffer[result.index] = {  // 将语音段落添加到缓冲区中
          url: URL.createObjectURL(result.blob), 
          duration: result.duration,
          blob: result.blob // 保存原始 blob
        };
        loadedSegments++; // 成功加载时递增计数器

        // 如果是第一个语音片段，开始自动播放
        if (loadedSegments === 1) {
          audioPlayer.src = audioBuffer[0].url;
        }  
        
        if (segments.length === 1 || loadedSegments === 2) { // 如果语音只有一段，或者已经加载了两段
          if (!window.tts_isPlaying) { // 检查全局播放状态并自动播放
            try {
              await audioPlayer.play(); // 使用 await 确保播放成功开始
              const ttsPlayPauseBtn = document.getElementById('tts-play-pause-btn'); // 加载按钮
              if (ttsPlayPauseBtn) {
                ttsPlayPauseBtn.textContent = '⏸'; // 转换图标
                window.tts_isPlaying = true; // 设置全局播放状态
              }
              
              const loadingOverlay = document.getElementById('tts-loading-overlay');  // 加载遮罩层
              if (loadingOverlay) {
                loadingOverlay.style.display = 'none'; // 关闭加载遮罩层
              }

              // 添加 ended 事件监听器
              audioPlayer.addEventListener('ended', handleEnded);

            } catch (error) {
              console.error('Failed to play audio:', error);
              window.tts_showErrorNotification('audioPlaybackFailed');
            }
            audioPlayer.oncanplay = null; // 清除事件监听器，避免重复触发
            audioPlayer.onerror = null; // 清除错误监听器
          }
        }

        if (loadedSegments === segments.length) { // 如果所有语音片段都已加载完成
          const ttsDownloadBtn = document.getElementById('tts-download-btn') // 加载按钮
          if (ttsDownloadBtn) {
            ttsDownloadBtn.disabled = false; //启用下载按钮
          }
        }    
      } else {
        hasError = true; // 标记错误，停止后续处理
        console.error(`Failed to fetch segment ${result.index}: ${result.error.message}`);
        window.tts_showErrorNotification('fetchSegmentError', { 
          index: result.index, 
          error: result.error.message 
        });
        break; // 中断当前批次处理
      }
    }

    if (hasError) break; // 处理音频分片时发生错误，停止处理
  }

  if (hasError) {
    // 可选：清理已加载的资源
    audioBuffer.forEach(item => URL.revokeObjectURL(item.url));
    audioBuffer.length = 0;
    totalCachedDuration = 0;
    window.tts_isPlaying = false;
    audioPlayer.src = '';
    const ttsPlayPauseBtn = document.getElementById('tts-play-pause-btn');
    if (ttsPlayPauseBtn) ttsPlayPauseBtn.textContent = '▶';

    return { success: hasError, error: 'fetchError' }; // 返回错误信息
  }
  return { success: !hasError, audioBuffer }; // 返回处理结果
}

// 系统时间格式化成普通时间时间
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// 更新时间和进度条，接受 totalSegments 作为参数
function updateTimeAndProgress(totalSegments) {
  // 计算当前时间
  const currentTime = Math.floor(audioPlayer.currentTime) +
    audioBuffer.slice(0, currentSegmentIndex).reduce((sum, item) => sum + (item.duration || 0), 0);
  
  // 更新时间显示
  const timeDisplay = document.getElementById('tts-time-display');
  if (timeDisplay) {
    timeDisplay.textContent = `${formatTime(currentTime)} ${formatTime(totalCachedDuration)}`;
  } else {
    console.error('Time display element not found');
    window.tts_showErrorNotification('timeDisplayNotFound');
  }
  // 更新分片显示
  const segmentDisplay = document.getElementById('tts-segment-display');
  if (segmentDisplay) {
    segmentDisplay.textContent = `${audioBuffer.length}/${totalSegments}`;
  } else {
    console.error('Segment display element not found');
    window.tts_showErrorNotification('segmentDisplayNotFound');
  }

  // console.log(`currentTime: ${currentTime} totalCachedDuration: ${totalCachedDuration}`);

  // 如果播放时间大于或等于总时长，播放按钮设置成暂停
  if (currentTime >= totalCachedDuration) {
    const ttsPlayPauseBtn = document.getElementById('tts-play-pause-btn');
    if (ttsPlayPauseBtn) {
      ttsPlayPauseBtn.textContent = '▶';
      window.tts_isPlaying = false;
    }
  }
  
  // 更新进度条
  // console.log('updateTimeAndProgress:', { totalSegments, audioBufferLength: audioBuffer.length });
}

// 页面卸载时清理资源
window.addEventListener('unload', () => {
  audioBuffer.forEach(item => URL.revokeObjectURL(item.url));
  audioBuffer.length = 0;
  audioPlayer.src = '';
  totalCachedDuration = 0;
  currentSegmentIndex = 0;
  isPlaying = false;
});

// 更新时间和进度
audioPlayer.addEventListener('timeupdate', () => {
  const totalDuration = audioBuffer.reduce((sum, seg) => sum + seg.duration, 0);
  const elapsed = audioBuffer.slice(0, currentSegmentIndex).reduce((sum, seg) => sum + seg.duration, 0) + audioPlayer.currentTime;
  const progress = (elapsed / totalDuration) * 100;
  console.log(`时间: ${elapsed.toFixed(1)}s, 进度: ${progress.toFixed(1)}%`);
});

window.tts_audioPlayer = audioPlayer;
window.tts_audioBuffer = audioBuffer;
window.tts_currentSegmentIndex = currentSegmentIndex;
window.tts_isPlaying = isPlaying;
window.tts_fetchSegmentsSerially = fetchSegmentsSerially;
window.tts_updateTimeAndProgress = updateTimeAndProgress;