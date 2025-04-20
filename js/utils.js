// 获取存储数据的函数
function getStorageData(keys) {
    return new Promise((resolve) => {
      chrome.storage.sync.get(keys, (result) => {
        resolve(result);
      });
    });
  }
  
// 插入存储数据的函数
function setStorageData(data) {
return new Promise((resolve) => {
    chrome.storage.sync.set(data, resolve);
});
}

// 定义默认值
const DEFAULT_SETTINGS = {
  voice: 'zh-CN-YunjianNeural',
  format: 'mp3',
  speed: 1,
  splitLength: 200,
  concurrency: 1,
  openai: {
    apiUrl: 'http://localhost/v1/audio/speech',
    apiKey: 'b4297f4c-5795-4427-ad51-049e5c1ad215'
  }
};

// 防抖函数
function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

// 显示错误通知
function showErrorNotification(messageKey, params = {}, duration = 5000) {
  // 获取当前语言
  const lang = window.tts_currentLang || 'en';
  // 获取翻译文本
  let message = translations[lang][messageKey] || messageKey;
  // 替换参数
  Object.entries(params).forEach(([key, value]) => {
    message = message.replace(`{${key}}`, value);
  });

  // 创建通知元素
  const notification = document.createElement('div');
  notification.className = 'error-notification';
  notification.textContent = message;
  document.body.appendChild(notification);

  // 设置自动消失
  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => notification.remove(), 300);
  }, duration);
}

// 清洗数据，过滤非文字字符，仅保留字母、数字和基本字符
function filterTextForTTS(text) {
  return text.replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s]/g, '');
}

/**
 * 将文本按最大长度分割成多个段落，并确保每个段落以标点符号结尾。
 *
 * @param {string} text - 要处理的原始文本。
 * @param {number} maxLength - 每个段落的最大长度。
 * @returns {Array<string>} 分割后的段落数组。
 */
function splitText(text, maxLength) {
  // 如果文本为空或最大长度小于等于0，返回空数组并打印警告信息
  if (!text || maxLength <= 0) {
    console.warn('splitText: Invalid input', { text, maxLength });
    return [];
  }
  // 初始化一个空数组来存储分割后的段落
  const segments = [];
  // 从文本的起始位置开始处理
  let start = 0;

  // inputMaxLength = maxLength

  // 当起始位置小于文本长度时继续循环
  while (start < text.length) {
    /** 
    * 第一段和第二段，且 maxLength 大于100，将 maxLength 设置最大长度为100
    * 优化快速播放的体验
    * 
    * 暂时注销，给出提示让用户自己去设置
    const condition = start === 0 || start === 1 && maxLength > 100;
    maxLength = condition ? 100 : inputMaxLength;
    */

    // 确定当前段落的结束位置，最大不超过 `maxLength`
    let end = Math.min(start + maxLength, text.length);

    // 如果结束位置还没有到达文本末尾
    if (end < text.length) {
      // 从结束位置向前找到最近的一个标点符号（中英文逗号、句号、分号、冒号、问号或感叹号）
      while (end > start && !/[,.;:!?\u3002|\uff1b|\uff0c|\uff1a|\uff1f|\uff01]/.test(text[end])) end--;
      // 如果没有找到标点符号，确保段落长度不超过 `maxLength`
      if (end === start) end = start + maxLength;
    }

    // 将从起始位置到结束位置的文本（去除首尾空格后）添加到段落数组中
    segments.push(window.tts_filterTextForTTS(text.slice(start, end).trim()));

    // 更新起始位置为当前段落结束位置加1
    start = end + 1;
  }
  console.log('splitText called:', { textLength: text.length, maxLength, segmentsLength: segments.length });
  // 返回分割后的段落数组
  return segments;
}

// 暴露全局变量和函数（假设这些在其他文件中定义）
window.tts_getStorageData = getStorageData;
window.tts_setStorageData = setStorageData;
window.tts_debounce = debounce;
window.tts_DEFAULT_SETTINGS = DEFAULT_SETTINGS;
window.tts_showErrorNotification = showErrorNotification;
window.tts_filterTextForTTS = filterTextForTTS;
window.tts_splitText = splitText;