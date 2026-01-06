const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const defaultHeaders = {
  'Content-Type': 'application/json'
};

function buildUrl(path) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/b612881c-bd0e-49ba-9272-bdca4a0a1a9d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'client.js:7',message:'buildUrl called',data:{path,API_BASE_URL:API_BASE_URL||'(empty)',windowLocation:typeof window!=='undefined'?window.location.href:'N/A'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  if (!API_BASE_URL || path.startsWith('http')) {
    const result = path;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b612881c-bd0e-49ba-9272-bdca4a0a1a9d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'client.js:10',message:'buildUrl returning relative path',data:{result},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    return result;
  }
  const result = `${API_BASE_URL}${path}`;
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/b612881c-bd0e-49ba-9272-bdca4a0a1a9d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'client.js:15',message:'buildUrl returning absolute path',data:{result},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  return result;
}

async function parseJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function request(path, options = {}) {
  const builtUrl = buildUrl(path);
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/b612881c-bd0e-49ba-9272-bdca4a0a1a9d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'client.js:24',message:'request starting',data:{path,builtUrl,method:options.method||'GET',hasBody:!!options.body},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  try {
    const response = await fetch(builtUrl, {
      credentials: 'include',
      ...options
    });
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b612881c-bd0e-49ba-9272-bdca4a0a1a9d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'client.js:30',message:'fetch response received',data:{status:response.status,statusText:response.statusText,ok:response.ok,url:response.url,headers:Object.fromEntries(response.headers.entries())},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    const data = await parseJson(response);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b612881c-bd0e-49ba-9272-bdca4a0a1a9d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'client.js:33',message:'response parsed',data:{hasData:!!data,dataKeys:data?Object.keys(data):[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    if (!response.ok) {
      const error = new Error(data?.error || data?.message || 'Request failed');
      error.status = response.status;
      error.payload = data;
      error.code = data?.code;
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/b612881c-bd0e-49ba-9272-bdca4a0a1a9d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'client.js:37',message:'response not ok, throwing error',data:{status:error.status,code:error.code,message:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      throw error;
    }
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b612881c-bd0e-49ba-9272-bdca4a0a1a9d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'client.js:42',message:'request successful',data:{hasData:!!data},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    return data;
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b612881c-bd0e-49ba-9272-bdca4a0a1a9d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'client.js:45',message:'request catch block',data:{errorType:error.constructor.name,message:error.message,status:error.status,code:error.code,isNetworkError:error.isNetworkError,isTypeError:error instanceof TypeError},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    // Network errors (backend unreachable, CORS issues, etc.)
    if (error instanceof TypeError || error.message === 'Failed to fetch') {
      const networkError = new Error(
        'Unable to connect to server. Please check your internet connection or try again later.'
      );
      networkError.status = 0;
      networkError.code = 'NETWORK_ERROR';
      networkError.isNetworkError = true;
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/b612881c-bd0e-49ba-9272-bdca4a0a1a9d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'client.js:52',message:'network error detected',data:{builtUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      throw networkError;
    }
    // Re-throw other errors (HTTP errors, etc.)
    throw error;
  }
}

export async function apiGet(path, options = {}) {
  return request(path, {
    method: 'GET',
    ...options
  });
}

export async function apiPost(path, body = {}, options = {}) {
  return request(path, {
    method: 'POST',
    headers: {
      ...defaultHeaders,
      ...options.headers
    },
    body: JSON.stringify(body),
    ...options
  });
}

export async function apiDelete(path, options = {}) {
  return request(path, {
    method: 'DELETE',
    ...options
  });
}

export function withQuery(path, params = {}) {
  const url = new URL(buildUrl(path), window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, value);
  });
  return url.pathname + url.search;
}


