const baudrates = document.getElementById("baudrates") as HTMLSelectElement;
const connectButton = document.getElementById("connectButton") as HTMLButtonElement;
const manualConnectButton = document.getElementById("manualConnectButton") as HTMLButtonElement;
const disconnectButton = document.getElementById("disconnectButton") as HTMLButtonElement;
const forceDisconnectButton = document.getElementById("forceDisconnectButton") as HTMLButtonElement;
const boardStatus = document.getElementById("boardStatus") as HTMLSpanElement;
const boardNameWarning = document.getElementById("boardNameWarning") as HTMLSpanElement;
const connectionStatus = document.getElementById("connectionStatus") as HTMLSpanElement;
const step1 = document.getElementById("step1") as HTMLDivElement;
const step2 = document.getElementById("step2") as HTMLDivElement;
const advancedToggle = document.getElementById("advancedToggle") as HTMLDivElement;
const advancedContent = document.getElementById("advancedContent") as HTMLDivElement;
const advancedArrow = document.getElementById("advancedArrow") as HTMLSpanElement;
const boardNameInput = document.getElementById("boardName") as HTMLInputElement;
const changeNameButton = document.getElementById("changeNameButton") as HTMLButtonElement;
const changeNameButtonContainer = document.getElementById("changeNameButtonContainer") as HTMLDivElement;
const bluetoothRetrieveButton = document.getElementById("bluetoothRetrieveButton") as HTMLButtonElement;
const bluetoothRetrieveContainer = document.getElementById("bluetoothRetrieveContainer") as HTMLDivElement;
const boardNameEditSection = document.getElementById("boardNameEditSection") as HTMLDivElement;
const firmwareActionSection = document.getElementById("firmwareActionSection") as HTMLDivElement;
const flashWarning = document.getElementById("flashWarning") as HTMLDivElement;
const flashFirmwareButton = document.getElementById("flashFirmwareButton") as HTMLButtonElement;
const terminal = document.getElementById("terminal");
const feedbackContent = document.getElementById("feedbackContent") as HTMLDivElement;
const feedbackHelp = document.getElementById("feedbackHelp") as HTMLDivElement;
const programDiv = document.getElementById("program");
const lblBaudrate = document.getElementById("lblBaudrate");
const lblConnTo = document.getElementById("lblConnTo");
const alertDiv = document.getElementById("alertDiv");

// Progress bar elements
const progressSection = document.getElementById("progressSection") as HTMLDivElement;
const progressBar = document.getElementById("progressBar") as HTMLDivElement;
const progressOverall = document.getElementById("progressOverall") as HTMLSpanElement;
const stepStart = document.getElementById("step-start") as HTMLDivElement;
const stepErasing = document.getElementById("step-erasing") as HTMLDivElement;
const stepUpdating = document.getElementById("step-updating") as HTMLDivElement;
const stepWriting = document.getElementById("step-writing") as HTMLDivElement;
const stepStartPercent = document.getElementById("step-start-percent") as HTMLSpanElement;
const stepErasingPercent = document.getElementById("step-erasing-percent") as HTMLSpanElement;
const stepUpdatingPercent = document.getElementById("step-updating-percent") as HTMLSpanElement;
const stepWritingPercent = document.getElementById("step-writing-percent") as HTMLSpanElement;


// This is a frontend example of Esptool-JS using local bundle file
// To optimize use a CDN hosted version like
// https://unpkg.com/esptool-js@0.5.0/bundle.js
import { ESPLoader, FlashOptions, LoaderOptions, Transport } from "../../../lib";
import { serial } from "web-serial-polyfill";
import binaryFileUrl from 'url:./stickem_main_merged.bin?url';
import connectionDialogUrl from 'url:./Connection_Dialog.png?url';

// Check Web Serial API support after DOM elements are defined
function checkWebSerialSupport() {
  if (!('serial' in navigator)) {
    const alertDiv = document.getElementById("alertDiv");
    const alertMsg = document.getElementById("alertmsg");
    alertMsg.textContent = "Web Serial API is not supported in this browser. Please use Chrome, Edge, or another Chromium-based browser.";
    alertDiv.style.display = "block";
    
    // Update feedback to show the error
    updateFeedback("Browser not supported - please use Chrome or Edge", 'error', false);
    
    // Disable connect functionality
    connectButton.disabled = true;
    connectButton.title = "Web Serial API not supported";
    manualConnectButton.disabled = true;
    manualConnectButton.title = "Web Serial API not supported";
  }
}

