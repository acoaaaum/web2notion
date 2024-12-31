chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'EXTRACT_CONTENT') {
    console.log('收到内容提取请求');
    extractWithKimi(request.content)
      .then(data => {
        data.url = sender.tab.url;
        console.log('Kimi提取结果:', data);
        sendResponse(data);
      })
      .catch(error => {
        console.error('Kimi提取错误:', error);
        sendResponse({ error: error.message });
      });
    return true;
  }
  
  if (request.type === 'SAVE_TO_NOTION') {
    console.log('收到保存到Notion请求');
    saveToNotion(request.data)
      .then(result => {
        console.log('Notion保存结果:', result);
        sendResponse(result);
      })
      .catch(error => {
        console.error('Notion保存错误:', error);
        sendResponse({ error: error.message });
      });
    return true;
  }
});

async function extractWithKimi(content) {
  const { kimiKey } = await chrome.storage.local.get('kimiKey');
  
  if (!kimiKey) {
    throw new Error('请先配置Kimi API Key');
  }

  const prompt = `
    你是一个专业的信息提取助手。请仔细分析以下网页内容，提取关键信息。
    如果某项信息不存在，请返回null。请确保提取的信息准确可靠。

    需要提取的信息：
    1. name: 人名
    2. phone: 电话号码
    3. email: 电子邮件
    4. company: 公司名称
    5. position: 职位
    6. degree: 最高学历（如：博士、硕士、学士等）
    7. school: 毕业院校
    8. graduationTime: 毕业时间，请特别注意以下规则：
       - 优先提取最高学历的毕业时间
       - 如果看到"毕业时间"、"毕业日期"等明确字样，优先使用该时间
       - 对于在读学生：
         * 如果提到"预计毕业"，使用格式"预计YYYY-MM"
         * 如果提到"入学时间"，根据学制推算毕业时间（本科4年，硕士3年，博士4年）
       - 时间格式说明：
         * 有具体月份用"YYYY-MM"格式，如"2020-06"
         * 只有年份用"YYYY"格式，如"2020"
         * 未毕业用"预计"开头，如"预计2024-06"
    9. location: 所在地，只需要城市名称
    10. avatar: 页面中的头像图片URL（这个会由系统自动提取，你无需处理）
    11. url: 页面链接（这个会由系统自动填充，你无需提取）

    请以JSON格式返回，格式如下：
    {
      "name": "姓名",
      "phone": "电话号码",
      "email": "邮箱",
      "company": "公司",
      "position": "职位",
      "degree": "学历",
      "school": "学校",
      "graduationTime": "毕业时间（按上述格式）",
      "location": "城市名称",
      "url": null
    }

    注意事项：
    1. 对于毕业时间的提取要特别仔细，确保符合格式要求
    2. 如果有多个学历，优先提取最高学历的毕业时间
    3. 对于在读学生，通过入学时间和学制推算预计毕业时间
    4. location只需要提取城市名称，不需要包含国家或地区信息
    5. url字段请保持为null，系统会自动填充

    网页内容：${content}
  `;

  try {
    const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${kimiKey}`
      },
      body: JSON.stringify({
        model: 'moonshot-v1-8k',
        messages: [{
          role: 'user',
          content: prompt
        }],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      throw new Error('Kimi API请求失败');
    }

    const data = await response.json();
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Kimi API返回格式错误');
    }

    // 处理返回的数据
    const extractedData = JSON.parse(data.choices[0].message.content);
    
    // 格式化毕业时间
    if (extractedData.graduationTime) {
      // 如果不是预计毕业时间且只有年份，确格式统一
      if (!extractedData.graduationTime.includes('预计') && 
          extractedData.graduationTime.match(/^\d{4}$/)) {
        extractedData.graduationTime = extractedData.graduationTime + '-06'; // 默认添加6月
      }
    }

    // 清理城市名称
    if (extractedData.location) {
      // 移除可能的国家/地区信息
      extractedData.location = extractedData.location
        .replace(/^[^,]*,\s*/, '') // 移除逗号前的国家信息
        .replace(/,.+$/, '') // 移除逗号后的额外信息
        .trim();
    }

    return extractedData;
  } catch (error) {
    console.error('Kimi API调用失败:', error);
    throw new Error('内容分析失败: ' + error.message);
  }
}

async function saveToNotion(data) {
  const { notionKey, databaseId } = await chrome.storage.local.get(['notionKey', 'databaseId']);
  
  if (!notionKey || !databaseId) {
    throw new Error('请先配置 Notion API Key 和数据库 ID');
  }

  console.log('准备保存到Notion的数据:', data);
  
  try {
    // 首先检查是否存在重复
    const duplicateCheck = await checkDuplicate(notionKey, databaseId, data);
    if (duplicateCheck.hasDuplicate) {
      throw new Error(`已存在相同联系人：${duplicateCheck.message}`);
    }

    const truncateString = (str, maxLength) => {
      if (!str) return str;
      str = str.toString().trim();
      if (str.length <= maxLength) return str;
      return str.substring(0, maxLength - 3) + '...';
    };
    
    const dbResponse = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${notionKey}`,
        'Notion-Version': '2022-06-28'
      }
    });

    const dbSchema = await dbResponse.json();
    if (!dbResponse.ok) {
      throw new Error('获取数据库结构失败');
    }

    const properties = {};
    const schema = dbSchema.properties;

    // 添加数据清理函数
    function cleanSelectValue(value) {
      if (!value) return '';
      // 移除逗号，用空格或短横线替代
      return value.replace(/,/g, ' -').trim();
    }

    // 处理其他属性
    for (const [key, property] of Object.entries(schema)) {
      // 跳过已处理的GraduationTime
      if (key === 'GraduationTime') continue;

      const value = data[key.toLowerCase()] || data[key] || '';
      
      switch (property.type) {
        case 'title':
          // 修改Name字段处理，移除链接
          properties[key] = {
            title: [{ text: { content: truncateString(value, 100) } }]
          };
          break;
          
        case 'rich_text':
          properties[key] = {
            rich_text: [{ text: { content: truncateString(value, 1000) } }]
          };
          break;
          
        case 'select':
          if (value) {
            properties[key] = {
              select: { 
                name: truncateString(cleanSelectValue(value), 100)
              }
            };
          }
          break;
          
        case 'multi_select':
          if (value) {
            const values = Array.isArray(value) ? value : [value];
            properties[key] = {
              multi_select: values.map(v => ({ 
                name: truncateString(cleanSelectValue(v), 100)
              }))
            };
          }
          break;
          
        case 'email':
          if (value) {
            properties[key] = { email: truncateString(value, 200) };
          }
          break;
          
        case 'phone_number':
          if (value) {
            properties[key] = { phone_number: truncateString(value, 50) };
          }
          break;
          
        case 'number':
          if (value !== '') {
            properties[key] = { number: Number(value) || 0 };
          }
          break;
          
        case 'url':
          if (value) {
            properties[key] = { url: truncateString(value, 1000) };
          }
          break;
          
        case 'checkbox':
          properties[key] = { checkbox: Boolean(value) };
          break;
          
        case 'files':
          if (value) {
            properties[key] = {
              files: [{
                type: "external",
                name: key.toLowerCase(),
                external: {
                  url: value
                }
              }]
            };
          }
          break;
          
        default:
          console.log(`未处理的属性类型: ${property.type} for ${key}`);
      }
    }

    // 直接构造GraduationTime属性
    if (data.graduationTime) {
      properties.GraduationTime = {
        rich_text: [{
          text: {
            content: data.graduationTime
          }
        }]
      };
    }

    // 添加调试日志
    console.log('毕业时间值:', data.graduationTime);
    console.log('最终的properties:', properties);

    const cleanProperties = JSON.parse(JSON.stringify(properties, (key, value) => {
      if (typeof value === 'string') {
        return value.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '');
      }
      return value;
    }));

    // 构造请求体
    const requestBody = {
      parent: { database_id: databaseId },
      properties: cleanProperties
    };

    // 如果有头像URL，只添加icon属性
    if (data.avatar) {
      requestBody.icon = {
        type: "external",
        external: {
          url: data.avatar
        }
      };
    }

    const response = await fetch(`https://api.notion.com/v1/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionKey}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify(requestBody)
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error('Notion API错误响应:', result);
      throw new Error(result.message || '保存到Notion失败');
    }

    console.log('成功保存到Notion:', result);
    return result;
  } catch (error) {
    console.error('保存到Notion详细错误:', error);
    if (error.message.includes('Invalid database_id')) {
      throw new Error('数据库ID无效，请检查配置');
    } else if (error.message.includes('Unauthorized')) {
      throw new Error('Notion API Key无效或未授权');
    } else {
      throw new Error(`保存失败: ${error.message}`);
    }
  }
}

// 添加查重函数
async function checkDuplicate(notionKey, databaseId, data) {
  const { email, phone } = data;
  let filter = {
    or: []
  };

  // 构建查询条件
  if (email) {
    filter.or.push({
      property: 'Email',
      email: {
        equals: email
      }
    });
  }

  if (phone) {
    filter.or.push({
      property: 'Phone',
      phone_number: {
        equals: phone
      }
    });
  }

  // 如果没有email和phone，则不需要查重
  if (filter.or.length === 0) {
    return { hasDuplicate: false };
  }

  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionKey}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        filter: filter,
        page_size: 1
      })
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error('Notion查重API错误:', result);
      throw new Error('查重过程中出错');
    }

    if (result.results && result.results.length > 0) {
      return {
        hasDuplicate: true,
        message: '人选已存在'
      };
    }

    return { hasDuplicate: false };
  } catch (error) {
    console.error('查重过程出错:', error);
    throw new Error('查重过程中出错: ' + error.message);
  }
} 