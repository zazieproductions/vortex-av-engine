/**
 * APPLICATION STATE & CONSTANTS
 */
const params = {
    speed: 1.0,
    distortion: 0.5,
    colorShift: 0,
    rotationSpeed: 0.005,
    leadPitchMult: 1.0,
    bassFilterFreq: 400
};

const state = {
    isPlaying: false,
    sourceType: null, // 'file', 'mic', 'synth', or null
    audioContext: null,
    analyser: null,
    source: null,
    buffer: null,
    startTime: 0,
    pauseTime: 0,
    duration: 0,
    micStream: null,
    micSource: null,
    synthTimer: null,
    currentStep: 0
};

const logEl = document.getElementById('console-log');

function log(msg) {
    const line = document.createElement('div');
    line.textContent = `> ${msg}`;
    logEl.appendChild(line);
    if(logEl.children.length > 5) logEl.removeChild(logEl.firstChild);
}

/**
 * UI INITIALIZATION
 */
// Generate Mod Matrix
const matrixEl = document.getElementById('mod-matrix');
for (let i = 0; i < 32; i++) {
    const cell = document.createElement('div');
    cell.className = 'matrix-cell';
    cell.onclick = () => {
        cell.classList.toggle('active');
        // Randomize a param slightly to show effect
        params.speed = Math.random() * 2 + 0.5;
        document.getElementById('param-speed').value = params.speed;
        document.getElementById('val-speed').textContent = params.speed.toFixed(1) + 'x';
        log(`Mod_Mutation: Step ${i}`);
    };
    matrixEl.appendChild(cell);
}

// Event Listeners for Sliders
document.getElementById('param-speed').addEventListener('input', (e) => {
    params.speed = parseFloat(e.target.value);
    document.getElementById('val-speed').textContent = params.speed.toFixed(1) + 'x';
});

document.getElementById('param-distort').addEventListener('input', (e) => {
    params.distortion = parseFloat(e.target.value);
    document.getElementById('val-distort').textContent = params.distortion.toFixed(2);
});

// Event Listeners for Oscillator Bank Sliders
document.getElementById('param-lead-pitch').addEventListener('input', (e) => {
    params.leadPitchMult = parseFloat(e.target.value);
    document.getElementById('val-lead-pitch').textContent = params.leadPitchMult.toFixed(1) + 'x';
});

document.getElementById('param-bass-filter').addEventListener('input', (e) => {
    params.bassFilterFreq = parseInt(e.target.value, 10);
    document.getElementById('val-bass-filter').textContent = params.bassFilterFreq + 'Hz';
});

/**
 * AUDIO SYSTEM (Web Audio API)
 */
const fileInput = document.getElementById('audio-file');
const uploadBtn = document.getElementById('upload-btn');
const dropZone = document.getElementById('drop-zone');
const playBtn = document.getElementById('play-btn');
const stopBtn = document.getElementById('stop-btn');
const micBtn = document.getElementById('mic-btn');
const synthBtn = document.getElementById('synth-btn');

// Drag & Drop
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); });
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if(e.dataTransfer.files.length) loadAudioFile(e.dataTransfer.files[0]);
});

uploadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
    if(e.target.files.length) loadAudioFile(e.target.files[0]);
});

function initAudioContext() {
    if (!state.audioContext) {
        state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        state.analyser = state.audioContext.createAnalyser();
        state.analyser.fftSize = 2048; // High resolution for visuals
        state.analyser.smoothingTimeConstant = 0.85;
    }
}

function loadAudioFile(file) {
    initAudioContext();

    const reader = new FileReader();
    reader.onload = (e) => {
        state.audioContext.decodeAudioData(e.target.result, (buffer) => {
            stopAllSources();
            
            state.buffer = buffer;
            state.duration = buffer.duration;
            document.getElementById('file-name').textContent = file.name;
            document.getElementById('time-total').textContent = formatTime(state.duration);
            document.getElementById('track-info').classList.remove('hidden');
            log(`Audio Loaded: ${file.name}`);
            log(`Sample Rate: ${buffer.sampleRate}Hz`);
            
            state.sourceType = 'file';
            playAudio();
        }, (err) => log("Error decoding audio data"));
    };
    reader.readAsArrayBuffer(file);
}

