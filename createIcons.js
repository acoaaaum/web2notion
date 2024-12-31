// 创建一个临时的canvas元素
function createIcon(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // 设置背景
  ctx.fillStyle = '#2eaadc';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.2);
  ctx.fill();

  // 绘制字母"N"
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${size * 0.6}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', size/2, size/2);

  return canvas.toDataURL('image/png');
}

// 生成不同尺寸的图标
const sizes = [16, 32, 48, 128];
sizes.forEach(size => {
  const link = document.createElement('a');
  link.download = `icon${size}.png`;
  link.href = createIcon(size);
  link.click();
}); 