const serialLib = !navigator.serial && navigator.usb ? serial : navigator.serial;

declare let Terminal; // Terminal is imported in HTML script
declare let CryptoJS; // CryptoJS is imported in HTML script

const term = new Terminal({ cols: 60, rows: 30 });
term.open(terminal);

let device = null;
let serialDevice = null; // Store the original serial device separately
let transport: Transport;
let chip: string = null;
let esploader: ESPLoader;
let defaultBinaryData: string = null;
let originalBoardName: string = null; // Store original name for cancel functionality
let currentBoardName: string = null; // Store current/auto-saved name
const defaultBoardName: string = "Stick 'Em Box X"; // Default name for unnamed boards
let userHasModifiedName: boolean = false; // Track if user has changed the default name

disconnectButton.style.display = "none";
// Board name section is hidden by default in HTML

// Board status management
function updateBoardStatus(status: string, isConnected: boolean = false, isUnnamed: boolean = false, showWarning: boolean = false) {
  boardStatus.textContent = status;

  // Update board status styling
  boardStatus.classList.remove("disconnected", "connected", "unnamed");

  if (!isConnected) {
    boardStatus.classList.add("disconnected");
    boardNameWarning.style.display = "none";
  } else if (isUnnamed) {
    boardStatus.classList.add("unnamed");
    boardNameWarning.style.display = showWarning ? "inline" : "none";
  } else {
    boardStatus.classList.add("connected");
    boardNameWarning.style.display = "none";
  }
}

// Connection status management
function updateConnectionStatus(isConnected: boolean = false) {
  if (isConnected) {
    connectionStatus.textContent = "Connected";
    connectionStatus.classList.remove("disconnected");
    connectionStatus.classList.add("connected");
    // Show change board name button when connected
    changeNameButtonContainer.classList.add("show");
  } else {
    connectionStatus.textContent = "Disconnected";
    connectionStatus.classList.remove("connected");
    connectionStatus.classList.add("disconnected");
    // Hide change board name button when disconnected
    changeNameButtonContainer.classList.remove("show");
  }
}

// Flash warning management
function updateFlashWarning() {
  if (!userHasModifiedName && currentBoardName === defaultBoardName) {
    flashWarning.style.display = "block";
  } else {
    flashWarning.style.display = "none";
  }
}

// Progress bar management
interface ProgressState {
  currentStep: number;
  stepProgress: number[];
  overallProgress: number;
}

let progressState: ProgressState = {
  currentStep: 0,
  stepProgress: [0, 0, 0, 0],
  overallProgress: 0
};

function showProgressBar() {
  progressSection.style.display = 'block';
  resetProgress();

  // Hide main UI containers during firmware update to focus on progress
  const statusBoardDisplay = document.querySelector('.status-board-display') as HTMLElement;

  // Hide specific elements within steps-grid but keep the grid itself for progress bar
  step1.style.display = 'none';
  step2.style.display = 'none';
  const stepArrow = document.querySelector('.step-arrow') as HTMLElement;
  const action1Grid = document.querySelector('.action1-grid') as HTMLElement;
  const action2Grid = document.querySelector('.action2-grid') as HTMLElement;

  if (statusBoardDisplay) statusBoardDisplay.style.display = 'none';
  if (stepArrow) stepArrow.style.display = 'none';
  if (action1Grid) action1Grid.style.display = 'none';
  if (action2Grid) action2Grid.style.display = 'none';
}

