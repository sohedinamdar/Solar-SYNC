// Solar Sync Arduino -> browser WebSocket bridge
// Install: npm i ws serialport @serialport/parser-readline
// Run:    node solar-sync-server.js /dev/ttyUSB0 115200

const WebSocket = require('ws');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const serialPath = process.argv[2] || process.env.ARDUINO_PORT || '/dev/ttyUSB0';
const baudRate = Number(process.argv[3] || process.env.ARDUINO_BAUD || 115200);
const wsPort = Number(process.env.WS_PORT || 8765);

const clients = new Set();
const wss = new WebSocket.Server({ port: wsPort });
let latest = { azimuth: 135, elevation: 42, power: 8.4, yieldToday: 34.8, source: 'demo' };

wss.on('connection', socket => {
  clients.add(socket);
  socket.send(JSON.stringify(latest));
  socket.on('close', () => clients.delete(socket));
});

function broadcast(data) {
  latest = { ...latest, ...data, source: 'arduino', timestamp: Date.now() };
  const message = JSON.stringify(latest);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}

try {
  const port = new SerialPort({ path: serialPath, baudRate, autoOpen: false });
  const parser = port.pipe(new ReadlineParser({ delimiter: '\\n' }));
  port.open(error => {
    if (error) {
      console.error(`Could not open ${serialPath}: ${error.message}`);
      console.error('WebSocket server is still running; check the port and reconnect.');
      return;
    }
    console.log(`Arduino connected on ${serialPath} at ${baudRate} baud`);
  });
  parser.on('data', line => {
    try {
      const data = JSON.parse(line.trim());
      broadcast(data);
    } catch {
      console.warn('Skipped non-JSON Arduino line:', line.trim());
    }
  });
  port.on('error', error => console.error('Serial error:', error.message));
} catch (error) {
  console.error('Serial setup error:', error.message);
}

console.log(`Solar Sync WebSocket relay listening at ws://localhost:${wsPort}`);
console.log('Expected Arduino JSON: {"azimuth":135,"elevation":42,"power":8.4,"yieldToday":34.8}');

process.on('SIGINT', () => {
  wss.close(() => process.exit(0));
});
