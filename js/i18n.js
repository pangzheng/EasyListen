// 国际化语言包
const translations = {
    en: {
      // popup.html
      title: "EasyListen",
      placeholder: "Page content will appear here",
      settings: "Settings",
      themeLight: "Light",
      themeDark: "Dark",
      language: "Language",
      languageTooltip: "Select the interface language",
      generate: "Listen",
      version: "Version",
      // Pop up the playback page 
      loading: "Loading...",
      download: "Download",
      // optoins.html
      langEnglish: "English",
      langChinese: "中文",
      settingsTitle: "EasySpeak",
      voice: "Voice",
      voiceTooltip: "Select the voice for text-to-speech",
      xiaoxiao: "Xiaoxiao",
      xiaoyi: "Xiaoyi",
      yunjian: "Yunjian",
      yunxi: "Yunxi",
      yunxia: "Yunxia",
      yunyang: "Yunyang",
      xiaobei: "Xiaobei (Liaoning)",
      xiaoni: "Xiaoni (Shaanxi)",
      preview: "Preview",
      previewTooltip: "Preview the selected voice",
      play: "Play",
      stop: "Stop",
      advancedSettings: "Advanced Settings",
      hideAdvancedSettings: "Hide Advanced Settings",
      outputFormat: "Download Format",
      formatTooltip: "Choose the audio output format",
      speedAdjustment: "Speed Adjustment",
      speedTooltip: "Adjust the playback speed,Range -100% to +100% (default 0%)",
      splitLength: "Text Split Length",
      splitTooltip: "Set the length for splitting text",
      concurrency: "Concurrency(test)",
      concurrencyTooltip: "Number of simultaneous audio requests",
      apiUrl: "Custom API endpoint URL",
      apiUrlTooltip: "Please fill in the API address that supports the OpenAI voice specification",
      apiKey: "API-KEY",
      apiKeyTooltip: "Please fill in the corresponding API key",
      saveSuccess: "Settings saved!"
    },
    zh: {
      // popup.html
      title: "易听",
      placeholder: "页面内容将显示在此处",
      settings: "设置",
      themeLight: "亮色",
      themeDark: "暗色",
      language: "语言",
      languageTooltip: "选择界面语言",
      generate: "听",
      version: "版本",
      // Pop up the playback page 
      loading: "载入中...",
      download: "下载",
      // optoins.html
      langEnglish: "English",
      langChinese: "中文",
      settingsTitle: "易声",
      voice: "声音",
      voiceTooltip: "选择文本转语音的声音",
      xiaoxiao: "晓晓",
      xiaoyi: "晓伊",
      yunjian: "云健",
      yunxi: "云希",
      yunxia: "云夏",
      yunyang: "云扬",
      xiaobei: "晓北（辽宁）",
      xiaoni: "晓妮（陕西）",
      preview: "试听",
      previewTooltip: "试听所选声音",
      play: "播放",
      stop: "停止",
      advancedSettings: "高级设置",
      hideAdvancedSettings: "隐藏高级设置",
      outputFormat: "下载格式",
      formatTooltip: "选择音频输出格式",
      speedAdjustment: "速度调整",
      speedTooltip: "调整播放速度,范围 -100% 到 +100% (默认 0%)",
      splitLength: "文本分割长度",
      splitTooltip: "设置文本分割长度,推荐200",
      concurrency: "并发数(测试)",
      concurrencyTooltip: "同时处理的音频请求数量",
      apiUrl: "自定义 API 接口地址",
      apiUrlTooltip: "支持 openai 语音规范的 api 地址",
      apiKey: "API-KEY",
      apiKeyTooltip: "请填写对应 api 密钥,请到 api 服务商获取",
      saveSuccess: "设置保存成功！" 
    }
};

// 更新界面语言
function updateLanguage(lang) {
  window.currentLang = lang;

  // 获取版本号
  const manifest = chrome.runtime.getManifest();
  const version = manifest.version;

  // 处理 data-i18n
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    const target = element.getAttribute('data-i18n-target') || 'textContent';

    if (translations[lang][key]) {
      if (key === 'version') {
        element.textContent = `${translations[lang][key]} ${version}`;
      } else if (target === 'placeholder' && element.tagName === 'TEXTAREA') {
        element.placeholder = translations[lang][key];
      } else if (target === 'data-tooltip') {
        element.setAttribute('data-tooltip', translations[lang][key]);
      } else {
        element.textContent = translations[lang][key];
      }
    } else {
      console.warn(`Translation key "${key}" not found for language "${lang}"`);
    }
  });

  // 处理 data-tooltip-i18n
  document.querySelectorAll('[data-tooltip-i18n]').forEach(element => {
    const key = element.getAttribute('data-tooltip-i18n');
    if (translations[lang][key]) {
      element.setAttribute('data-tooltip', translations[lang][key]);
    } else {
      console.warn(`Tooltip translation key "${key}" not found for language "${lang}"`);
    }
  });

  // 特别处理 <title>
  const titleElement = document.querySelector('title[data-i18n]');
  if (titleElement && translations[lang][titleElement.getAttribute('data-i18n')]) {
    document.title = translations[lang][titleElement.getAttribute('data-i18n')];
    console.log('Title updated to:', document.title);
  }
  
  // 获取 DOM 元素（假设这些已在 elements 中定义）
  const elements = {
    langToggleBtn: document.getElementById('lang-toggle'),
    themeBtn: document.getElementById('themeBtn'),
    settingsBtn: document.getElementById('settings-btn'),
    isLight: document.body.classList.contains('light')
  };

  // 变更按钮文本
  if (elements.langToggleBtn) {
    // 根据当前语言显示目标语言的名称
    elements.langToggleBtn.textContent = lang === 'en' ? translations[lang]['langChinese'] : translations[lang]['langEnglish'];
  } else {
    // 提示信息
    console.info('langToggleBtn not found in DOM');
  }

  if (elements.themeBtn) {
    // 动态更新主题按钮文本，确保与当前主题一致
    elements.themeBtn.textContent = elements.isLight ? translations[lang]['themeDark'] : translations[lang]['themeLight'];
  } else {
    // 提示信息
    console.info('themeBtn not found in DOM');
  }

  if (elements.settingsBtn) {
    elements.settingsBtn.textContent = translations[lang]['settings'];
  } else {
    // 提示信息
    console.info('settingsBtn not found in DOM');
  }
}

// // 页面加载时初始化语言
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const result = await window.getStorageData(['language']);
    const savedLanguage = result.language || 'en';
    updateLanguage(savedLanguage);
  } catch (error) {
    console.error('Failed to initialize language from storage:', error);
    alert(window.currentLang === 'en' 
      ? `Failed to initialize language from storage:' ${error} `
      : `从存储初始化语言失败：${error}`);
    // 后备方案：使用默认语言 'en'
    updateLanguage('en');
  }
});
  
// 暴露全局变量和函数
window.updateLanguage = updateLanguage;