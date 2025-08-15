const baudrates = document.getElementById("baudrates") as HTMLSelectElement;
const connectButton = document.getElementById("connectButton") as HTMLButtonElement;
const manualConnectButton = document.getElementById("manualConnectButton") as HTMLButtonElement;
const disconnectButton = document.getElementById("disconnectButton") as HTMLButtonElement;
const prevStepButton = document.getElementById("prevStep") as HTMLButtonElement;
const nextStepButton = document.getElementById("nextStep") as HTMLButtonElement;
const stepContent = document.getElementById("stepContent") as HTMLSpanElement;
const boardNameInput = document.getElementById("boardName") as HTMLInputElement;
const writeBoardNameButton = document.getElementById("writeBoardNameButton") as HTMLButtonElement;
const boardNameSection = document.getElementById("boardNameSection");
const terminal = document.getElementById("terminal");
const programDiv = document.getElementById("program");
const lblBaudrate = document.getElementById("lblBaudrate");
const lblConnTo = document.getElementById("lblConnTo");
const alertDiv = document.getElementById("alertDiv");


// This is a frontend example of Esptool-JS using local bundle file
// To optimize use a CDN hosted version like
// https://unpkg.com/esptool-js@0.5.0/bundle.js
import { ESPLoader, FlashOptions, LoaderOptions, Transport } from "../../../lib";
import { serial } from "web-serial-polyfill";
import binaryFileUrl from 'url:./stickem_main_merged.bin?url';
import connectionDialogUrl from 'url:./Connection_Dialog.png?url';

// Check Web Serial API support immediately on load
if (!('serial' in navigator)) {
  const alertDiv = document.getElementById("alertDiv");
  const alertMsg = document.getElementById("alertmsg");
  alertMsg.textContent = "Web Serial API is not supported in this browser. Please use Chrome, Edge, or another Chromium-based browser.";
  alertDiv.style.display = "block";
  
  // Disable connect functionality
  const connectButton = document.getElementById("connectButton") as HTMLButtonElement;
  const manualConnectButton = document.getElementById("manualConnectButton") as HTMLButtonElement;
  connectButton.disabled = true;
  connectButton.title = "Web Serial API not supported";
  manualConnectButton.disabled = true;
  manualConnectButton.title = "Web Serial API not supported";
}

const serialLib = !navigator.serial && navigator.usb ? serial : navigator.serial;

declare let Terminal; // Terminal is imported in HTML script
declare let CryptoJS; // CryptoJS is imported in HTML script

const term = new Terminal({ cols: 60, rows: 30 });
term.open(terminal);

let device = null;
let transport: Transport;
let chip: string = null;
let esploader: ESPLoader;
let defaultBinaryData: string = null;

disconnectButton.style.display = "none";
// Board name section is hidden by default in HTML

// Step navigation system
const steps = [
  `Step 1: Connect the ESP32 Board to your laptop using a data cable.`,
  
  `Step 2: Click 'Auto Connect' for seamless ESP32 detection, or 'Manual Connect' to choose the port yourself.<br>
  Auto Connect: Automatically finds previously paired ESP32 devices or shows filtered ESP32 options if needed. No manual port selection required for paired devices!<br>
  Manual Connect: Shows all available ports for manual selection. If unsure which port, disconnect and reconnect the ESP32 Board when the dialog is open.<br>
  If there are issues, ensure nothing else is using the serial port, reconnect and refresh the page.`,
  
  `Step 3: Once connected, enter a board name and click 'Flash & Write Board Name' to program the device. <br>
  If there are errors, try again from Step 1 but with a lower baud rate.`,
  
  `Step 4: Wait for the flashing process to complete. The device will reset automatically when finished.<br><br>
  Once the terminal says to do so, click on the "Disconnect" button.`
];

let currentStep = 0;

function updateStepDisplay() {
  stepContent.innerHTML = steps[currentStep];
  prevStepButton.disabled = currentStep === 0;
  nextStepButton.disabled = currentStep === steps.length - 1;
}

prevStepButton.onclick = () => {
  if (currentStep > 0) {
    currentStep--;
    updateStepDisplay();
  }
};

nextStepButton.onclick = () => {
  if (currentStep < steps.length - 1) {
    currentStep++;
    updateStepDisplay();
  }
};

// Initialize step display
updateStepDisplay();

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

