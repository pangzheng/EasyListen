// DOM元素引用
const elements = {
  voiceSelect: document.getElementById('voices'),
  formatSelect: document.getElementById('format'),
  rateSlider: document.getElementById('rate-slider'),
  rateValue: document.getElementById('rate-value'),
  splitSlider: document.getElementById('split-slider'),
  splitValue: document.getElementById('split-value'),
  concurrencySelect: document.getElementById('concurrency'),
  languageBtn: document.getElementById('language'),
  saveMessage: document.getElementById('save-message'),
  playExampleBtn: document.getElementById('play-example'),
  stopExampleBtn: document.getElementById('stop-example'),
  apiUrlInput: document.getElementById('api-url'),
  apiKeyInput: document.getElementById('api-key'),
  advancedToggle: document.getElementById('advanced-toggle'),
  advancedSettings: document.getElementById('advanced-settings')
};

const exampleAudio = new Audio();

// 通用的更新函数
const updateSetting = async (key, value, subKey = null) => {
  try {
    const result = await window.tts_getStorageData(['settings']);
    const currentSettings = result.settings || window.tts_DEFAULT_SETTINGS;

    // 如果是嵌套设置（如 openai.apiUrl），确保 openai 对象存在
    if (subKey && !currentSettings[key]) {
      currentSettings[key] = { ...window.tts_DEFAULT_SETTINGS[key] };
    }

    if (subKey) {
      currentSettings[key][subKey] = value;
    } else {
      currentSettings[key] = value;
    }

    await new Promise((resolve, reject) => {
      chrome.storage.sync.set({ settings: currentSettings }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(`Failed to save ${key}: ${chrome.runtime.lastError.message}`));
        } else {
          resolve();
        }
      });
    });
    // console.log(`${key}${subKey ? `.${subKey}` : ''} saved:`, value);
    showSaveMessage();
  } catch (error) {
    console.error(`Failed to update setting ${key}${subKey ? `.${subKey}` : ''}:`, error);
    window.tts_showErrorNotification('saveSettingError', { 
      key: subKey ? `${key}.${subKey}` : key, 
      error: error.message 
    });
  }
};

// 显示保存提示
function showSaveMessage() {
  if (elements.saveMessage) {
  // 添加显示类名
  elements.saveMessage.classList.add('show');
  // 2秒后移除显示类名，隐藏提示信息
  setTimeout(() => elements.saveMessage.classList.remove('show'), 2000); 
  } else {
    console.warn('Save message element not found, skipping display');
    window.tts_showErrorNotification('saveSettingError', { key: 'saveMessage' });
  }
}

// 更新示例音频
async function updateExampleAudio() {
  if (!elements.voiceSelect) {
    console.warn('Voice select element not found, cannot update example audio');
    window.tts_showErrorNotification('voiceSelectNotFound');
    return;
  }

  const selectedVoice = elements.voiceSelect.value;
  const audioPath = `example/${selectedVoice}.wav`;

  try {
    const response = await fetch(audioPath, { method: 'HEAD' });
    if (!response.ok) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }
    exampleAudio.src = audioPath;
  } catch (error) {
    console.error('Failed to load example audio:', error);
    window.tts_showErrorNotification('audioFileNotFound', { voice: selectedVoice });
    exampleAudio.src = '';
    if (elements.playExampleBtn) elements.playExampleBtn.disabled = true;
  }
}

