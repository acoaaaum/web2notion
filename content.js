// 创建浮动按钮
function createFloatingButton() {
  try {
    if (!chrome.runtime?.id) {
      console.warn('Extension context invalidated, please refresh the page');
      return;
    }

    const button = document.createElement('button');
    button.id = 'notion-import-btn';
    
    // 创建图标元素
    const icon = document.createElement('img');
    icon.src = chrome.runtime.getURL('icon48.png');
    icon.style.cssText = `
      width: 24px;
      height: 24px;
      filter: brightness(0) invert(1);
      transition: transform 0.3s ease;
    `;
    
    button.appendChild(icon);
    button.style.cssText = `
      position: fixed;
      right: 20px;
      bottom: 20px;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      border: none;
      background: rgba(46, 170, 220, 0.9);
      backdrop-filter: blur(8px);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      transition: all 0.3s ease;
      z-index: 999999;
    `;
    
    // 添加悬停效果
    button.addEventListener('mouseover', () => {
      button.style.transform = 'scale(1.1)';
      button.style.boxShadow = '0 4px 12px rgba(46, 170, 220, 0.4)';
      icon.style.transform = 'scale(1.1)';
    });
    
    button.addEventListener('mouseout', () => {
      button.style.transform = 'scale(1)';
      button.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
      icon.style.transform = 'scale(1)';
    });
    
    document.body.appendChild(button);
    button.addEventListener('click', handleImport);
    
    // 默认隐藏按钮
    chrome.storage.local.get(['showIcon'], (result) => {
      if (chrome.runtime?.id) {
        button.style.display = result.showIcon ? 'flex' : 'none';
      }
    });
  } catch (error) {
    console.error('Error creating floating button:', error);
  }
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (!chrome.runtime?.id) {
      console.warn('Extension context invalidated, please refresh the page');
      return;
    }

    if (request.action === 'updateIconVisibility') {
      const button = document.getElementById('notion-import-btn');
      if (button) {
        button.style.display = request.showIcon ? 'flex' : 'none';
      }
    }
  } catch (error) {
    console.error('Message listener error:', error);
  }
});

// 添加快捷键监听
function addShortcutListener() {
  document.addEventListener('keydown', (event) => {
    if (event.altKey && event.key.toLowerCase() === 'w') {
      handleImport();
    }
  });
}

// 切换按钮显示/隐藏
function toggleButtonVisibility() {
  const button = document.getElementById('notion-import-btn');
  if (button) {
    button.style.display = button.style.display === 'none' ? 'flex' : 'none';
  }
}

async function handleImport() {
  const progress = createProgressIndicator();
  
  try {
    // 检查扩展是否可用
    if (!chrome.runtime?.id) {
      throw new Error('扩展程序已更新，请刷新页面后重试');
    }

    // 获取页面所有文本内容
    progress.show('正在分析页面内容...');
    const pageContent = document.body.innerText;
    
    // 提取头像URL
    const avatarUrl = extractAvatarUrl();
    
    // 使用Kimi分析内容
    let extractedData;
    try {
      extractedData = await chrome.runtime.sendMessage({
        type: 'EXTRACT_CONTENT',
        content: pageContent
      });
    } catch (e) {
      if (!chrome.runtime?.id) {
        throw new Error('扩展程序已更新，请刷新页面后重试');
      }
      throw e;
    }

    if (extractedData.error) {
      throw new Error(extractedData.error);
    }

    // 添加头像URL到提取的数据中
    if (avatarUrl) {
      extractedData.avatar = avatarUrl;
    }

    // 保存到Notion
    progress.update('正在保存到Notion...');
    let result;
    try {
      result = await chrome.runtime.sendMessage({
        type: 'SAVE_TO_NOTION',
        data: extractedData
      });
    } catch (e) {
      if (!chrome.runtime?.id) {
        throw new Error('扩展程序已更新，请刷新页面后重试');
      }
      throw e;
    }

    if (result.error) {
      throw new Error(result.error);
    }

    // 完成
    progress.update('✅ 保存成功！');
    setTimeout(() => {
      progress.hide();
      showNotification('数据已成功保存到Notion！');
    }, 1000);
    
  } catch (error) {
    console.error('操作失败:', error);
    const errorMessage = error.message === 'Extension context invalidated.' 
      ? '扩展程序已更新，请刷新页面后重试'
      : error.message;
    
    progress.update('❌ ' + errorMessage);
    setTimeout(() => {
      progress.hide();
      showNotification('操作失败: ' + errorMessage, 'error');
    }, 2000);
  }
}

