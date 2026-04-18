

async function testApi(path, options = {}) {
  const url = `http://localhost:5173${path}`;
  const start = Date.now();
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const duration = Date.now() - start;
    let data;
    try {
      data = await response.json();
    } catch(e) {
      data = await response.text();
    }
    return { status: response.status, data, duration };
  } catch (e) {
    return { status: 0, error: e.message, duration: Date.now() - start };
  }
}

async function runTests() {
  console.log("=== BEGINNING BACKEND TESTS ===\n");
  let results = {};

  // 1. Server Configuration
  console.log(JSON.stringify(results));
}

runTests();