// 处理页面加载完成事件
document.addEventListener('DOMContentLoaded', async () => {
  const SAVE_DELAY = 500; // 可配置常量

  // 检查页面上下文
  if (!document.querySelector('#voices')) {
    console.warn('options.js running in unexpected context, skipping initialization');
    window.tts_showErrorNotification('unexpectedContext');
    return;
  }

  // 检查所有 DOM 元素是否存在
  const missingElements = Object.entries(elements)
    .filter(([key, value]) => !value)
    .map(([key]) => key);

  if (missingElements.length > 0) {
    console.error('Missing DOM elements:', missingElements);
    window.tts_showErrorNotification('domElementsMissing', { elements: missingElements.join(', ') });
    // 如果关键元素缺失，禁用相关功能
    if (!elements.voiceSelect || !elements.formatSelect || !elements.languageBtn) {
      console.error('Critical elements missing, stopping initialization');
      window.tts_showErrorNotification('criticalElementsMissing');
      return;
    }
  }

  // 获取所有 tooltip 图标
  const tooltipIcons = document.querySelectorAll('.tooltip-icon');

  // 防抖函数（复用 utils.js 中的 debounce）
  const adjustTooltipPosition = window.tts_debounce((event) => {
    const icon = event.target;
    const rect = icon.getBoundingClientRect();
    const tooltipText = icon.getAttribute('data-tooltip') || '';
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 重置所有定位类
    icon.classList.remove('tooltip-left', 'tooltip-right', 'tooltip-top', 'tooltip-scroll');

    // 创建临时元素并应用 .tooltip-temp 类
    const tempTooltip = document.createElement('div');
    tempTooltip.className = 'tooltip-temp';
    tempTooltip.textContent = tooltipText;
    document.body.appendChild(tempTooltip);
    const tooltipRect = tempTooltip.getBoundingClientRect();
    document.body.removeChild(tempTooltip);

    const tooltipWidth = Math.min(tooltipRect.width, 500); // 限制最大宽度为 500px
    const tooltipHeight = tooltipRect.height;

    // 计算提示框左右边界
    const tooltipLeft = rect.left + (rect.width / 2) - (tooltipWidth / 2);
    const tooltipRight = tooltipLeft + tooltipWidth;

    // 左侧溢出
    if (tooltipLeft < 10) {
      icon.classList.add('tooltip-left');
    }
    // 右侧溢出
    else if (tooltipRight > viewportWidth - 10) {
      icon.classList.add('tooltip-right');
    }

    // 垂直空间不足
    if (rect.bottom + tooltipHeight + 10 > viewportHeight) {
      icon.classList.add('tooltip-top');
    }

    // 超高提示框启用滚动
    if (tooltipHeight > 150) {
      icon.classList.add('tooltip-scroll');
    }
  }, 50);

  // 为每个 tooltip 图标添加鼠标悬停事件
  tooltipIcons.forEach((icon) => {
    icon.addEventListener('mouseenter', adjustTooltipPosition);
  });


  // 初始化默认设置（如果存储中没有 settings）
  const initDefaultSettings = async () => {
    const { settings } = await window.tts_getStorageData(['settings']);
    if (!settings) {
      await new Promise(resolve => {
        chrome.storage.sync.set({ settings: window.tts_DEFAULT_SETTINGS }, resolve);
      });
      console.log('Initialized default settings in storage');
    }
  };

  await initDefaultSettings();

  // 获取并应用存储数据
  const applyStoredSettings = async () => {
    try {
      const { settings, language, theme } = await window.tts_getStorageData(['settings', 'language', 'theme']);
      // const savedSettings = settings || window.tts_DEFAULT_SETTINGS;
      // 合并默认设置，确保 openai 字段存在
      const savedSettings = {
        ...window.tts_DEFAULT_SETTINGS,
        ...settings,
        openai: {
        ...window.tts_DEFAULT_SETTINGS.openai,
        ...(settings?.openai || {})
        }
      };

      const savedLanguage = language || 'en';
      const savedTheme = theme || 'light';

      // 更新UI
      if (elements.voiceSelect) elements.voiceSelect.value = savedSettings.voice;
      if (elements.formatSelect) elements.formatSelect.value = savedSettings.format;
      if (elements.rateSlider) {
        // 存储值（0-2）转换为 UI 值（-100% 到 +100%）
        const storedSpeed = savedSettings.speed !== undefined ? savedSettings.speed : 1; // 默认 1
        const uiSpeed = Math.round((storedSpeed - 1) * 100); // 逆向转换
        elements.rateSlider.value = uiSpeed;
        if (elements.rateValue) elements.rateValue.textContent = `${uiSpeed}%`;
      }
      if (elements.splitSlider) {
        elements.splitSlider.value = savedSettings.splitLength;
        if (elements.splitValue) elements.splitValue.textContent = savedSettings.splitLength;
      }
      if (elements.concurrencySelect) elements.concurrencySelect.value = savedSettings.concurrency;
      if (elements.languageBtn) elements.languageBtn.value = savedLanguage;
      if (elements.apiUrlInput) elements.apiUrlInput.value = savedSettings.openai.apiUrl;
      if (elements.apiKeyInput) elements.apiKeyInput.value = savedSettings.openai.apiKey;

      // 设置语言和主题
      document.body.classList.remove('light', 'dark');
      document.body.classList.add(savedTheme);
      window.tts_updateLanguage(savedLanguage);
    } catch (error) {
      console.error('Failed to load settings:', error);
      window.tts_showErrorNotification('saveSettingError', { key: 'settings', error: error.message });

      document.body.classList.remove('light', 'dark');
      document.body.classList.add('light');
      window.tts_updateLanguage('en');

      if (elements.voiceSelect) elements.voiceSelect.value = window.tts_DEFAULT_SETTINGS.voice;
      if (elements.formatSelect) elements.formatSelect.value = window.tts_DEFAULT_SETTINGS.format;
      if (elements.rateSlider) {
        elements.rateSlider.value = window.tts_DEFAULT_SETTINGS.speed;
        if (elements.rateValue) elements.rateValue.textContent = `${window.tts_DEFAULT_SETTINGS.speed}%`;
      }
      if (elements.splitSlider) {
        elements.splitSlider.value = window.tts_DEFAULT_SETTINGS.splitLength;
        if (elements.splitValue) elements.splitValue.textContent = window.tts_DEFAULT_SETTINGS.splitLength;
      }
      if (elements.concurrencySelect) elements.concurrencySelect.value = window.tts_DEFAULT_SETTINGS.concurrency;
      if (elements.languageBtn) elements.languageBtn.value = 'en';
      if (elements.apiUrlInput) elements.apiUrlInput.value = window.tts_DEFAULT_SETTINGS.openai.apiUrl;
      if (elements.apiKeyInput) elements.apiKeyInput.value = window.tts_DEFAULT_SETTINGS.openai.apiKey;
    }
  };

  await applyStoredSettings();

  // 版本号已在 i18n.js 的 updateLanguage 中处理，无需额外逻辑
  // 但可以添加日志验证
  const versionDisplay = document.getElementById('version-display');
  if (versionDisplay) {
    console.log('Version display initialized:', versionDisplay.textContent);
  }

  // 处理高级设置切换
  if (elements.advancedToggle && elements.advancedSettings) {
    elements.advancedToggle.addEventListener('click', () => {
      const isShown = elements.advancedSettings.classList.toggle('show');
      elements.advancedToggle.setAttribute('data-i18n', isShown ? 'hideAdvancedSettings' : 'advancedSettings');
      window.tts_updateLanguage(window.tts_currentLang); // 刷新按钮文本
    });
  }

  // 处理语言切换逻辑
  if (elements.languageBtn) {
    elements.languageBtn.addEventListener('change', (e) => {
      const lang = e.target.value;
      window.tts_updateLanguage(lang);
      chrome.storage.sync.set({ language: lang }, () => {
        // 打印调试信息
        // console.log('Language saved:', lang);
        showSaveMessage();
      });
    });
  }

  // 处理语音选择逻辑
  if (elements.voiceSelect) {
    elements.voiceSelect.addEventListener('change', (e) => {
      updateSetting('voice', e.target.value);
      if (elements.playExampleBtn) elements.playExampleBtn.disabled = false; // 重置按钮状态
    });
  }

  // 处理格式选择逻辑
  if (elements.formatSelect) {
    elements.formatSelect.addEventListener('change', (e) => {
      updateSetting('format', e.target.value);
    });
  }

  // 处理语速滑块逻辑
  if (elements.rateSlider && elements.rateValue) {
    const updateRateDisplay = () => {
      const sliderValue = parseInt(elements.rateSlider.value);
      elements.rateValue.textContent = `${sliderValue}%`; // 实时更新显示
    };

    const saveRate = window.tts_debounce((speed) => {
      updateSetting('speed', 1 + (speed / 100)); // 保存到存储
    }, SAVE_DELAY); // 缩短延迟到 300ms

    elements.rateSlider.addEventListener('input', () => {
      updateRateDisplay(); // 实时更新 UI
      saveRate(parseInt(elements.rateSlider.value)); // 防抖保存
    });
  }

  // 处理分段长度滑块逻辑
  if (elements.splitSlider && elements.splitValue) {
    const updateSplitDisplay = () => {
      const sliderValue = parseInt(elements.splitSlider.value);
      elements.splitValue.textContent = sliderValue; // 实时更新显示
    };

    const saveSplit = window.tts_debounce((splitLength) => {
      updateSetting('splitLength', splitLength); // 保存到存储
    }, SAVE_DELAY); // 缩短延迟到 300ms

    elements.splitSlider.addEventListener('input', () => {
      updateSplitDisplay(); // 实时更新 UI
      saveSplit(parseInt(elements.splitSlider.value)); // 防抖保存
    });
  }

  // 处理并发选择逻辑
  if (elements.concurrencySelect) {
    elements.concurrencySelect.addEventListener('change', (e) => {
      const newConcurrency = parseInt(e.target.value);
      updateSetting('concurrency', newConcurrency);
    });
  }

  // 新增：处理 API URL 和 API Key 输入
  if (elements.apiUrlInput) {
    const saveApiUrl = window.tts_debounce((apiUrl) => {
      updateSetting('openai', apiUrl, 'apiUrl');
    }, SAVE_DELAY);

    elements.apiUrlInput.addEventListener('input', (e) => {
      saveApiUrl(e.target.value);
    });
  }

  if (elements.apiKeyInput) {
    const saveApiKey = window.tts_debounce((apiKey) => {
      updateSetting('openai', apiKey, 'apiKey');
    }, SAVE_DELAY);

    elements.apiKeyInput.addEventListener('input', (e) => {
      saveApiKey(e.target.value);
    });
  }

  // 预览音频
  if (elements.playExampleBtn) {
    elements.playExampleBtn.addEventListener('click', async () => {
      await updateExampleAudio();
      if (exampleAudio.src) { // 仅在 src 有效时播放
        exampleAudio.play().catch(error => {
          console.error('Failed to play audio:', error);
          window.tts_showErrorNotification('playAudioFailed');
        });
      }
    });
  }

  if (elements.stopExampleBtn) {
    elements.stopExampleBtn.addEventListener('click', () => {
      exampleAudio.pause();
      exampleAudio.currentTime = 0;
    });
  }

  // 优化 storage 变化监听
  const handleStorageChange = window.tts_debounce((changes, area) => {
    if (area === 'sync') {
      if (changes.language && elements.languageBtn) {
        window.tts_currentLang = changes.language.newValue;
        elements.languageBtn.value = window.tts_currentLang;
        window.tts_updateLanguage(window.tts_currentLang);
        // console.log('options.js: Language synced from storage:', window.tts_currentLang);
      }
      if (changes.theme) {
        window.tts_currentTheme = changes.theme.newValue;
        document.body.classList.remove('light', 'dark');
        document.body.classList.add(window.tts_currentTheme);
        // console.log('options.js: Theme synced from storage:', window.tts_currentTheme);
      }
    }
  }, 100);

  chrome.storage.onChanged.addListener(handleStorageChange);

  // 清理监听器
  const cleanup = () => {
    chrome.storage.onChanged.removeListener(handleStorageChange);
    // console.log('options.js: Cleaned up event listeners');
  };
  window.addEventListener('unload', cleanup);
});