function playAudio() {
    if (!state.buffer) return;
    initAudioContext();

    if (state.source) {
        try { state.source.stop(); } catch(e) {}
    }

    state.source = state.audioContext.createBufferSource();
    state.source.buffer = state.buffer;
    
    // Reconnect analyser to destination for hearing playback
    state.analyser.connect(state.audioContext.destination);
    state.source.connect(state.analyser);
    
    const offset = state.pauseTime % state.duration;
    state.source.start(0, offset);
    state.startTime = state.audioContext.currentTime - offset;
    
    state.isPlaying = true;
    state.sourceType = 'file';
    playBtn.textContent = 'PAUSE';
    playBtn.classList.add('text-neon-blue', 'border-neon-blue');
    log('Playback Started');
    
    state.source.onended = () => {
        if (state.isPlaying && state.sourceType === 'file') { // Finished naturally
            stopAllSources();
        }
    };
}

function pauseAudio() {
    if (state.source && state.sourceType === 'file') {
        try { state.source.stop(); } catch(e) {}
        state.pauseTime = state.audioContext.currentTime - state.startTime;
        state.isPlaying = false;
        playBtn.textContent = 'PLAY';
        playBtn.classList.remove('text-neon-blue', 'border-neon-blue');
        log('Playback Paused');
    }
}

function stopAllSources() {
    // Stop file playback
    if (state.source) {
        try { state.source.stop(); } catch(e) {}
        try { state.source.disconnect(); } catch(e) {}
        state.source = null;
    }
    state.isPlaying = false;
    state.pauseTime = 0;
    playBtn.textContent = 'PLAY';
    playBtn.classList.remove('text-neon-blue', 'border-neon-blue');
    updateTimelineUI(0);
    
    // Stop mic input
    if (state.micStream) {
        state.micStream.getTracks().forEach(track => track.stop());
        state.micStream = null;
    }
    if (state.micSource) {
        try { state.micSource.disconnect(); } catch(e) {}
        state.micSource = null;
    }
    micBtn.textContent = '🎤 MIC / LINE INPUT';
    micBtn.classList.remove('text-neon-red', 'border-neon-red');

    // Stop synthesizer
    if (state.synthTimer) {
        clearInterval(state.synthTimer);
        state.synthTimer = null;
    }
    synthBtn.textContent = '🎹 SYNTH / GEN DEMO';
    synthBtn.classList.remove('text-neon-yellow', 'border-[#fcee0a]');
    
    // Disconnect analyzer outgoing to prevent leaks or feedthrough
    if (state.analyser) {
        try { state.analyser.disconnect(); } catch(e) {}
    }
    
    state.sourceType = null;
    log('All Sources Stopped');
}

// Play/Pause button for files
playBtn.addEventListener('click', () => {
    if (state.sourceType === 'mic' || state.sourceType === 'synth') {
        stopAllSources();
    }
    if (!state.buffer) {
        log('No file loaded. Click BROWSE or try LIVE PREVIEWS!');
        return;
    }
    state.sourceType = 'file';
    state.isPlaying ? pauseAudio() : playAudio();
});

stopBtn.addEventListener('click', stopAllSources);

/**
 * MICROPHONE LIVE PREVIEW
 */
micBtn.addEventListener('click', () => {
    if (state.sourceType === 'mic') {
        stopAllSources();
    } else {
        startMic();
    }
});