function hideProgressBar() {
  progressSection.style.display = 'none';
  resetProgress();

  // Restore main UI containers after firmware update
  const statusBoardDisplay = document.querySelector('.status-board-display') as HTMLElement;

  // Restore specific elements within steps-grid
  step1.style.display = '';
  step2.style.display = '';
  const stepArrow = document.querySelector('.step-arrow') as HTMLElement;
  const action1Grid = document.querySelector('.action1-grid') as HTMLElement;
  const action2Grid = document.querySelector('.action2-grid') as HTMLElement;

  if (statusBoardDisplay) statusBoardDisplay.style.display = '';
  if (stepArrow) stepArrow.style.display = '';
  if (action1Grid) action1Grid.style.display = '';
  // Don't restore action2Grid (firmwareActionSection) if we're disconnecting
  // This will be handled separately in the disconnect flow
}

function resetProgress() {
  progressState = {
    currentStep: 0,
    stepProgress: [0, 0, 0, 0],
    overallProgress: 0
  };
  updateProgressDisplay();
}

function updateProgress(step: number, stepPercent: number) {
  // Update the specific step progress
  progressState.stepProgress[step] = Math.min(100, Math.max(0, stepPercent));
  
  // Calculate overall progress (each step is 25%)
  let overall = 0;
  for (let i = 0; i < 4; i++) {
    if (i < step) {
      overall += 25; // Completed steps
    } else if (i === step) {
      overall += (progressState.stepProgress[i] * 25) / 100; // Current step
    }
    // Future steps contribute 0
  }
  
  progressState.currentStep = step;
  progressState.overallProgress = Math.min(100, overall);
  
  updateProgressDisplay();
}

function updateProgressDisplay() {
  const steps = [stepStart, stepErasing, stepUpdating, stepWriting];
  const percentElements = [stepStartPercent, stepErasingPercent, stepUpdatingPercent, stepWritingPercent];
  
  // Update overall progress
  progressOverall.textContent = `${Math.round(progressState.overallProgress)}%`;
  progressBar.style.width = `${progressState.overallProgress}%`;
  
  // Update step states
  steps.forEach((step, index) => {
    step.classList.remove('active', 'completed');
    
    if (index < progressState.currentStep) {
      step.classList.add('completed');
      percentElements[index].textContent = '100%';
    } else if (index === progressState.currentStep) {
      step.classList.add('active');
      percentElements[index].textContent = `${Math.round(progressState.stepProgress[index])}%`;
    } else {
      percentElements[index].textContent = '0%';
    }
  });
}

// Feedback management
function updateFeedback(message: string, type: 'default' | 'connecting' | 'connected' | 'flashing' | 'error' = 'default', showHelp: boolean = false) {
  feedbackContent.textContent = message;
  
  // Remove all type classes
  feedbackContent.classList.remove('connecting', 'connected', 'flashing', 'error');
  
  // Add the appropriate type class
  if (type !== 'default') {
    feedbackContent.classList.add(type);
  }
  
  // Show or hide help text
  if (showHelp) {
    feedbackHelp.style.display = 'block';
  } else {
    feedbackHelp.style.display = 'none';
  }
}

// Step focus management
function focusStep(stepNumber: number) {
  if (stepNumber === 1) {
    step1.classList.remove("unfocused");
    step1.classList.add("focused");
    step2.classList.remove("focused");
    step2.classList.add("unfocused");
  } else if (stepNumber === 2) {
    step1.classList.remove("focused");
    step1.classList.add("unfocused");
    step2.classList.remove("unfocused");
    step2.classList.add("focused");
  }
}

// Advanced options dropdown management
function toggleAdvancedOptions() {
  const isExpanded = advancedContent.classList.contains("show");
  
  if (isExpanded) {
    advancedContent.classList.remove("show");
    advancedArrow.classList.remove("expanded");
  } else {
    advancedContent.classList.add("show");
    advancedArrow.classList.add("expanded");
  }
}

// Board name editing management
function showBoardNameEdit() {
  changeNameButtonContainer.classList.remove("show");
  boardNameEditSection.classList.add("show");
  // Store the original name for cancel functionality
  originalBoardName = boardStatus.textContent && boardStatus.textContent !== "No Board Detected" ? boardStatus.textContent : "";

  // Pre-populate with current saved name, original name, or default name
  let nameToShow: string;
  if (currentBoardName !== null) {
    nameToShow = currentBoardName;
  } else if (originalBoardName) {
    nameToShow = originalBoardName;
  } else {
    // No existing name found, use default name
    nameToShow = defaultBoardName;
    currentBoardName = defaultBoardName;
    userHasModifiedName = false; // This is the default, not user-modified
  }

  boardNameInput.value = nameToShow;
}

