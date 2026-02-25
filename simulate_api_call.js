const http = require('http');

// Payload
const data = JSON.stringify({
    month: '2026-02'
});

const options = {
    hostname: 'localhost',
    port: 3101, // 3101 based on user logs
    path: '/api/v1/schedules/distribute-kitchen',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

console.log('---------------------------------------------------');
console.log(`[Simulation] Sending POST to http://localhost:3101${options.path}`);
console.log(`[Simulation] Payload: ${data}`);
console.log('---------------------------------------------------');

const req = http.request(options, (res) => {
    console.log(`[Simulation] Response STATUS: ${res.statusCode}`);
    console.log(`[Simulation] Response HEADERS: ${JSON.stringify(res.headers)}`);

    let body = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
        body += chunk;
    });
    res.on('end', () => {
        console.log('---------------------------------------------------');
        console.log('[Simulation] Response BODY:');
        try {
            console.log(JSON.stringify(JSON.parse(body), null, 2));
        } catch (e) {
            console.log(body);
        }
        console.log('---------------------------------------------------');
    });
});

req.on('error', (e) => {
    console.error(`[Simulation] Request Error: ${e.message}`);
});

req.write(data);
req.end();