// 优化提取头像URL的函数
function extractAvatarUrl() {
  // 定义可能的头像选择器
  const avatarSelectors = {
    // LinkedIn头像选择器
    linkedin: [
      '.pv-top-card-profile-picture__image',  // 个人主页头像
      '.profile-photo-edit__preview',         // 编辑页面头像
      '.presence-entity__image',              // 小卡片头像
      '.artdeco-entity-image--profile-photo', // 通用个人头像
      '.ghost-person--size-8',                // 默认头像
    ],
    
    // 通用头像选择器
    common: [
      // 基于alt属性
      'img[alt*="avatar" i]',
      'img[alt*="profile" i]',
      'img[alt*="头像" i]',
      'img[alt*="用户" i]',
      'img[alt*="profile photo" i]',
      'img[alt*="user" i]',
      
      // 基于class名称
      'img[class*="avatar" i]',
      'img[class*="profile" i]',
      'img[class*="photo" i]',
      'img[class*="user" i]',
      'img[class*="head" i]',
      
      // 基于id名称
      'img[id*="avatar" i]',
      'img[id*="profile" i]',
      'img[id*="photo" i]',
      'img[id*="user" i]',
      
      // 基于src路径
      'img[src*="avatar" i]',
      'img[src*="profile" i]',
      'img[src*="user" i]'
    ]
  };

  // 辅助函数：检查图片是否有效
  function isValidImage(img) {
    // 检查图片是否加载完成且有效
    if (!img.complete || !img.naturalWidth || !img.naturalHeight) {
      return false;
    }
    
    // 检查尺寸是否合适（通常头像是正方形且不会太小）
    const minSize = 48;  // 最小尺寸
    const maxSize = 400; // 最大尺寸
    const aspectRatio = img.naturalWidth / img.naturalHeight;
    
    return (
      img.naturalWidth >= minSize &&
      img.naturalWidth <= maxSize &&
      img.naturalHeight >= minSize &&
      img.naturalHeight <= maxSize &&
      aspectRatio >= 0.9 && // 允许轻微的长宽比偏差
      aspectRatio <= 1.1
    );
  }

  // 辅助函数：检查URL是否有效
  function isValidUrl(url) {
    if (!url) return false;
    
    // 排除base64图片
    if (url.startsWith('data:')) return false;
    
    // 排除占位图片和默认头像
    const invalidPatterns = [
      'placeholder',
      'default-avatar',
      'default-user',
      'default.png',
      'noimage',
      'blank.gif'
    ];
    
    return !invalidPatterns.some(pattern => url.toLowerCase().includes(pattern));
  }

  // 辅助函数：获取图片的有效URL
  function getValidImageUrl(img) {
    const url = img.src || img.getAttribute('data-src') || img.getAttribute('data-original');
    return isValidUrl(url) ? url : null;
  }

  // 1. 首先尝试LinkedIn特定选择器
  for (const selector of avatarSelectors.linkedin) {
    const img = document.querySelector(selector);
    if (img && isValidImage(img)) {
      const url = getValidImageUrl(img);
      if (url) return url;
    }
  }

  // 2. 然后尝试通用选择器
  for (const selector of avatarSelectors.common) {
    const img = document.querySelector(selector);
    if (img && isValidImage(img)) {
      const url = getValidImageUrl(img);
      if (url) return url;
    }
  }

  // 3. 最后尝试查找所有可能的头像图片
  const allImages = Array.from(document.querySelectorAll('img'));
  const potentialAvatars = allImages
    .filter(img => {
      // 检查图片是否符合头像特征
      if (!isValidImage(img)) return false;
      
      // 检查图片位置（通常头像在页面上方）
      const rect = img.getBoundingClientRect();
      const isInTopPortion = rect.top < window.innerHeight / 2;
      
      // 检查周围元素是否包含用户相关文本
      const surroundingText = img.parentElement?.textContent?.toLowerCase() || '';
      const hasUserContext = [
        'profile',
        'user',
        'avatar',
        'photo',
        '用户',
        '头像',
        '简历'
      ].some(keyword => surroundingText.includes(keyword));
      
      return isInTopPortion && hasUserContext;
    })
    .sort((a, b) => {
      // 优先选择更大的图片
      const aSize = a.naturalWidth * a.naturalHeight;
      const bSize = b.naturalWidth * b.naturalHeight;
      return bSize - aSize;
    });

  // 返回找到的第一个合适的头像URL
  for (const img of potentialAvatars) {
    const url = getValidImageUrl(img);
    if (url) return url;
  }

  // 如果没有找到合适的头像，返回null
  return null;
}

// 添加进度指示器组件
function createProgressIndicator() {
  const container = document.createElement('div');
  container.id = 'notion-progress';
  container.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(255, 255, 255, 0.95);
    padding: 20px 30px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 10001;
    display: none;
    text-align: center;
    min-width: 200px;
  `;

  const spinner = document.createElement('div');
  spinner.className = 'notion-spinner';
  
  const status = document.createElement('div');
  status.className = 'notion-status';
  status.style.cssText = `
    margin-top: 12px;
    font-size: 14px;
    color: #333;
  `;

  container.appendChild(spinner);
  container.appendChild(status);
  document.body.appendChild(container);
  
  return {
    show: (message) => {
      container.style.display = 'block';
      status.textContent = message;
    },
    update: (message) => {
      status.textContent = message;
    },
    hide: () => {
      container.style.display = 'none';
    }
  };
}

// 通知提示函数
function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 24px;
    border-radius: 8px;
    background-color: ${type === 'success' ? '#4caf50' : '#f44336'};
    color: white;
    z-index: 10001;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transform: translateX(120%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    font-size: 14px;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.transform = 'translateX(0)';
  }, 100);

  setTimeout(() => {
    notification.style.transform = 'translateX(120%)';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// 添加样式
const style = document.createElement('style');
document.head.appendChild(style);
style.textContent = `
  #notion-import-btn {
    position: fixed;
    left: 20px;
    bottom: 20px;
    padding: 10px 20px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    z-index: 10000;
    transition: all 0.3s ease;
  }

  #notion-import-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .notion-spinner {
    width: 30px;
    height: 30px;
    border: 3px solid #f3f3f3;
    border-top: 3px solid #2eaadc;
    border-radius: 50%;
    margin: 0 auto;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .notion-status {
    animation: fadeIn 0.3s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

createFloatingButton();
addShortcutListener(); 