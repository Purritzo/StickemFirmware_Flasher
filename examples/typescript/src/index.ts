const baudrates = document.getElementById("baudrates") as HTMLSelectElement;
const consoleBaudrates = document.getElementById("consoleBaudrates") as HTMLSelectElement;
const connectButton = document.getElementById("connectButton") as HTMLButtonElement;
const traceButton = document.getElementById("copyTraceButton") as HTMLButtonElement;
const disconnectButton = document.getElementById("disconnectButton") as HTMLButtonElement;
const resetButton = document.getElementById("resetButton") as HTMLButtonElement;
const consoleStartButton = document.getElementById("consoleStartButton") as HTMLButtonElement;
const consoleStopButton = document.getElementById("consoleStopButton") as HTMLButtonElement;
const eraseButton = document.getElementById("eraseButton") as HTMLButtonElement;
const boardNameInput = document.getElementById("boardName") as HTMLInputElement;
const writeBoardNameButton = document.getElementById("writeBoardNameButton") as HTMLButtonElement;
const terminal = document.getElementById("terminal");
const programDiv = document.getElementById("program");
const consoleDiv = document.getElementById("console");
const lblBaudrate = document.getElementById("lblBaudrate");
const lblConsoleBaudrate = document.getElementById("lblConsoleBaudrate");
const lblConsoleFor = document.getElementById("lblConsoleFor");
const lblConnTo = document.getElementById("lblConnTo");
const alertDiv = document.getElementById("alertDiv");

const debugLogging = document.getElementById("debugLogging") as HTMLInputElement;

// This is a frontend example of Esptool-JS using local bundle file
// To optimize use a CDN hosted version like
// https://unpkg.com/esptool-js@0.5.0/bundle.js
import { ESPLoader, FlashOptions, LoaderOptions, Transport } from "../../../lib";
import { serial } from "web-serial-polyfill";
import binaryFileUrl from 'url:./stickem_main_merged.bin?url';

const serialLib = !navigator.serial && navigator.usb ? serial : navigator.serial;

declare let Terminal; // Terminal is imported in HTML script
declare let CryptoJS; // CryptoJS is imported in HTML script

const term = new Terminal({ cols: 120, rows: 40 });
term.open(terminal);

let device = null;
let transport: Transport;
let chip: string = null;
let esploader: ESPLoader;
let defaultBinaryData: string = null;

disconnectButton.style.display = "none";
traceButton.style.display = "none";
eraseButton.style.display = "none";
consoleStopButton.style.display = "none";
resetButton.style.display = "none";
writeBoardNameButton.style.display = "none";


// Load default binary file
async function loadDefaultBinary() {
  console.log("Loading default binary...", binaryFileUrl)
  try {
    const response = await fetch(binaryFileUrl);
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Convert to binary string
    let binaryString = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binaryString += String.fromCharCode(uint8Array[i]);
    }
    defaultBinaryData = binaryString;
  } catch (error) {
    console.error('Failed to load default binary file:', error);
    term.writeln('Warning: Could not load default binary file stickem_main_merged.bin');
  }
}

const espLoaderTerminal = {
  clean() {
    term.clear();
  },
  writeLine(data) {
    term.writeln(data);
  },
  write(data) {
    term.write(data);
  },
};

connectButton.onclick = async () => {
  try {
    if (device === null) {
      device = await serialLib.requestPort({});
      transport = new Transport(device, true);
    }
    const flashOptions = {
      transport,
      baudrate: parseInt(baudrates.value),
      terminal: espLoaderTerminal,
      debugLogging: debugLogging.checked,
    } as LoaderOptions;
    esploader = new ESPLoader(flashOptions);

    chip = await esploader.main();

    // Temporarily broken
    // await esploader.flashId();
    console.log("Settings done for :" + chip);
    lblBaudrate.style.display = "none";
    lblConnTo.innerHTML = "Connected to device: " + chip;
    lblConnTo.style.display = "block";
    baudrates.style.display = "none";
    connectButton.style.display = "none";
    disconnectButton.style.display = "initial";
    traceButton.style.display = "initial";
    eraseButton.style.display = "initial";
    writeBoardNameButton.style.display = "initial";
    consoleDiv.style.display = "none";
  } catch (e) {
    console.error(e);
    term.writeln(`Error: ${e.message}`);
  }
};

traceButton.onclick = async () => {
  if (transport) {
    transport.returnTrace();
  }
};

resetButton.onclick = async () => {
  if (transport) {
    await transport.setDTR(false);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await transport.setDTR(true);
  }
};

eraseButton.onclick = async () => {
  eraseButton.disabled = true;
  try {
    await esploader.eraseFlash();
  } catch (e) {
    console.error(e);
    term.writeln(`Error: ${e.message}`);
  } finally {
    eraseButton.disabled = false;
  }
};

