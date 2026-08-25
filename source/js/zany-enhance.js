(function () {
  let revealObserver = null;

  function setGreeting() {
    const greeting = document.getElementById('zany-greeting');
    const timeTip = document.getElementById('zany-time-tip');
    if (!greeting && !timeTip) return;

    const hour = new Date().getHours();
    let text = '保持热爱，慢慢发光。';

    if (hour >= 5 && hour < 11) text = '早上好，今天也适合把灵感落成文字。';
    else if (hour >= 11 && hour < 14) text = '中午好，记得给自己一点轻松的空档。';
    else if (hour >= 14 && hour < 18) text = '下午好，适合继续推进一个小目标。';
    else if (hour >= 18 && hour < 23) text = '晚上好，欢迎来这里慢慢逛。';
    else text = '夜深了，愿你也有被温柔接住的时刻。';

    if (greeting) greeting.textContent = text;
    if (timeTip) timeTip.textContent = '页面已准备好，交互和内容都在继续生长。';
  }

  function markRevealTargets() {
    const targets = document.querySelectorAll(
      '.zany-home-panel, .zany-home-card, #recent-posts .recent-post-item, #aside-content .card-widget'
    );

    targets.forEach((item, index) => {
      item.setAttribute('data-reveal', '');
      item.style.setProperty('--reveal-delay', `${Math.min(index, 8) * 60}ms`);
    });
  }

  function setupReveal() {
    markRevealTargets();

    if (revealObserver) {
      revealObserver.disconnect();
      revealObserver = null;
    }

    const targets = document.querySelectorAll('[data-reveal]');
    if (!targets.length) return;

    if (!('IntersectionObserver' in window)) {
      targets.forEach(item => item.classList.add('is-visible'));
      return;
    }

    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.12,
      rootMargin: '0px 0px -40px 0px'
    });

    targets.forEach(item => revealObserver.observe(item));
  }

  function initEnhance() {
    setGreeting();
    setupReveal();
  }

  document.addEventListener('DOMContentLoaded', initEnhance);
  document.addEventListener('pjax:complete', initEnhance);
})();
