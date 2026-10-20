(() => {
  const originalFetch = window.fetch.bind(window);

  function isPublicUpdateRequest(input){
    const url = typeof input === 'string'
      ? input
      : (input && typeof input.url === 'string' ? input.url : '');
    return /(?:^|\/)data\/public-update\.json(?:[?#].*)?$/.test(url);
  }

  function reviewedKey(x){
    // Current format: YYYY-MM-DD HH:MM JST
    // Lexicographic order is chronological for this format.
    return String(x?.reviewed_at || '');
  }

  window.fetch = async function(input, init){
    const response = await originalFetch(input, init);

    if(!isPublicUpdateRequest(input) || !response.ok){
      return response;
    }

    try{
      const data = await response.clone().json();

      if(Array.isArray(data?.added)){
        data.added = data.added
          .map((x, index) => ({...x, __originalIndex:index}))
          .sort((a, b) => {
            const byReviewed = reviewedKey(b).localeCompare(reviewedKey(a));
            if(byReviewed) return byReviewed;

            // Same/no reviewed_at: preserve existing order.
            return a.__originalIndex - b.__originalIndex;
          })
          .map(({__originalIndex, ...x}) => x);
      }

      const headers = new Headers(response.headers);
      headers.set('content-type', 'application/json; charset=utf-8');

      return new Response(JSON.stringify(data), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }catch(e){
      console.warn('public update recent-first sort skipped', e);
      return response;
    }
  };
})();
