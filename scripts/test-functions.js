// Quick test to check if functions are accessible
const http = require('http');

function testPort(port) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: port,
      path: '/.netlify/functions/test',
      method: 'GET'
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`Port ${port}: Status ${res.statusCode}`);
        try {
          const json = JSON.parse(data);
          console.log(`  Response: ${json.message}`);
        } catch (e) {
          console.log(`  Not JSON: ${data.substring(0, 50)}...`);
        }
        resolve(res.statusCode === 200);
      });
    });
    
    req.on('error', () => {
      console.log(`Port ${port}: Connection failed`);
      resolve(false);
    });
    
    req.setTimeout(2000, () => {
      console.log(`Port ${port}: Timeout`);
      req.destroy();
      resolve(false);
    });
    
    req.end();
  });
}

async function testAllPorts() {
  console.log('🔍 Testing Netlify function ports...\n');
  
  const ports = [8888, 3000, 3001, 3002];
  for (const port of ports) {
    await testPort(port);
  }
}

testAllPorts();