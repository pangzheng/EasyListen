// 获取当前设置的辅助函数
async function getCurrentSettings() {
  const { settings } = await window.tts_getStorageData(['settings']);
  // return settings || window.tts_DEFAULT_SETTINGS;
  return {
    ...window.tts_DEFAULT_SETTINGS,
    ...settings,
    openai: {
      ...window.tts_DEFAULT_SETTINGS.openai,
      ...(settings?.openai || {})
    }
  };
}

// 更新 textarea 内容的函数
async function updateTextareaContent(textarea) {
  try {
    // 使用 chrome.tabs.query 获取当前活动标签页的信息
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // 如果 URL 是无效的或者以 "chrome://" 或 "about:" 开头，则提示错误信息
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) {
      textarea.value = '';
      window.tts_showErrorNotification('pageAccessError');
    } else {
      // 如果 URL 是有效的，则发送消息到内容脚本，获取页面内容
      try {
        // 尝试向当前标签页发送消息，获取其内容
        const response = await chrome.tabs.sendMessage(tab.id, { action: "getPageContent" });

        // 如果响应中包含 fullText，则对其进行处理并更新 textarea 的值
        if (response && response.fullText) {
          // 如果响应中包含 fullText，更新 textarea 的值
          textarea.value = response.fullText;
        } else {
          // 否则提示没有内容可用的信息
          textarea.value = '';
          window.tts_showErrorNotification('noContentAvailable');
        }
      } catch (sendError) {
        // 如果发送消息时出现错误，且错误信息中包含 "Receiving end does not exist" 则提示脚本未加载
        if (sendError.message.includes('Receiving end does not exist')) {
          console.error('Content script not loaded in this tab:', sendError);
          textarea.value = '';
          window.tts_showErrorNotification('contentScriptNotLoaded');
        } else {
          // 如果其他类型的错误发生，则抛出此错误
          throw sendError;
        }
      }
    }
  } catch (error) {
    // 处理外部的异常，即在获取标签页信息时发生的错误
    console.error('Error fetching page content:', error);
    textarea.value = '';
    window.tts_showErrorNotification('fetchContentError');
  }
}

