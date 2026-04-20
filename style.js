let audio = new Audio();
audio.preload = "metadata";

// DOM elements
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const muteBtn = document.getElementById('muteBtn');
const loopBtn = document.getElementById('loopBtn');
const volumeSlider = document.getElementById('volumeSlider');
const speedSlider = document.getElementById('speedSlider');
const seekSlider = document.getElementById('seekSlider');
const currentTimeSpan = document.getElementById('currentTimeDisplay');
const durationSpan = document.getElementById('durationDisplay');
const volumePercentSpan = document.getElementById('volumePercent');
const speedPercentSpan = document.getElementById('speedPercent');
const audioFileInput = document.getElementById('audioFile');
const fileChooserLabel = document.getElementById('fileChooserLabel');
const fileStatus = document.getElementById('fileStatus');
const removeFileBtn = document.getElementById('removeFileBtn');
let currentFileUrl = null;

function updateFileControls(hasFile) {
  if (hasFile) {
    fileChooserLabel.classList.add('hidden');
    removeFileBtn.classList.remove('hidden');
  } else {
    fileChooserLabel.classList.remove('hidden');
    removeFileBtn.classList.add('hidden');
    fileStatus.innerText = 'no file loaded';
  }
}

// Visualizer elements
const visualBarsContainer = document.getElementById('visualBars');
let barElements = [];
let animationFrameId = null;
let audioContext = null;
let analyserNode = null;
let mediaSourceNode = null;
let isAudioContextInitialized = false;

//  helper format time mm:ss 
function formatTime(seconds) {
  if (isNaN(seconds)) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// update UI with current time and duration
function updateTimeDisplay() {
  if (!isNaN(audio.duration) && isFinite(audio.duration)) {
    durationSpan.innerText = formatTime(audio.duration);
  } else {
    durationSpan.innerText = "00:00";
  }
  currentTimeSpan.innerText = formatTime(audio.currentTime);
  // update seek slider without triggering input event loop
  if (!isNaN(audio.duration) && audio.duration > 0) {
    const percent = (audio.currentTime / audio.duration) * 100;
    seekSlider.value = percent;
  } else {
    seekSlider.value = 0;
  }
}

// volume & speed update bindings
function updateVolume() {
  const val = parseFloat(volumeSlider.value);
  audio.volume = val;
  volumePercentSpan.innerText = `${Math.round(val * 100)}%`;
  // if volume > 0 and muted we may unmute but consistent if muted button is on we keep muted property separate
  if (audio.muted && val > 0) {
   // do nothing user must explicitly unmute better UX than auto-unmuting on slider change
  }
}

function updateSpeed() {
  const spd = parseFloat(speedSlider.value);
  audio.playbackRate = spd;
  speedPercentSpan.innerText = `${spd.toFixed(2)}x`;
}

// Mute toggle logic 
let isMutedState = false;  // track muted state for button UI
function toggleMute() {
  if (audio.muted) {
    audio.muted = false;
    isMutedState = false;
    muteBtn.innerText = "Mute";
    // reflect slider visual the volume slider but keep consistent
  } else {
    audio.muted = true;
    isMutedState = true;
    muteBtn.innerText = "Unmute";
  }
}

function syncMuteButton() {
  if (audio.muted) {
    muteBtn.innerText = "Unmute";
    isMutedState = true;
  } else {
    muteBtn.innerText = "Mute";
    isMutedState = false;
  }
}

// Loop toggle feature
let loopActive = false;
function toggleLoop() {
  loopActive = !loopActive;
  audio.loop = loopActive;
  loopBtn.innerText = loopActive ? "Loop On" : "Loop Off";
}

// skip forward/backward
function skipSeconds(seconds) {
  let newTime = audio.currentTime + seconds;
  if (newTime < 0) newTime = 0;
  if (!isNaN(audio.duration) && newTime > audio.duration) newTime = audio.duration;
  audio.currentTime = newTime;
  updateTimeDisplay();
}

// seek slider interaction
function seekTo(percent) {
  if (!isNaN(audio.duration) && audio.duration > 0 && isFinite(audio.duration)) {
    const newTime = (percent / 100) * audio.duration;
    audio.currentTime = newTime;
    updateTimeDisplay();
  }
}
 
// a visualizer that reacts to audio signal when playing
function initAudioVisualizer() {
  if (audioContext && audioContext.state !== 'closed') return;
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 64;
    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // Connect audio element to the audio context
    mediaSourceNode = audioContext.createMediaElementSource(audio);
    mediaSourceNode.connect(analyserNode);
    analyserNode.connect(audioContext.destination);
    isAudioContextInitialized = true;

    // create visual bars
    const barCount = 24;
    visualBarsContainer.innerHTML = '';
    barElements = [];
    for (let i = 0; i < barCount; i++) {
      const bar = document.createElement('div');
      bar.classList.add('vis-bar');
      bar.style.height = '8px';
      visualBarsContainer.appendChild(bar);
      barElements.push(bar);
    }

    function drawVisuals() {
      if (!analyserNode || !audioContext || audioContext.state === 'closed') return;
      analyserNode.getByteFrequencyData(dataArray);
      const maxHeight = 46;
      for (let i = 0; i < barElements.length; i++) {
        let value = dataArray[i] || 0;
        // map to height (8px to 48px)
        let barHeight = 6 + (value / 255) * maxHeight;
        barElements[i].style.height = `${Math.max(6, Math.min(52, barHeight))}px`;
        // active if audio is playing 
        if (!audio.paused && value > 20) {
          barElements[i].classList.add('active');
        } else {
          barElements[i].classList.remove('active');
        }
      }
      animationFrameId = requestAnimationFrame(drawVisuals);
    }

    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    drawVisuals();

    // resume AudioContext if needed 
    if (audioContext.state === 'suspended') {
      document.body.addEventListener('click', resumeAudioContextOnce, { once: true });
    }
  } catch (err) {
    console.warn("Web Audio visualizer not supported or blocked:", err);
    // fallback: simple static bars
    visualBarsContainer.innerHTML = '<div style="color:#4f5b85; font-size:12px;">[visualizer inactive]</div>';
  }
}