function hideBoardNameEdit() {
  // Only show the button if we're actually connected
  if (connectionStatus.classList.contains("connected")) {
    changeNameButtonContainer.classList.add("show");
  }
  boardNameEditSection.classList.remove("show");
  boardNameInput.value = "";
}


// Add click event handlers
advancedToggle.onclick = toggleAdvancedOptions;
changeNameButton.onclick = showBoardNameEdit;
bluetoothRetrieveButton.onclick = async () => {
  try {
    // Check if Web Bluetooth is supported
    if (!navigator.bluetooth) {
      alert("Web Bluetooth is not supported in this browser.\n\nPlease use Chrome, Edge, or another Chromium-based browser with Bluetooth support.");
      return;
    }

    // Check if we have an active transport connection
    if (!transport) {
      alert("No serial connection available. Please connect to the device first.");
      return;
    }

    term.writeln("Preparing device for Bluetooth scanning...");
    bluetoothRetrieveButton.textContent = "Preparing...";
    bluetoothRetrieveButton.disabled = true;

    // Step 1: Reset ESP32 out of programming mode to enable Bluetooth
    term.writeln("Resetting device to enable Bluetooth...");
    await transport.setDTR(false);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await transport.setDTR(true);

    // Wait a bit for ESP32 to start up and enable Bluetooth
    term.writeln("Waiting for device to restart...");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Step 2: Scan for Bluetooth devices
    term.writeln("Scanning for Bluetooth devices starting with ⠀...");
    bluetoothRetrieveButton.textContent = "Scanning...";

    // Request Bluetooth device with name filter
    const device = await navigator.bluetooth.requestDevice({
      filters: [{
        namePrefix: '\u2800' // U+2800 character
      }],
      optionalServices: [] // We don't need any specific services, just the name
    });

    if (device && device.name) {
      term.writeln(`Found device: ${device.name}`);

      // Extract the name (remove the U+2800 prefix)
      let retrievedName = device.name;
      if (retrievedName.startsWith('\u2800')) {
        retrievedName = retrievedName.substring(1).trim();
      }

      if (retrievedName) {
        term.writeln(`Retrieved board name: "${retrievedName}"`);

        // Step 3: Put ESP32 back into programming mode
        term.writeln("Putting device back into programming mode...");
        bluetoothRetrieveButton.textContent = "Reconnecting...";

        // Disconnect first, then reconnect to restore programming mode
        await transport.disconnect();

        // Recreate transport and esploader to restore original settings
        transport = new Transport(serialDevice, true);
        const flashOptions = {
          transport,
          baudrate: parseInt(baudrates.value),
          terminal: espLoaderTerminal,
          debugLogging: false,
        } as LoaderOptions;
        esploader = new ESPLoader(flashOptions);

        // Reconnect with full initialization
        chip = await esploader.main();
        term.writeln("Device reconnected in programming mode.");

        // Update the board name input with retrieved name
        currentBoardName = retrievedName;
        boardNameInput.value = retrievedName;
        userHasModifiedName = true; // Mark as user-modified since it's from BT

        // Update board status
        updateBoardStatus(retrievedName, true);

        // Update flash warning visibility
        updateFlashWarning();

        // Hide the Bluetooth retrieve button since we got a name
        bluetoothRetrieveContainer.style.display = "none";

        term.writeln("Board name retrieved successfully via Bluetooth!");
      } else {
        term.writeln("Device found but no valid name extracted");
        alert("Device found but no valid board name could be extracted.");

        // Still need to reconnect even if name extraction failed
        term.writeln("Putting device back into programming mode...");
        await transport.disconnect();

        // Recreate transport and esploader
        transport = new Transport(serialDevice, true);
        const flashOptions = {
          transport,
          baudrate: parseInt(baudrates.value),
          terminal: espLoaderTerminal,
          debugLogging: false,
        } as LoaderOptions;
        esploader = new ESPLoader(flashOptions);
        chip = await esploader.main();
      }
    } else {
      term.writeln("No device selected or device has no name");
      alert("No device was selected or the device has no readable name.");

      // Still need to reconnect even if no device selected
      term.writeln("Putting device back into programming mode...");
      await transport.disconnect();

      // Recreate transport and esploader
      transport = new Transport(serialDevice, true);
      const flashOptions = {
        transport,
        baudrate: parseInt(baudrates.value),
        terminal: espLoaderTerminal,
        debugLogging: false,
      } as LoaderOptions;
      esploader = new ESPLoader(flashOptions);
      chip = await esploader.main();
    }

  } catch (error) {
    console.error('Bluetooth error:', error);
    term.writeln(`Bluetooth error: ${error.message}`);

    if (error.name === 'NotFoundError') {
      alert("No Stick 'Em Bluetooth devices found.\n\nMake sure your board is in Bluetooth mode and nearby.");
    } else if (error.name === 'NotAllowedError') {
      alert("Bluetooth access was denied.\n\nPlease allow Bluetooth access and try again.");
    } else {
      alert(`Bluetooth error: ${error.message}`);
    }

    // Always try to reconnect in case of error
    try {
      term.writeln("Attempting to reconnect device in programming mode...");
      await transport.disconnect();

      // Recreate transport and esploader
      transport = new Transport(serialDevice, true);
      const flashOptions = {
        transport,
        baudrate: parseInt(baudrates.value),
        terminal: espLoaderTerminal,
        debugLogging: false,
      } as LoaderOptions;
      esploader = new ESPLoader(flashOptions);
      chip = await esploader.main();
      term.writeln("Device reconnected successfully.");
    } catch (reconnectError) {
      term.writeln("Failed to reconnect device. You may need to disconnect and reconnect manually.");
      console.error('Reconnect error:', reconnectError);
    }

  } finally {
    // Reset button state
    bluetoothRetrieveButton.textContent = "Retrieve Name through Bluetooth";
    bluetoothRetrieveButton.disabled = false;
  }
};

