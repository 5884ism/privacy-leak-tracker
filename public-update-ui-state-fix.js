(() => {
  const STORAGE_KEY = 'publicUpdateDetailsOpen';

  function getSavedState() {
    const v = sessionStorage.getItem(STORAGE_KEY);
    if (v === 'true') return true;
    if (v === 'false') return false;
    return null;
  }

  function saveState(open) {
    sessionStorage.setItem(STORAGE_KEY, open ? 'true' : 'false');
  }

  function bindDetails(details) {
    if (!details || details.dataset.stateBound === '1') return;

    details.dataset.stateBound = '1';

    const saved = getSavedState();
    if (saved !== null && details.open !== saved) {
      details.open = saved;
    }

    details.addEventListener('toggle', () => {
      saveState(details.open);
    });
  }

  function apply() {
    const details = document.querySelector(
      '#publicUpdatePanel .public-update-details'
    );
    if (details) bindDetails(details);
  }

  const observer = new MutationObserver(() => {
    apply();
  });

  window.addEventListener('DOMContentLoaded', () => {
    apply();
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  });
})();
