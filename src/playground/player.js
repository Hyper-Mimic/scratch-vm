// A minimal page for running project files (.sb3 / .sb2) locally. Unlike the
// benchmark page this one just runs the project instead of profiling it.

const ScratchStorage = require('scratch-storage');
const VirtualMachine = require('..');
const Runtime = require('../engine/runtime');

const ScratchRender = require('scratch-render');
const AudioEngine = require('scratch-audio');
const ScratchSVGRenderer = require('@turbowarp/scratch-svg-renderer');

const ASSET_SERVER = 'https://cdn.assets.scratch.mit.edu/';

const canvas = document.getElementById('stage');
const localProjectInput = document.getElementById('local-project');
const greenFlagButton = document.getElementById('green-flag');
const stopButton = document.getElementById('stop');
const turboInput = document.getElementById('turbo');
const statusElement = document.getElementById('status');

const setStatus = text => {
    statusElement.innerText = text;
};

// Surface errors in the page as well as in the console, so that a failure while
// setting up the VM does not look like a dead button.
window.addEventListener('error', event => {
    const message = event.message ||
        `Failed to load ${event.target && event.target.src ? event.target.src : 'a resource'}`;
    setStatus(`Player error: ${message}`);
}, true);

// Incremented for every import so that an older import which is still loading
// can tell that it has been superseded.
let loadToken = 0;

const vm = new VirtualMachine();
window.Scratch = window.Scratch || {};
window.Scratch.vm = vm;

/**
 * @param {Asset} asset - calculate a URL for this asset.
 * @returns {string} a URL to download a project asset (PNG, WAV, etc.)
 */
const getAssetUrl = function (asset) {
    const assetUrlParts = [
        ASSET_SERVER,
        'internalapi/asset/',
        asset.assetId,
        '.',
        asset.dataFormat,
        '/get/'
    ];
    return assetUrlParts.join('');
};

let renderer = null;

// Keep the canvas and the renderer in sync with the project's stage size.
const updateStageSize = () => {
    const stageWidth = vm.runtime.stageWidth;
    const stageHeight = vm.runtime.stageHeight;
    if (renderer) {
        renderer.resize(stageWidth, stageHeight);
    }
    canvas.style.width = `${stageWidth}px`;
    canvas.style.height = `${stageHeight}px`;
};

// Build the storage, renderer and audio engine. Kept in a function so that a
// failure here (for example when WebGL is unavailable) can be reported without
// disabling the file picker below.
const setupRuntime = () => {
    const storage = new ScratchStorage();
    const AssetType = storage.AssetType;
    // Assets are normally packed inside the .sb3 file, but provide a web source
    // so that projects with missing assets do not fail to load.
    storage.addWebSource([AssetType.ImageVector, AssetType.ImageBitmap, AssetType.Sound], getAssetUrl);
    vm.attachStorage(storage);

    renderer = new ScratchRender(canvas);
    vm.attachRenderer(renderer);

    vm.attachAudioEngine(new AudioEngine());
    vm.attachV2BitmapAdapter(new ScratchSVGRenderer.BitmapAdapter());

    vm.runtime.on(Runtime.STAGE_SIZE_CHANGED, updateStageSize);
};

// Feed mouse events to the VM as I/O data.
const getCanvasPosition = event => {
    const rect = canvas.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        canvasWidth: rect.width,
        canvasHeight: rect.height
    };
};
canvas.addEventListener('mousemove', event => {
    vm.postIOData('mouse', getCanvasPosition(event));
});
canvas.addEventListener('mousedown', event => {
    vm.postIOData('mouse', Object.assign(getCanvasPosition(event), {isDown: true}));
    event.preventDefault();
});
canvas.addEventListener('mouseup', event => {
    vm.postIOData('mouse', Object.assign(getCanvasPosition(event), {isDown: false}));
    event.preventDefault();
});

// Feed keyboard events to the VM as I/O data.
const isTextInput = element => (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
);
document.addEventListener('keydown', event => {
    if (isTextInput(event.target)) return;
    vm.postIOData('keyboard', {
        keyCode: event.keyCode,
        isDown: true
    });
    event.preventDefault();
});
document.addEventListener('keyup', event => {
    vm.postIOData('keyboard', {
        keyCode: event.keyCode,
        isDown: false
    });
    if (!isTextInput(event.target)) {
        event.preventDefault();
    }
});

/**
 * Load a project file into the VM and run it.
 * @param {File} file - an .sb3 or .sb2 file.
 */
const runProjectFile = async file => {
    if (!file) return;

    const token = ++loadToken;
    setStatus(`Loading ${file.name}...`);

    try {
        const data = await file.arrayBuffer();
        if (token !== loadToken) return;
        await vm.loadProject(data);
        if (token !== loadToken) return;
        updateStageSize();
        vm.setTurboMode(turboInput.checked);
        vm.start();
        vm.greenFlag();
        setStatus(`Running ${file.name} (drop another file to switch projects)`);
    } catch (error) {
        if (token !== loadToken) return;
        console.error(error);
        setStatus(`Unable to load ${file.name}: ${error.message}`);
    }
};

let setupError = null;
try {
    setupRuntime();
    updateStageSize();
    vm.setTurboMode(turboInput.checked);
    vm.start();
} catch (error) {
    setupError = error;
    console.error(error);
    setStatus(`Unable to start the player: ${error.message}`);
}

// The "Import .sb3" control is a <label for="local-project">, so the browser
// opens the file picker natively without any JavaScript. These listeners are
// attached after setup so that they stay usable if setup reported an error.
localProjectInput.addEventListener('change', () => {
    const file = localProjectInput.files && localProjectInput.files[0];
    // Clear the input so that choosing the same file again fires another change
    // event.
    localProjectInput.value = '';
    runProjectFile(file);
}, false);

greenFlagButton.addEventListener('click', () => vm.greenFlag(), false);
stopButton.addEventListener('click', () => vm.stopAll(), false);
turboInput.addEventListener('change', () => vm.setTurboMode(turboInput.checked), false);

// Allow dropping a project file onto the stage.
canvas.addEventListener('dragover', event => {
    event.preventDefault();
    canvas.classList.add('drop-target');
});
canvas.addEventListener('dragleave', () => {
    canvas.classList.remove('drop-target');
});
canvas.addEventListener('drop', event => {
    event.preventDefault();
    canvas.classList.remove('drop-target');
    runProjectFile(event.dataTransfer.files && event.dataTransfer.files[0]);
});
// Stop the browser from navigating away when a file is dropped elsewhere.
document.addEventListener('dragover', event => event.preventDefault());
document.addEventListener('drop', event => event.preventDefault());

if (!setupError) {
    setStatus('Ready — choose or drop an .sb3 file');
}
