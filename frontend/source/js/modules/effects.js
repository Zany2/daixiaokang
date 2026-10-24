/* 页面装饰交互：评论表情放大。
 * 雪花、星空、流星及参数存储已移到 effect-engine.js，由美化面板实时控制。
 * 两个模块都只在首次加载时执行，兼容 PJAX 页面切换。
 */

/* ------------------------------ 表情放大 ------------------------------ */
/* 原 fomal.js 439-500 行，原样搬运，未改逻辑 */
/* 表情放大 start */
document.addEventListener('pjax:complete', function () {
  if (document.getElementById('post-comment')) owoBig();
});
document.addEventListener('DOMContentLoaded', function () {
  if (document.getElementById('post-comment')) owoBig();
});

// 表情放大
function owoBig() {
  const commentRoot = document.getElementById('post-comment');
  // 自建评论使用纯文本，没有 Twikoo 表情面板，不创建旧表情容器与观察器。
  if (!commentRoot || commentRoot.hasAttribute('data-feedback')) return;
  let flag = 1, // 设置节流阀
    owo_time = '', // 设置计时器
    m = 3; // 设置放大倍数
  // 创建盒子
  let div = document.createElement('div'),
    body = document.querySelector('body');
  // 设置ID
  div.id = 'owo-big';
  // 插入盒子
  body.appendChild(div)

  // 构造observer
  let observer = new MutationObserver(mutations => {

    for (let i = 0; i < mutations.length; i++) {
      let dom = mutations[i].addedNodes,
        owo_body = '';
      if (dom.length == 2 && dom[1].className == 'OwO-body') owo_body = dom[1];
      // 如果需要在评论内容中启用此功能请解除下面的注释
      // else if (dom.length == 1 && dom[0].className == 'tk-comment') owo_body = dom[0];
      else continue;

      // 禁用右键（手机端长按会出现右键菜单，为了体验给禁用掉）
      if (document.body.clientWidth <= 768) owo_body.addEventListener('contextmenu', e => e.preventDefault());
      // 鼠标移入
      owo_body.onmouseover = (e) => {
        if (flag && e.target.tagName == 'IMG') {
          flag = 0;
          // 移入300毫秒后显示盒子
          owo_time = setTimeout(() => {
            let height = e.path[0].clientHeight * m, // 盒子高
              width = e.path[0].clientWidth * m, // 盒子宽
              left = (e.x - e.offsetX) - (width - e.path[0].clientWidth) / 2, // 盒子与屏幕左边距离
              top = e.y - e.offsetY; // 盒子与屏幕顶部距离

            if ((left + width) > body.clientWidth) left -= ((left + width) - body.clientWidth + 10); // 右边缘检测，防止超出屏幕
            if (left < 0) left = 10; // 左边缘检测，防止超出屏幕
            // 设置盒子样式
            div.style.cssText = `display:flex; height:${height}px; width:${width}px; left:${left}px; top:${top}px;`;
            // 在盒子中插入图片
            div.innerHTML = `<img src="${e.target.src}">`
          }, 300);
        }
      };
      // 鼠标移出隐藏盒子
      owo_body.onmouseout = () => { div.style.display = 'none', flag = 1, clearTimeout(owo_time); }
    }

  })
  observer.observe(commentRoot, { subtree: true, childList: true })
}
/* 表情放大 end */