function startMic() {
    initAudioContext();
    if (state.audioContext.state === 'suspended') {
        state.audioContext.resume();
    }
    
    stopAllSources();
    
    state.sourceType = 'mic';
    state.isPlaying = true;
    
    // Disconnect analyser from destination to prevent audio feedback (howling)
    state.analyser.disconnect();
    
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then((stream) => {
            state.micStream = stream;
            state.micSource = state.audioContext.createMediaStreamSource(stream);
            state.micSource.connect(state.analyser);
            
            // Update UI state
            document.getElementById('file-name').textContent = "🎤 LIVE_MIC_INPUT_STREAM";
            document.getElementById('time-total').textContent = "LIVE";
            document.getElementById('track-info').classList.remove('hidden');
            micBtn.textContent = '■ STOP MIC';
            micBtn.classList.add('text-neon-red', 'border-neon-red');
            log('Microphone Stream Active');
            log('Acoustic Feedback Blocked');
        })
        .catch((err) => {
            log('Mic Access Denied/Error');
            console.error(err);
            stopAllSources();
        });
}

/**
 * PROCEDURAL SYNTHESIZER GENERATOR DEMO
 */
let noiseBuffer = null;
function getNoiseBuffer() {
    if (noiseBuffer) return noiseBuffer;
    initAudioContext();
    const bufferSize = state.audioContext.sampleRate * 0.1; // 100ms
    noiseBuffer = state.audioContext.createBuffer(1, bufferSize, state.audioContext.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
    }
    return noiseBuffer;
}

synthBtn.addEventListener('click', () => {
    if (state.sourceType === 'synth') {
        stopAllSources();
    } else {
        startSynth();
    }
});

function startSynth() {
    initAudioContext();
    if (state.audioContext.state === 'suspended') {
        state.audioContext.resume();
    }
    
    stopAllSources();
    
    state.sourceType = 'synth';
    state.isPlaying = true;
    
    // Make sure analyser is connected to destination so we hear the synth
    state.analyser.connect(state.audioContext.destination);
    
    state.currentStep = 0;
    const scheduleAheadTime = 0.1; // schedule 100ms ahead
    const bpm = 120;
    const stepDuration = 60 / bpm / 4; // 16th note = 125ms
    let nextNoteTime = state.audioContext.currentTime;
    
    state.synthTimer = setInterval(() => {
        while (nextNoteTime < state.audioContext.currentTime + scheduleAheadTime) {
            scheduleStep(state.currentStep, nextNoteTime);
            updateTimelineUI(state.currentStep / 64);
            nextNoteTime += stepDuration;
            state.currentStep = (state.currentStep + 1) % 64;
        }
    }, 25);
    
    // Update UI state
    document.getElementById('file-name').textContent = "⚠️ PROCEDURAL_SYNTH_ENGINE";
    document.getElementById('time-total').textContent = "∞ (LOOPING)";
    document.getElementById('track-info').classList.remove('hidden');
    synthBtn.textContent = '■ STOP SYNTH';
    synthBtn.classList.add('text-neon-yellow', 'border-[#fcee0a]');
    log('Synth Engine Activated');
    log('Tempo: 120 BPM');
}

function scheduleStep(step, time) {
    const bar = Math.floor(step / 16);
    const stepInBar = step % 16;
    
    // Select chord progression based on bar
    let rootFreq = 65.41; // C2
    let arpNotes = [261.63, 311.13, 392.00, 466.16]; // C4, Eb4, G4, Bb4
    
    if (bar === 1) {
        rootFreq = 51.91; // Ab1
        arpNotes = [207.65, 261.63, 311.13, 415.30]; // Ab3, C4, Eb4, Ab4
    } else if (bar === 2) {
        rootFreq = 58.27; // Bb1
        arpNotes = [233.08, 293.66, 349.23, 466.16]; // Bb3, D4, F4, Bb4
    } else if (bar === 3) {
        rootFreq = 49.00; // G1
        arpNotes = [196.00, 246.94, 293.66, 392.00]; // G3, B3, D4, G4
    }
    
    // 1. Kick (Steps 0, 4, 8, 12)
    if (stepInBar === 0 || stepInBar === 4 || stepInBar === 8 || stepInBar === 12) {
        playKick(time);
    }
    
    // 2. Bass (On beat and syncopated eighth notes)
    if ([0, 2, 3, 6, 8, 10, 11, 14].includes(stepInBar)) {
        // Alternates Octaves
        const bassFreq = rootFreq * (stepInBar % 4 === 0 ? 1 : 2);
        playBass(bassFreq, time);
    }
    
    // 3. Hi-Hat (Offbeat 16ths/8ths)
    if (stepInBar === 2 || stepInBar === 6 || stepInBar === 10 || stepInBar === 14) {
        playHihat(time, 0.45); // Heavy offbeat
    } else if ([1, 3, 5, 7, 9, 11, 13, 15].includes(stepInBar)) {
        if (Math.random() > 0.4) playHihat(time, 0.15); // Light randomized hats
    }
    
    // 4. Arpeggiator Lead
    const arpIndex = (stepInBar * 3) % arpNotes.length;
    const leadFreq = arpNotes[arpIndex] * params.leadPitchMult;
    
    const leadPatterns = [0, 3, 4, 7, 8, 11, 12, 15];
    if (leadPatterns.includes(stepInBar)) {
        playLead(leadFreq, time);
    }
}