// 页面加载完成时的初始化函数
document.addEventListener('DOMContentLoaded', async () => {

  // 检查页面上下文
  if (!document.querySelector('#text-area')) {
    console.warn('ui.js running in unexpected context, skipping initialization');
    window.tts_showErrorNotification('unexpectedContext');
    return;
  }

  // 定义所有需要检查的 DOM 元素到一个对象中
  const elements = {
    textarea: document.getElementById('text-area'),
    langToggleBtn: document.getElementById('lang-toggle'),
    themeBtn: document.getElementById('themeBtn'),
    submitBtn: document.getElementById('generate-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    versionDisplay: document.getElementById('version-display') // 新增版本号元素
  };
  
  // 版本号已在 i18n.js 中设置，这里仅验证
  if (elements.versionDisplay) {
    console.log('Popup version display:', elements.versionDisplay.textContent);
  }
  
  // 获取当前设置信息（从本地存储或者其他地方获取）
  const settings = await getCurrentSettings();

  // 对 textarea 进行格式化，设置默认值
  await updateTextareaContent(elements.textarea); 

  // 检查所有 DOM 元素是否存在
  const missingElements = Object.entries(elements)
    .filter(([key, value]) => !value)
    .map(([key]) => key);
  
  if (missingElements.length > 0) {
    console.error('The following DOM elements were not found:', missingElements);
    window.tts_showErrorNotification('domElementsMissing', { elements: missingElements.join(', ') });
    return;
  }
  
  // 初始化语言和主题
  const initState = async () => {
    try {
      const { language, theme } = await window.tts_getStorageData(['language', 'theme']);
      window.tts_currentLang = language || 'en';
      window.tts_currentTheme = theme || 'light';
      document.body.classList.remove('light', 'dark');
      document.body.classList.add(window.tts_currentTheme);
      window.tts_updateLanguage(window.tts_currentLang);
      await updateTextareaContent(elements.textarea);
    } catch (error) {
      console.error('Error initializing state:', error);
      window.tts_showErrorNotification('initStateError', { error: error.message });
      window.tts_currentLang = 'en';
      window.tts_currentTheme = 'light';
      document.body.classList.remove('light', 'dark');
      document.body.classList.add(window.tts_currentTheme);
      window.tts_updateLanguage(window.tts_currentLang);
      await updateTextareaContent(elements.textarea);
    }
  };

  await initState();

  // 设置按钮
  elements.settingsBtn.addEventListener('click', () => {
    // 打印调试信息
    // console.log('Settings button clicked, opening options page...');
    chrome.runtime.openOptionsPage();
  });

  // 切换语言按钮
  elements.langToggleBtn.addEventListener('click', async () => {
    // 打印调试信息
    // console.log('当前语言:', window.tts_currentLang); 
    const newLang = window.tts_currentLang === 'en' ? 'zh' : 'en';
    window.tts_updateLanguage(newLang);
    try {
      await window.tts_setStorageData({ language: newLang }); // 初始化参数
      await updateTextareaContent(elements.textarea); // 语言切换后更新 textarea
      // 打印调试信息
      // console.log('Language saved to chrome.storage.sync:', newLang);
    } catch (error) {
      console.error('Error saving language:', error);
      window.tts_showErrorNotification('saveLanguageError', { error: error.message });
    }
  });

  // 切换主题按钮
  elements.themeBtn.addEventListener('click', async () => {
    window.tts_currentTheme = document.body.classList.contains('light') ? 'dark' : 'light';
    document.body.classList.remove('light', 'dark');
    document.body.classList.add(window.tts_currentTheme);
    window.tts_updateLanguage(window.tts_currentLang);
    try {
      await window.tts_setStorageData({ theme: window.tts_currentTheme });
      // console.log('ui.js: Theme saved:', window.tts_currentTheme);
      // 调试按钮样式
      // console.log('ui.js: langToggleBtn background:', getComputedStyle(elements.langToggleBtn).backgroundColor);
      // console.log('ui.js: langToggleBtn color:', getComputedStyle(elements.langToggleBtn).color);
    } catch (error) {
      console.error('Error saving theme:', error);
      window.tts_showErrorNotification('saveThemeError', { error: error.message });
    }
  });

  // 监听生成音频按钮的点击事件
  elements.submitBtn.addEventListener('click', async () => {
    // 日志输出 textarea 的值
    // console.log('textarea.value:', elements.textarea.value);

    // 获取 textarea 并格式化
    const content = elements.textarea.value.replace(/\s+/g, ' ').trim();

     // 如果没有输入文本，则提示用户
    if (!content) {
      window.tts_showErrorNotification('emptyTextError');
      return;
    }

    // 将内容按指定长度分割成多个段落
    const segments = window.tts_splitText(content, settings.splitLength);

    console.log('Text segments:', segments);

    // 发送消息到内容脚本，触发浮动 UI 和音频生成
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // 发送消息到 generateAudio 签页的内容脚本，触发浮动 UI 和音频生成
    chrome.tabs.sendMessage(tab.id, {
      action: 'generateAudio',
      segments, // 文本分片数据
      voice: settings.voice, // 语音设置
      speed: settings.speed, // 音频播放速度
      format: settings.format, // 音频下载格式
      concurrency: settings.concurrency, //并发处理线程数（优化性能）
    }, (response) => { // 回调函数：接收内容脚本的响应
      if (chrome.runtime.lastError) { //检查消息发送过程中是否发生错误
        console.error('Error sending message:', chrome.runtime.lastError); // 记录详细错误信息
        window.tts_showErrorNotification('sendMessageError', { error: chrome.runtime.lastError.message });
      } else {
        // 打印跟踪信息
        console.log('Audio generation started:', response);
      }
    });
  });

  // 监听 chrome.storage 的变化
  const handleStorageChange = window.tts_debounce(async (changes, area) => {
    if (area === 'sync') {
      if (changes.language) {
        window.tts_currentLang = changes.language.newValue;
        window.tts_updateLanguage(window.tts_currentLang);
        await updateTextareaContent(elements.textarea);
        console.log('ui.js: Language synced from storage:', window.tts_currentLang);
      }
      if (changes.theme) {
        window.tts_currentTheme = changes.theme.newValue;
        document.body.classList.remove('light', 'dark');
        document.body.classList.add(window.tts_currentTheme);
        console.log('ui.js: Theme synced from storage:', window.tts_currentTheme);
        // 调试按钮样式
        console.log('ui.js: langToggleBtn background:', getComputedStyle(elements.langToggleBtn).backgroundColor);
        console.log('ui.js: langToggleBtn color:', getComputedStyle(elements.langToggleBtn).color);
      }
    }
  }, 100);

  chrome.storage.onChanged.addListener(handleStorageChange);

  // 清理监听器
  const cleanup = () => {
    chrome.storage.onChanged.removeListener(handleStorageChange);
    console.log('ui.js: Cleaned up event listeners');
  };
  window.addEventListener('unload', cleanup);
});