// Add auto-save functionality for board name input with byte length validation
let previousValue = '';
boardNameInput.addEventListener('input', (event) => {
  const encoder = new TextEncoder();
  const currentValue = boardNameInput.value;
  const nameBytes = encoder.encode(currentValue);

  // If the new value exceeds 31 bytes, reject the input and restore previous value
  if (nameBytes.length > 31) {
    boardNameInput.value = previousValue;
    console.log('Input rejected: would exceed 31 bytes (' + nameBytes.length + ' bytes)');
    return;
  }

  // Accept the input and update previous value
  previousValue = currentValue;

  // Auto-save the current name as the user types
  currentBoardName = currentValue.trim();

  // Track if user has modified the default name
  userHasModifiedName = (currentBoardName !== defaultBoardName);

  // Update flash warning visibility
  updateFlashWarning();

  console.log('Auto-saved board name:', currentBoardName, '(' + nameBytes.length + ' bytes)', userHasModifiedName ? '(user modified)' : '(default)');
});

// Initialize previous value
boardNameInput.addEventListener('focus', () => {
  previousValue = boardNameInput.value;
});

// Flash firmware button should use the auto-saved board name
flashFirmwareButton.onclick = async () => {
  await flashFirmwareWithName();
};

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
        // Test if the port is actually still valid before using it
        try {
          await port.open({ baudRate: 115200 });
          await port.close();
          term.writeln("Found previously paired ESP32 device - connecting automatically!");
          return port;
        } catch (testError) {
          term.writeln("Previously paired device no longer available, scanning for new devices...");
          continue; // Skip this stale port and continue checking others
        }
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

async function readExistingBoardName(): Promise<string | null> {
  if (!esploader) {
    return null;
  }
  
  try {
    term.writeln("Reading existing board name...");
    
    // Read 32 bytes from the name address (to match firmware)
    const nameData = await esploader.readFlash(0x150000, 32);
    
    // Convert Uint8Array to string and find null terminator
    let nameString = '';
    for (let i = 0; i < nameData.length; i++) {
      const byte = nameData[i];
      if (byte === 0) break; // Null terminator found
      nameString += String.fromCharCode(byte);
    }
    
    // Check if we got a valid name (not empty and printable characters)
    if (nameString.length > 0 && /^[\x20-\x7E]*$/.test(nameString)) {
      term.writeln(`Found existing name: "${nameString}"`);
      return nameString;
    } else {
      term.writeln("No existing name found or name is invalid");
      return null;
    }
  } catch (e) {
    console.error('Failed to read existing name:', e);
    term.writeln("Warning: Could not read existing board name");
    return null;
  }
}

