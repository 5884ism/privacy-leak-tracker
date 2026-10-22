(() => {
  function addLink() {
    const card = document.querySelector('.public-updated-card');
    if (!card || card.querySelector('.public-news-link')) return;

    const link = document.createElement('a');
    link.className = 'public-news-link';
    link.href = 'top.html';
    link.textContent = '速報ニュースを見る →';
    link.setAttribute('aria-label', '速報ニュースページを見る');

    card.appendChild(link);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addLink, { once: true });
  } else {
    addLink();
  }
})();
