/**
         * APPLICATION STATE & CONSTANTS
         */
        const params = {
            speed: 1.0,
            distortion: 0.5,
            colorShift: 0,
            rotationSpeed: 0.005
        };

        const state = {
            isPlaying: false,
            audioContext: null,
            analyser: null,
            source: null,
            buffer: null,
            startTime: 0,
            pauseTime: 0,
            duration: 0
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

        /**
         * AUDIO SYSTEM (Web Audio API)
         */
        const fileInput = document.getElementById('audio-file');
        const uploadBtn = document.getElementById('upload-btn');
        const dropZone = document.getElementById('drop-zone');
        const playBtn = document.getElementById('play-btn');
        const stopBtn = document.getElementById('stop-btn');
        
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

        function loadAudioFile(file) {
            if (!state.audioContext) {
                state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                state.analyser = state.audioContext.createAnalyser();
                state.analyser.fftSize = 2048; // High resolution for visuals
                state.analyser.smoothingTimeConstant = 0.85;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                state.audioContext.decodeAudioData(e.target.result, (buffer) => {
                    state.buffer = buffer;
                    state.duration = buffer.duration;
                    document.getElementById('file-name').textContent = file.name;
                    document.getElementById('time-total').textContent = formatTime(state.duration);
                    document.getElementById('track-info').classList.remove('hidden');
                    log(`Audio Loaded: ${file.name}`);
                    log(`Sample Rate: ${buffer.sampleRate}Hz`);
                    
                    // Auto play
                    playAudio();
                }, (err) => log("Error decoding audio data"));
            };
            reader.readAsArrayBuffer(file);
        }

        function playAudio() {
            if (!state.buffer) return;
            
            if (state.source) {
                state.source.stop();
            }

            state.source = state.audioContext.createBufferSource();
            state.source.buffer = state.buffer;
            state.source.connect(state.analyser);
            state.analyser.connect(state.audioContext.destination);
            
            const offset = state.pauseTime % state.duration;
            state.source.start(0, offset);
            state.startTime = state.audioContext.currentTime - offset;
            
            state.isPlaying = true;
            playBtn.textContent = 'PAUSE';
            playBtn.classList.add('text-neon-blue', 'border-neon-blue');
            log('Playback Started');
            
            state.source.onended = () => {
                if (state.isPlaying) { // Finished naturally
                    stopAudio();
                    state.pauseTime = 0;
                    updateTimelineUI(0);
                }
            };
        }

        function pauseAudio() {
            if (state.source) {
                state.source.stop();
                state.pauseTime = state.audioContext.currentTime - state.startTime;
                state.isPlaying = false;
                playBtn.textContent = 'PLAY';
                playBtn.classList.remove('text-neon-blue', 'border-neon-blue');
                log('Playback Paused');
            }
        }

        function stopAudio() {
            if (state.source) state.source.stop();
            state.isPlaying = false;
            state.pauseTime = 0;
            playBtn.textContent = 'PLAY';
            playBtn.classList.remove('text-neon-blue', 'border-neon-blue');
            updateTimelineUI(0);
            log('Playback Stopped');
        }

        playBtn.addEventListener('click', () => state.isPlaying ? pauseAudio() : playAudio());
        stopBtn.addEventListener('click', stopAudio);

        function formatTime(seconds) {
            const m = Math.floor(seconds / 60);
            const s = Math.floor(seconds % 60);
            return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        }

        function updateTimelineUI(progress) {
            const percent = (progress * 100).toFixed(1) + '%';
            document.getElementById('playback-bar').style.width = percent;
            document.getElementById('time-current').textContent = formatTime(progress * state.duration);
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
                    const elapsed = state.audioContext.currentTime - state.startTime;
                    const progress = elapsed / state.duration;
                    if(progress <= 1.0) updateTimelineUI(progress);
                    
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