async function connectToDevice(autoDetect = true) {
  try {
    updateFeedback("Connecting to board...", 'connecting', false);
    device = null // Force re-scan
    if (device === null) {
      if (autoDetect) {
        term.writeln("Attempting to auto-detect ESP32 board...");
        device = await detectESP32Port();
      } else {
        term.writeln("Manual port selection...");
        device = await serialLib.requestPort({});
        term.writeln("Port selected manually.");
      }
      serialDevice = device; // Store the serial device reference
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
    lblConnTo.innerHTML = "Connected to device: " + chip;
    lblConnTo.style.display = "block";
    connectButton.style.display = "none";
    manualConnectButton.style.display = "none";
    disconnectButton.style.display = "initial";
    firmwareActionSection.style.display = "block";
    
    // Read and display the board name first
    const boardName = await readExistingBoardName();
    if (boardName) {
      updateBoardStatus(boardName, true);
      // Initialize the current board name with the existing name
      currentBoardName = boardName;
      userHasModifiedName = false; // Existing name, not user-modified
    } else {
      // Show notification for unnamed board
      alert(
        "Cannot detect board name, please type it in manually!"
      );

      updateBoardStatus("Unnamed Board", true, true, true); // Show warning for unnamed board
      // Show Bluetooth retrieve button for unnamed boards
      bluetoothRetrieveContainer.style.display = "block";
      // Initialize with default name for unnamed boards
      currentBoardName = defaultBoardName;
      userHasModifiedName = false; // Using default, not user-modified yet
    }
    
    // Focus on step 2 when connected
    focusStep(2);
    
    // Update connection status only after everything is successful (this will also show the change board name button)
    updateConnectionStatus(true);

    // Update flash warning visibility based on current name status
    updateFlashWarning();

    // Automatically open the board name edit section after successful connection
    showBoardNameEdit();

    updateFeedback("Connected successfully!", 'connected', false);
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
    updateBoardStatus("No Board Detected", false);
    updateConnectionStatus(false);
    updateFeedback("Connection failed", 'error', true);
    hideBoardNameEdit();
    
    // Focus back on step 1 when connection fails
    focusStep(1);
  }
}

connectButton.onclick = async () => {
  await connectToDevice(true);
};

manualConnectButton.onclick = async () => {
  await connectToDevice(false);
};


async function flashFirmwareWithName() {
  // Use the auto-saved board name
  const boardName = currentBoardName || "";

  if (!esploader) {
    term.writeln("Error: Please connect to device first");
    updateFeedback("Error: Please connect to device first", 'error', false);
    return;
  }

  if (!defaultBinaryData) {
    term.writeln("Error: Default binary file not loaded");
    updateFeedback("Error: Default binary file not loaded", 'error', false);
    return;
  }

  // Show progress bar and start flashing process
  updateFeedback("Starting firmware update...", 'flashing', false);
  showProgressBar();
  
  try {
    // Step 0: Start - Read existing board name before erasing (if no new name provided)
    updateProgress(0, 0);
    let nameToWrite = boardName;
    if (!boardName) {
      const existingName = await readExistingBoardName();
      if (existingName) {
        nameToWrite = existingName;
        term.writeln(`Will preserve existing name: "${existingName}"`);
      } else {
        term.writeln("No existing name to preserve");
      }
    }
    updateProgress(0, 100);
    
    // Step 1: Erasing Previous Firmware + Step 2: Flashing New Firmware
    updateProgress(1, 0);
    term.writeln("Step 1: Erasing previous firmware...");
    
    // Start the 10-second erasing progress simulation (stops at 99%)
    let erasingProgressInterval: NodeJS.Timeout | null = null;
    let erasingComplete = false;
    
    erasingProgressInterval = setInterval(() => {
      if (!erasingComplete) {
        const currentProgress = progressState.stepProgress[1];
        if (currentProgress < 99) {
          const newProgress = currentProgress + 1; // 99% over 10 seconds (100 intervals)
          updateProgress(1, newProgress);
          term.write(`Erasing firmware: ${Math.round(newProgress)}%\r`);
        }
        // Once we hit 99%, stay there until actual erase completes
      }
    }, 100); // Update every 100ms for smooth progress
    
    // Start the actual flashing process simultaneously
    const binaryFlashOptions: FlashOptions = {
      fileArray: [{ data: defaultBinaryData, address: 0x0 }],
      flashSize: "keep",
      eraseAll: true,
      compress: true,
      reportProgress: (fileIndex, written, total) => {
        // First time we get progress from actual flashing, the erase phase is done
        if (!erasingComplete) {
          erasingComplete = true;
          if (erasingProgressInterval) {
            clearInterval(erasingProgressInterval);
            erasingProgressInterval = null;
          }
          updateProgress(1, 100); // Complete erasing step
          term.writeln(`\nFlash erased!`);
          updateProgress(2, 0); // Start flashing step
          term.writeln("Step 2: Flashing new firmware...");
        }
        
        // Show real flashing progress on step 2
        const percent = Math.round((written / total) * 100);
        updateProgress(2, percent);
        term.write(`Flashing firmware: ${percent}%\r`);
      },
      calculateMD5Hash: (image) => CryptoJS.MD5(CryptoJS.enc.Latin1.parse(image)),
    } as FlashOptions;
    
    await esploader.writeFlash(binaryFlashOptions);
    
    // Clean up the interval if it's still running (shouldn't happen, but just in case)
    if (erasingProgressInterval) {
      clearInterval(erasingProgressInterval);
      erasingComplete = true;
      updateProgress(1, 100);
      term.writeln(`\nFlash erased!`);
    }
    
    term.writeln(`\nFirmware flashing completed successfully!`);
    updateProgress(2, 100);
    
    // Step 3: Writing Board Name
    updateProgress(3, 0);
    if (nameToWrite) {
      if (boardName) {
        term.writeln("Step 3: Writing new board name...");
      } else {
        term.writeln("Step 3: Restoring preserved board name...");
      }
      
      // Convert board name to binary data (null-terminated string)
      const encoder = new TextEncoder();
      const boardNameBytes = encoder.encode(nameToWrite + '\0');
      
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
          const percent = Math.round((written / total) * 100);
          updateProgress(3, percent);
          term.write(`Writing board name: ${percent}%\r`);
        },
        calculateMD5Hash: (image) => CryptoJS.MD5(CryptoJS.enc.Latin1.parse(image)),
      } as FlashOptions;
      
      await esploader.writeFlash(boardNameFlashOptions);
      term.writeln(`\nBoard name "${nameToWrite}" written successfully!`);
    } else {
      term.writeln("Step 3: No name to write (no existing name found and none provided)");
    }
    updateProgress(3, 100);
    
    // Final step: Reset the device
    term.writeln("Resetting device...");
    if (transport) {
      await transport.setDTR(false);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await transport.setDTR(true);
    }
    term.writeln("Device reset completed!");
    term.writeln("You can now click 'Disconnect' to finish.");
    
    // Success messages
    if (boardName) {
      term.writeln("Flash & Write Board Name completed successfully!");
      updateFeedback("You can now physically disconnect the board!", 'connected', false);
    } else if (nameToWrite) {
      term.writeln("Firmware update with name preservation completed successfully!");
      updateFeedback("You can now physically disconnect the board!", 'connected', false);
    } else {
      term.writeln("Firmware update completed successfully!");
      updateFeedback("You can now physically disconnect the board!", 'connected', false);
    }
    
    // Hide the board name edit section after successful flash
    hideBoardNameEdit();
    
    // Update the board name display
    if (nameToWrite) {
      updateBoardStatus(nameToWrite, true);
    }
    
    // Hide progress bar immediately since feedback shows completion
    hideProgressBar();
    
    // Auto-disconnect immediately
    term.writeln("Auto-disconnecting...");
    if (transport) {
      try {
        await transport.disconnect();
        term.writeln("Device disconnected successfully.");
      } catch (e) {
        console.warn("Disconnect error (cable may have been unplugged):", e.message);
        term.writeln("Device was already disconnected (cable unplugged?)");
      }
    }

    term.writeln("Ready for next connection.");
    connectButton.style.display = "initial";
    manualConnectButton.style.display = "initial";
    disconnectButton.style.display = "none";
    firmwareActionSection.style.setProperty("display", "none", "important");
    
    hideBoardNameEdit();
    bluetoothRetrieveContainer.style.display = "none";
    lblConnTo.style.display = "none";
    alertDiv.style.display = "none";
    cleanUp();
    
    // Reset board status and name variables
    updateBoardStatus("No Board Detected", false);
    updateConnectionStatus(false);
    currentBoardName = null;
    originalBoardName = null;
    userHasModifiedName = false;
    
    // Focus back on step 1 when disconnected
    focusStep(1);
    
  } catch (e) {
    console.error(e);
    term.writeln(`Error during firmware update: ${e.message}`);
    updateFeedback("Firmware update failed", 'error', false);
    hideProgressBar();
  }
}



