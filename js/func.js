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

// 暴露全局变量和函数（假设这些在其他文件中定义）
window.getStorageData = getStorageData;
window.setStorageData = setStorageData;
window.debounce = debounce;
window.DEFAULT_SETTINGS = DEFAULT_SETTINGS;