document.getElementById('saveBtn').addEventListener('click', async () => {
  const notionKey = document.getElementById('notionKey').value;
  const databaseId = document.getElementById('databaseId').value;
  const kimiKey = document.getElementById('kimiKey').value;
  const showIcon = document.getElementById('showIconToggle').checked;
  
  if (notionKey && databaseId && kimiKey) {
    if (!notionKey.startsWith('ntn_')) {
      alert('Notion API Key必须以ntn_开头！');
      return;
    }
    
    const saveBtn = document.getElementById('saveBtn');
    saveBtn.textContent = '保存成功！';
    saveBtn.classList.add('save-success');
    
    await chrome.storage.local.set({
      notionKey,
      databaseId,
      kimiKey,
      showIcon
    });
    
    // 通知content script更新图标显示状态
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'updateIconVisibility',
        showIcon: showIcon
      });
    });

    setTimeout(() => {
      window.close();
    }, 1000);
  } else {
    alert('请填写所有必要的配置信息！');
  }
});

// 加载保存的配置
chrome.storage.local.get(['notionKey', 'databaseId', 'kimiKey', 'showIcon'], (result) => {
  if (result.notionKey) document.getElementById('notionKey').value = result.notionKey;
  if (result.databaseId) document.getElementById('databaseId').value = result.databaseId;
  if (result.kimiKey) document.getElementById('kimiKey').value = result.kimiKey;
  if (result.showIcon !== undefined) document.getElementById('showIconToggle').checked = result.showIcon;
});

// 添加输入框焦点效果
const inputs = document.querySelectorAll('input');
inputs.forEach(input => {
  input.addEventListener('focus', () => {
    input.parentElement.style.boxShadow = '0 2px 8px rgba(46,170,220,0.15)';
  });
  
  input.addEventListener('blur', () => {
    input.parentElement.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
  });
}); 