/**
 * Clean devices variables on chip disconnect. Remove stale references if any.
 */
function cleanUp() {
  device = null;
  serialDevice = null;
  transport = null;
  chip = null;
}

disconnectButton.onclick = async () => {
  if (transport) {
    try {
      // Perform DTR reset before disconnecting
      await transport.setDTR(false);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await transport.setDTR(true);
      term.writeln("Device reset completed.");

      await transport.disconnect();
      term.writeln("Device disconnected successfully.");
    } catch (e) {
      console.warn("Disconnect error (cable may have been unplugged):", e.message);
      term.writeln("Device was already disconnected (cable unplugged?)");
    }
  }

  term.writeln("Ready for next connection.");
  connectButton.style.display = "initial";
  manualConnectButton.style.display = "initial";
  disconnectButton.style.display = "none";
  firmwareActionSection.style.display = "none";
  
  hideBoardNameEdit();
  hideProgressBar();
  bluetoothRetrieveContainer.style.display = "none";
  lblConnTo.style.display = "none";
  alertDiv.style.display = "none";
  cleanUp();
  
  // Reset board status and name variables
  updateBoardStatus("No Board Detected", false);
  updateConnectionStatus(false);
  updateFeedback("Ready to connect...", 'default', false);
  currentBoardName = null;
  originalBoardName = null;
  userHasModifiedName = false;
  
  // Focus back on step 1 when disconnected
  focusStep(1);
};