function playKick(time) {
    const osc = state.audioContext.createOscillator();
    const gain = state.audioContext.createGain();
    
    osc.connect(gain);
    gain.connect(state.analyser);
    
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.15);
    
    gain.gain.setValueAtTime(1.0, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
    
    osc.start(time);
    osc.stop(time + 0.18);
}

function playBass(freq, time) {
    const osc = state.audioContext.createOscillator();
    const gain = state.audioContext.createGain();
    const filter = state.audioContext.createBiquadFilter();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);
    
    filter.type = 'lowpass';
    // Use real value from slider parameter
    const startCutoff = params.bassFilterFreq;
    filter.frequency.setValueAtTime(startCutoff, time);
    filter.frequency.exponentialRampToValueAtTime(startCutoff * 2, time + 0.05);
    filter.frequency.exponentialRampToValueAtTime(startCutoff / 3, time + 0.15);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(state.analyser);
    
    gain.gain.setValueAtTime(0.35, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    
    osc.start(time);
    osc.stop(time + 0.15);
}

function playHihat(time, volume) {
    const source = state.audioContext.createBufferSource();
    source.buffer = getNoiseBuffer();
    
    const filter = state.audioContext.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7000, time);
    
    const gain = state.audioContext.createGain();
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    
    source.connect(filter);
    filter.connect(gain);
    gain.connect(state.analyser);
    
    source.start(time);
    source.stop(time + 0.05);
}

function playLead(freq, time) {
    const osc = state.audioContext.createOscillator();
    const gain = state.audioContext.createGain();
    const filter = state.audioContext.createBiquadFilter();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(3, time);
    filter.frequency.setValueAtTime(1200, time);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.5, time + 0.1);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(state.analyser);
    
    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
    
    osc.start(time);
    osc.stop(time + 0.22);
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

function updateTimelineUI(progress) {
    const percent = (progress * 100).toFixed(1) + '%';
    document.getElementById('playback-bar').style.width = percent;
    if (state.sourceType === 'file') {
        document.getElementById('time-current').textContent = formatTime(progress * state.duration);
    } else if (state.sourceType === 'synth') {
        document.getElementById('time-current').textContent = `STEP_${String(state.currentStep).padStart(2,'0')}`;
    }
    document.getElementById('playhead').style.left = percent;
}

/**
 * THREE.JS VISUALIZATION SYSTEM
 */
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
// Fog for depth
scene.fog = new THREE.FogExp2(0x000000, 0.02);

const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
camera.position.z = 30;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

// -- Central Geometry: Icosahedron (The Core) --
const geometry = new THREE.IcosahedronGeometry(10, 4); // Detailed sphere
const material = new THREE.MeshStandardMaterial({
    color: 0x111111,
    wireframe: true,
    emissive: 0x00f0ff,
    emissiveIntensity: 0.2,
    roughness: 0.4,
    metalness: 0.8
});
const coreSphere = new THREE.Mesh(geometry, material);
scene.add(coreSphere);