function resumeAudioContextOnce() {
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

// start visualizer after first user interaction
function tryInitVisualizerOnInteraction() {
  if (!audioContext || audioContext.state === 'closed') {
    initAudioVisualizer();
  } else if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

// attach events for playback and ensure audio loads correctly
audio.addEventListener('loadedmetadata', () => {
  updateTimeDisplay();
  durationSpan.innerText = formatTime(audio.duration);
  seekSlider.max = 100;
});

audio.addEventListener('timeupdate', () => {
  updateTimeDisplay();
});

audio.addEventListener('ended', () => {
  updateTimeDisplay();
  if (!loopActive) {
    // reset to start visually but audio will be paused at end 
  }
});

audio.addEventListener('play', () => {
  // try to wake up visualizer
  if (!isAudioContextInitialized) {
    tryInitVisualizerOnInteraction();
  } else if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
});

// Button listeners
playBtn.addEventListener('click', () => {
  audio.play().catch(e => console.warn("play error:", e));
  tryInitVisualizerOnInteraction();
});
pauseBtn.addEventListener('click', () => {
  audio.pause();
});
muteBtn.addEventListener('click', () => {
  toggleMute();
});
loopBtn.addEventListener('click', () => {
  toggleLoop();
});

volumeSlider.addEventListener('input', () => {
  updateVolume();
  if (audio.muted && parseFloat(volumeSlider.value) > 0) {
    // unmute automatically if user moves volume up while muted
    audio.muted = false;
    syncMuteButton();
  }
  updateVolume();
});

speedSlider.addEventListener('input', () => {
  updateSpeed();
});

seekSlider.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  seekTo(val);
});

// skip forward/backward using keyboard
window.addEventListener('keydown', (e) => {
  //  no inputs all sliders handled separately.
  const activeTag = document.activeElement.tagName;
  if (activeTag === 'INPUT' || activeTag === 'BUTTON') {
    
  }
  switch(e.code) {
    case 'Space':
      e.preventDefault();
      if (audio.paused) {
        audio.play().catch(e => console.log);
        tryInitVisualizerOnInteraction();
      } else {
        audio.pause();
      }
      break;
    case 'ArrowLeft':
      e.preventDefault();
      skipSeconds(-5);
      break;
    case 'ArrowRight':
      e.preventDefault();
      skipSeconds(5);
      break;
    case 'KeyM':
      e.preventDefault();
      toggleMute();
      break;
    default: break;
  }
});

// initial sync
updateVolume();
updateSpeed();
syncMuteButton();
loopBtn.innerText = "Loop Off";
audio.loop = false;

// file input handler
audioFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    if (currentFileUrl) {
      URL.revokeObjectURL(currentFileUrl);
    }
    currentFileUrl = URL.createObjectURL(file);
    audio.src = currentFileUrl;
    fileStatus.innerText = file.name;
    updateFileControls(true);
    audio.load();
    updateTimeDisplay();
  }
});

removeFileBtn.addEventListener('click', () => {
  audio.pause();
  if (currentFileUrl) {
    URL.revokeObjectURL(currentFileUrl);
    currentFileUrl = null;
  }
  audio.src = '';
  audioFileInput.value = '';
  currentTimeSpan.innerText = '00:00';
  durationSpan.innerText = '00:00';
  seekSlider.value = 0;
  updateFileControls(false);
});

updateFileControls(false);

// preload audio metadata without autoplay
audio.load();

// init visualizer after first click on console to comply with autoplay policies for chrome and other browsers
const consoleDiv = document.querySelector('.audio-console');
const initVisualAndAudio = () => {
  tryInitVisualizerOnInteraction();
  //  ensuring audio context resumed
  consoleDiv.removeEventListener('click', initVisualAndAudio);
};
consoleDiv.addEventListener('click', initVisualAndAudio);

// if audio duration unknown wait for metadata
audio.addEventListener('canplaythrough', () => {
  updateTimeDisplay();
});

// handle errors loading external file
audio.addEventListener('error', (err) => {
  console.warn("audio loading error, but we assume file works");
  durationSpan.innerText = "??:??";
});

// additional styling for visual bar container if no web audio
setTimeout(() => {
  if (!audioContext && visualBarsContainer.children.length === 0) {
    visualBarsContainer.innerHTML = '<div style="color:#a3b0da;">wave visual ready</div>';
  }
}, 500);