// Force Disconnect button (for emergency use during firmware update)
forceDisconnectButton.onclick = async () => {
  // Use the same disconnect logic as the regular disconnect button
  if (transport) {
    try {
      // Perform DTR reset before disconnecting
      await transport.setDTR(false);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await transport.setDTR(true);
      term.writeln("Device reset completed.");

      await transport.disconnect();
      term.writeln("Device disconnected successfully.");
    } catch (e) {
      console.warn("Disconnect error (cable may have been unplugged):", e.message);
      term.writeln("Device was already disconnected (cable unplugged?)");
    }
  }

  term.writeln("Ready for next connection.");
  connectButton.style.display = "initial";
  manualConnectButton.style.display = "initial";
  disconnectButton.style.display = "none";
  firmwareActionSection.style.display = "none";

  hideBoardNameEdit();
  hideProgressBar();
  bluetoothRetrieveContainer.style.display = "none";
  lblConnTo.style.display = "none";
  alertDiv.style.display = "none";
  cleanUp();

  // Reset board status and name variables
  updateBoardStatus("No Board Detected", false);
  updateConnectionStatus(false);
  updateFeedback("Ready to connect...", 'default', false);
  currentBoardName = null;
  originalBoardName = null;
  userHasModifiedName = false;

  // Focus back on step 1 when disconnected
  focusStep(1);
};




// Initialize default binary loading
loadDefaultBinary();

// Check Web Serial API support now that DOM elements are ready
checkWebSerialSupport();