writeBoardNameButton.onclick = async () => {
  const boardName = boardNameInput.value.trim();
  
  if (!boardName) {
    term.writeln("Error: Please enter a board name");
    return;
  }

  if (!esploader) {
    term.writeln("Error: Please connect to device first");
    return;
  }

  if (!defaultBinaryData) {
    term.writeln("Error: Default binary file not loaded");
    return;
  }

  writeBoardNameButton.disabled = true;
  try {
    // Step 1: Flash the default binary file to address 0x0
    term.writeln("Step 1: Flashing default binary to address 0x0...");
    
    const binaryFlashOptions: FlashOptions = {
      fileArray: [{ data: defaultBinaryData, address: 0x0 }],
      flashSize: "keep",
      eraseAll: true,
      compress: true,
      reportProgress: (fileIndex, written, total) => {
        term.write(`Flashing binary: ${Math.round((written / total) * 100)}%\r`);
      },
      calculateMD5Hash: (image) => CryptoJS.MD5(CryptoJS.enc.Latin1.parse(image)),
    } as FlashOptions;
    
    await esploader.writeFlash(binaryFlashOptions);
    term.writeln(`\nDefault binary flashed successfully!`);
    
    // Step 2: Write the board name
    term.writeln("Step 2: Writing board name...");
    
    // Convert board name to binary data (null-terminated string)
    const encoder = new TextEncoder();
    const boardNameBytes = encoder.encode(boardName + '\0');
    
    // Create a binary string from the bytes
    let binaryString = '';
    for (let i = 0; i < boardNameBytes.length; i++) {
      binaryString += String.fromCharCode(boardNameBytes[i]);
    }
    
    const boardNameFlashOptions: FlashOptions = {
      fileArray: [{ data: binaryString, address: 0x150000 }],
      flashSize: "keep",
      eraseAll: false,
      compress: true,
      reportProgress: (fileIndex, written, total) => {
        term.write(`Writing board name: ${Math.round((written / total) * 100)}%\r`);
      },
      calculateMD5Hash: (image) => CryptoJS.MD5(CryptoJS.enc.Latin1.parse(image)),
    } as FlashOptions;
    
    await esploader.writeFlash(boardNameFlashOptions);
    term.writeln(`\nBoard name "${boardName}" written successfully!`);
    term.writeln("Flash & Write Board Name completed successfully!");
  } catch (e) {
    console.error(e);
    term.writeln(`Error during flash & write: ${e.message}`);
  } finally {
    writeBoardNameButton.disabled = false;
  }
};



/**
 * Clean devices variables on chip disconnect. Remove stale references if any.
 */
function cleanUp() {
  device = null;
  transport = null;
  chip = null;
}

disconnectButton.onclick = async () => {
  if (transport) await transport.disconnect();

  term.reset();
  lblBaudrate.style.display = "initial";
  baudrates.style.display = "initial";
  consoleBaudrates.style.display = "initial";
  connectButton.style.display = "initial";
  disconnectButton.style.display = "none";
  traceButton.style.display = "none";
  eraseButton.style.display = "none";
  writeBoardNameButton.style.display = "none";
  lblConnTo.style.display = "none";
  alertDiv.style.display = "none";
  consoleDiv.style.display = "initial";
  cleanUp();
};

let isConsoleClosed = false;
consoleStartButton.onclick = async () => {
  if (device === null) {
    device = await serialLib.requestPort({});
    transport = new Transport(device, true);
  }
  lblConsoleFor.style.display = "block";
  lblConsoleBaudrate.style.display = "none";
  consoleBaudrates.style.display = "none";
  consoleStartButton.style.display = "none";
  consoleStopButton.style.display = "initial";
  resetButton.style.display = "initial";
  programDiv.style.display = "none";

  await transport.connect(parseInt(consoleBaudrates.value));
  isConsoleClosed = false;

  while (true && !isConsoleClosed) {
    const readLoop = transport.rawRead();
    const { value, done } = await readLoop.next();

    if (done || !value) {
      break;
    }
    term.write(value);
  }
  console.log("quitting console");
};

consoleStopButton.onclick = async () => {
  isConsoleClosed = true;
  if (transport) {
    await transport.disconnect();
    await transport.waitForUnlock(1500);
  }
  term.reset();
  lblConsoleBaudrate.style.display = "initial";
  consoleBaudrates.style.display = "initial";
  consoleStartButton.style.display = "initial";
  consoleStopButton.style.display = "none";
  resetButton.style.display = "none";
  lblConsoleFor.style.display = "none";
  programDiv.style.display = "initial";
  cleanUp();
};



// Initialize default binary loading
loadDefaultBinary();