// ESP32 vendor and product IDs for automatic detection
const ESP32_FILTERS = [
  { usbVendorId: 0x10C4, usbProductId: 0xEA60 }, // Silicon Labs CP210x
  { usbVendorId: 0x1A86, usbProductId: 0x7523 }, // QinHeng Electronics CH340
  { usbVendorId: 0x0403, usbProductId: 0x6001 }, // FTDI FT232R
  { usbVendorId: 0x0403, usbProductId: 0x6014 }, // FTDI FT232H
  { usbVendorId: 0x239A, usbProductId: 0x80F4 }, // Adafruit Metro ESP32-S2
  { usbVendorId: 0x303A, usbProductId: 0x1001 }, // Espressif ESP32-S2
  { usbVendorId: 0x303A, usbProductId: 0x0002 }, // Espressif ESP32-S3
];

async function detectESP32Port() {
  try {
    // First check for already-paired ESP32 devices
    const availablePorts = await serialLib.getPorts();
    
    for (const port of availablePorts) {
      const info = port.getInfo();
      // Check if this port matches our ESP32 filters
      const isESP32 = ESP32_FILTERS.some(filter => 
        info.usbVendorId === filter.usbVendorId && 
        info.usbProductId === filter.usbProductId
      );
      
      if (isESP32) {
        term.writeln("Found previously paired ESP32 device - connecting automatically!");
        return port;
      }
    }
    
    // No paired ESP32 found, request new port with ESP32 filters
    term.writeln("No paired ESP32 found. Requesting new connection...");
    const port = await serialLib.requestPort({ filters: ESP32_FILTERS });
    term.writeln("ESP32 device detected and paired!");
    return port;
  } catch (e) {
    console.log("Auto-detection failed, falling back to manual selection:", e.message);
    term.writeln("Auto-detection failed. Please manually select the ESP32 port.");
    
    // Fallback to manual selection without filters
    try {
      const port = await serialLib.requestPort({});
      term.writeln("Port selected manually.");
      return port;
    } catch (manualError) {
      throw new Error("Port selection cancelled or failed");
    }
  }
}

async function connectToDevice(autoDetect = true) {
  try {
    if (device === null) {
      if (autoDetect) {
        term.writeln("Attempting to auto-detect ESP32 board...");
        device = await detectESP32Port();
      } else {
        term.writeln("Manual port selection...");
        device = await serialLib.requestPort({});
        term.writeln("Port selected manually.");
      }
      transport = new Transport(device, true);
    }
    const flashOptions = {
      transport,
      baudrate: parseInt(baudrates.value),
      terminal: espLoaderTerminal,
      debugLogging: false,
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
    manualConnectButton.style.display = "none";
    disconnectButton.style.display = "initial";
    boardNameSection.style.display = "block";
  } catch (e) {
    console.error(e);
    
    // Handle specific serial port errors
    if (e.message.includes("Failed to open serial port") || 
        e.message.includes("InvalidStateError") ||
        e.message.includes("already open")) {
      term.writeln(`Serial port error: ${e.message}`);
      term.writeln("");
      term.writeln("Common causes and solutions:");
      term.writeln("• Another tab/window is using this serial port - close other instances");
      term.writeln("• Port not properly closed - disconnect USB cable and reconnect");
      term.writeln("• On Linux: wait a few seconds after disconnect before reconnecting");
      term.writeln("• Try refreshing the page and connecting again");
      term.writeln("• Try a lower baud rate (115200 instead of 460800)");
    } else {
      term.writeln(`Connection error: ${e.message}`);
    }
    
    // Clean up on connection failure
    cleanUp();
  }
}

connectButton.onclick = async () => {
  await connectToDevice(true);
};

manualConnectButton.onclick = async () => {
  await connectToDevice(false);
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
    
    // Step 3: Reset the device
    term.writeln("Step 3: Resetting device...");
    if (transport) {
      await transport.setDTR(false);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await transport.setDTR(true);
    }
    term.writeln("Device reset completed!");
    term.writeln("You can now click 'Disconnect' to finish.");
    
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
  connectButton.style.display = "initial";
  manualConnectButton.style.display = "initial";
  disconnectButton.style.display = "none";
  boardNameSection.style.display = "none";
  lblConnTo.style.display = "none";
  alertDiv.style.display = "none";
  cleanUp();
};




// Initialize default binary loading
loadDefaultBinary();