// -- Inner Core (Glowing) --
const innerGeo = new THREE.IcosahedronGeometry(4, 2);
const innerMat = new THREE.MeshBasicMaterial({
    color: 0xff003c,
    wireframe: false,
    transparent: true,
    opacity: 0.8
});
const innerCore = new THREE.Mesh(innerGeo, innerMat);
scene.add(innerCore);

// -- Particle System (The Field) --
const particlesGeo = new THREE.BufferGeometry();
const particleCount = 4000;
const posArray = new Float32Array(particleCount * 3);
const originalPosArray = new Float32Array(particleCount * 3);

for(let i = 0; i < particleCount * 3; i++) {
    posArray[i] = (Math.random() - 0.5) * 100; // Spread wide
    originalPosArray[i] = posArray[i];
}

particlesGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
const particlesMat = new THREE.PointsMaterial({
    size: 0.2,
    color: 0xfcee0a,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending
});
const particleMesh = new THREE.Points(particlesGeo, particlesMat);
scene.add(particleMesh);

// -- Lighting --
const ambientLight = new THREE.AmbientLight(0x404040);
scene.add(ambientLight);

const pointLight = new THREE.PointLight(0x00f0ff, 2, 100);
pointLight.position.set(10, 10, 10);
scene.add(pointLight);

const pointLight2 = new THREE.PointLight(0xff003c, 2, 100);
pointLight2.position.set(-10, -10, 10);
scene.add(pointLight2);

// -- 2D Canvas Analyzers Setup --
const freqCanvas = document.getElementById('freq-canvas');
const waveCanvas = document.getElementById('wave-canvas');
const fCtx = freqCanvas.getContext('2d');
const wCtx = waveCanvas.getContext('2d');

// Resize handlers
function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    // Resize 2D canvases
    freqCanvas.width = freqCanvas.parentElement.clientWidth;
    freqCanvas.height = freqCanvas.parentElement.clientHeight;
    waveCanvas.width = waveCanvas.parentElement.clientWidth;
    waveCanvas.height = waveCanvas.parentElement.clientHeight;
}
window.addEventListener('resize', resize);
resize();

/**
 * ANIMATION LOOP
 */
// Store original vertex positions for morphing
const positionAttribute = geometry.attributes.position;
const vertex = new THREE.Vector3();
const originalPositions = positionAttribute.array.slice(); // Clone

function animate() {
    requestAnimationFrame(animate);

    // 1. Audio Analysis
    let dataArray = new Uint8Array(0);
    let waveArray = new Uint8Array(0);
    let bassFreq = 0;
    let midFreq = 0;
    let highFreq = 0;

    if (state.analyser) {
        const bufferLength = state.analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        state.analyser.getByteFrequencyData(dataArray);

        waveArray = new Uint8Array(bufferLength);
        state.analyser.getByteTimeDomainData(waveArray);

        // Calculate band averages
        const lowerBound = Math.floor(bufferLength * 0.01); // Bass
        const midBound = Math.floor(bufferLength * 0.1);   // Mids
        let sumBass = 0, sumMid = 0, sumHigh = 0;
        
        for(let i=0; i<bufferLength; i++) {
            if(i < lowerBound) sumBass += dataArray[i];
            else if(i < midBound) sumMid += dataArray[i];
            else sumHigh += dataArray[i];
        }
        bassFreq = sumBass / lowerBound;
        midFreq = sumMid / (midBound - lowerBound);
        highFreq = sumHigh / (bufferLength - midBound);

        // Update Timeline UI
        if (state.isPlaying) {
            if (state.sourceType === 'file') {
                const elapsed = state.audioContext.currentTime - state.startTime;
                const progress = elapsed / state.duration;
                if(progress <= 1.0) updateTimelineUI(progress);
            }
            
            // Fake Stats update
            if(Math.random() > 0.95) document.getElementById('cpu-stat').textContent = Math.floor(bassFreq * 0.2 + 10);
        }
    }

    // 2. Three.js Updates
    
    // Rotate objects
    const speed = params.speed * 0.01 + (bassFreq * 0.0002);
    coreSphere.rotation.y += speed;
    coreSphere.rotation.x += speed * 0.5;
    particleMesh.rotation.y -= speed * 0.2;

    // Pulse Inner Core with Bass
    const scale = 1 + (bassFreq / 255) * (params.distortion * 2);
    innerCore.scale.set(scale, scale, scale);
    
    // Distort Core Sphere based on Mids/Highs
    const time = Date.now() * 0.001 * params.speed;
    for (let i = 0; i < positionAttribute.count; i++) {
        vertex.fromArray(originalPositions, i * 3);
        
        // Simplex-like noise simulation using sine waves
        const noise = Math.sin(vertex.x * 0.5 + time) * Math.cos(vertex.y * 0.5 + time) * Math.sin(vertex.z * 0.5 + time);
        
        // Apply distortion based on audio intensity
        const dist = (noise * (midFreq / 50) * params.distortion);
        
        // Normalize and push out
        vertex.normalize().multiplyScalar(10 + dist);
        
        positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    positionAttribute.needsUpdate = true;

    // Animate Particles
    const particlePositions = particleMesh.geometry.attributes.position.array;
    for(let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        // Wiggle
        particlePositions[i3 + 1] += Math.sin(time + particlePositions[i3]) * 0.02 * params.speed;
        
        // React to high freqs (explode effect)
        if (highFreq > 100) {
            particlePositions[i3] *= 1.005;
            particlePositions[i3+1] *= 1.005;
            particlePositions[i3+2] *= 1.005;
        } else {
            // Return to original slowly
            particlePositions[i3] += (originalPosArray[i3] - particlePositions[i3]) * 0.02;
            particlePositions[i3+1] += (originalPosArray[i3+1] - particlePositions[i3+1]) * 0.02;
            particlePositions[i3+2] += (originalPosArray[i3+2] - particlePositions[i3+2]) * 0.02;
        }
    }
    particleMesh.geometry.attributes.position.needsUpdate = true;

    // Color Cycling
    const hue = (Date.now() * 0.0001 * params.speed) % 1;
    material.emissive.setHSL(hue, 1, 0.5);
    pointLight.color.setHSL((hue + 0.5) % 1, 1, 0.5);

    renderer.render(scene, camera);

    // 3. 2D Canvas Draws
    drawFreqVisualizer(dataArray);
    drawWaveVisualizer(waveArray);
}

function drawFreqVisualizer(data) {
    const w = freqCanvas.width;
    const h = freqCanvas.height;
    fCtx.clearRect(0, 0, w, h);
    
    if(data.length === 0) return;

    const barWidth = (w / data.length) * 2.5;
    let barHeight;
    let x = 0;

    for(let i = 0; i < data.length; i++) {
        barHeight = (data[i] / 255) * h;
        
        // Gradient color
        const r = barHeight + (25 * (i/data.length));
        const g = 250 * (i/data.length);
        const b = 50;

        fCtx.fillStyle = `rgb(${r},${g},${b})`;
        fCtx.fillRect(x, h - barHeight, barWidth, barHeight);
        x += barWidth + 1;
        if(x > w) break; // Optimization
    }
}

function drawWaveVisualizer(data) {
    const w = waveCanvas.width;
    const h = waveCanvas.height;
    wCtx.clearRect(0, 0, w, h);
    wCtx.lineWidth = 2;
    wCtx.strokeStyle = '#00f0ff';
    wCtx.beginPath();

    const sliceWidth = w * 1.0 / data.length;
    let x = 0;

    for(let i = 0; i < data.length; i++) {
        const v = data[i] / 128.0;
        const y = v * h / 2;

        if(i === 0) wCtx.moveTo(x, y);
        else wCtx.lineTo(x, y);

        x += sliceWidth;
    }
    wCtx.lineTo(waveCanvas.width, waveCanvas.height/2);
    wCtx.stroke();
}

// Start Loop
animate();

// Initial Welcome Log
setTimeout(() => log('Visual Cortex Online...'), 500);
setTimeout(() => log('Render Pipeline: 60 FPS'), 1000);
