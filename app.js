(() => {
  'use strict';

  // ── State ──────────────────────────────────────────────────────
  const state = {
    port: null,
    reader: null,
    writer: null,
    readableStreamClosed: null,
    writableStreamClosed: null,
    connected: false,
    connecting: false,
    paused: false,
    lines: [],
    lineIndex: 0,
    totalBytes: 0,
    autoScroll: true,
    reconnectTimer: null,
    reconnectAttempts: 0,
    MAX_RECONNECT: 3,
    RECONNECT_DELAY: 3000,
    MAX_LINES: 5000,
    // Port registry — maps index string → SerialPort object
    portRegistry: [],
  };

  // ── DOM ────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const el = {
    portSelect:        $('portSelect'),
    baudSelect:        $('baudSelect'),
    reloadBtn:         $('reloadBtn'),
    connectBtn:        $('connectBtn'),
    connectLabel:      $('connectLabel'),
    pauseBtn:          $('pauseBtn'),
    clearBtn:          $('clearBtn'),
    copyBtn:           $('copyBtn'),
    saveBtn:           $('saveBtn'),
    statusDot:         $('statusDot'),
    statusText:        $('statusText'),
    lineCount:         $('lineCount'),
    dtrIndicator:      $('dtrIndicator'),
    byteCount:         $('byteCount'),
    terminalInner:     $('terminalInner'),
    terminalContent:   $('terminalContent'),
    sendInput:         $('sendInput'),
    sendBtn:           $('sendBtn'),
    lineEndingSelect:  $('lineEndingSelect'),
    infoBtn:           $('infoBtn'),
    infoOverlay:       $('infoOverlay'),
    infoClose:         $('infoClose'),
    toast:             $('toast'),
  };

  // ── Init ───────────────────────────────────────────────────────
  function init() {
    if (!('serial' in navigator)) {
      appendLog('⚠ Web Serial API not supported. Use Chrome/Edge 89+.', 'err');
      showEmptyHint();
      disableUI(true);
      return;
    }
    showEmptyHint();
    loadTheme();
    loadPorts();

    el.reloadBtn.addEventListener('click', loadPorts);
    el.connectBtn.addEventListener('click', toggleConnect);
    el.pauseBtn.addEventListener('click', togglePause);
    el.clearBtn.addEventListener('click', clearTerminal);
    el.copyBtn.addEventListener('click', copyAll);
    el.saveBtn.addEventListener('click', saveLog);
    el.sendBtn.addEventListener('click', sendData);
    el.sendInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendData(); });
    el.terminalInner.addEventListener('scroll', onScroll);

    document.querySelectorAll('.theme-dot').forEach(dot => {
      dot.addEventListener('click', () => applyTheme(dot.dataset.theme));
    });

    el.infoBtn.addEventListener('click', () => el.infoOverlay.classList.remove('hidden'));
    el.infoClose.addEventListener('click', () => el.infoOverlay.classList.add('hidden'));
    el.infoOverlay.addEventListener('click', e => {
      if (e.target === el.infoOverlay) el.infoOverlay.classList.add('hidden');
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') el.infoOverlay.classList.add('hidden');
    });

    navigator.serial.addEventListener('connect', onSerialConnect);
    navigator.serial.addEventListener('disconnect', onSerialDisconnect);
  }

  // ── Theme ──────────────────────────────────────────────────────
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('serialTheme', theme);
    document.querySelectorAll('.theme-dot').forEach(d => {
      d.classList.toggle('active', d.dataset.theme === theme);
    });
  }
  function loadTheme() {
    applyTheme(localStorage.getItem('serialTheme') || 'green');
  }

  // ── Port management ────────────────────────────────────────────
  async function loadPorts(selectPort = null) {
    animateReload();
    try {
      const ports = await navigator.serial.getPorts();
      state.portRegistry = ports; // store reference array

      // Remember currently selected port object to restore selection
      const prevSelected = getSelectedPort();

      el.portSelect.innerHTML = '<option value="">-- Select Port --</option>';

      if (ports.length === 0) {
        const opt = new Option('No paired ports — click Connect to add', '');
        opt.disabled = true;
        el.portSelect.appendChild(opt);
      } else {
        ports.forEach((p, i) => {
          const info = p.getInfo();
          const vid = info.usbVendorId  ? `VID:${hex(info.usbVendorId)}`  : '';
          const pid = info.usbProductId ? `PID:${hex(info.usbProductId)}` : '';
          const detail = [vid, pid].filter(Boolean).join(' ');
          const label = detail ? `Port ${i + 1} (${detail})` : `Port ${i + 1}`;
          const opt = new Option(label, String(i));
          el.portSelect.appendChild(opt);
        });

        // Restore selection: prefer explicitly passed port, then active port, then previous selection
        const targetPort = selectPort || state.port || prevSelected;
        if (targetPort) {
          const idx = state.portRegistry.indexOf(targetPort);
          if (idx !== -1) el.portSelect.value = String(idx);
        }
      }
    } catch (e) {
      showToast('Failed to list ports');
    }
  }

  function hex(n) { return '0x' + n.toString(16).toUpperCase().padStart(4, '0'); }

  function animateReload() {
    const svg = el.reloadBtn.querySelector('svg');
    svg.style.transition = 'transform 0.5s';
    svg.style.transform = 'rotate(360deg)';
    setTimeout(() => { svg.style.transform = 'rotate(0deg)'; }, 500);
  }

  async function requestPort() {
    try {
      return await navigator.serial.requestPort();
    } catch {
      return null;
    }
  }

  /** Returns the SerialPort object for the currently selected dropdown option, or null. */
  function getSelectedPort() {
    const idx = parseInt(el.portSelect.value, 10);
    if (isNaN(idx)) return null;
    return state.portRegistry[idx] ?? null;
  }

  // ── Connect / Disconnect ───────────────────────────────────────
  async function toggleConnect() {
    if (state.connecting) return;
    if (state.connected) {
      await disconnect(false);
    } else {
      await connect();
    }
  }

  async function connect() {
    if (state.connecting || state.connected) return;
    state.connecting = true;
    setStatus('connecting');

    let port = getSelectedPort();
    if (!port) {
      // Ask user to pick/pair a new port
      port = await requestPort();
      if (!port) {
        state.connecting = false;
        setStatus('disconnected');
        return;
      }
      // Reload list and auto-select the newly paired port
      await loadPorts(port);
    }

    const baud = parseInt(el.baudSelect.value, 10);
    try {
      // Guard: port may already be open (e.g. rapid reconnect)
      if (!port.readable) {
        await port.open({ baudRate: baud, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
      }

      // DTR ON
      try { await port.setSignals({ dataTerminalReady: true, requestToSend: false }); } catch {}

      state.port = port;
      state.connected = true;
      state.connecting = false;
      state.reconnectAttempts = 0;

      setStatus('connected');
      updateDTR(true);
      appendLog(`Connected @ ${baud} baud`, 'sys');
      removeEmptyHint();
      startReading();
    } catch (e) {
      state.connecting = false;
      state.port = null;
      setStatus('error');
      appendLog(`Connection failed: ${e.message}`, 'err');
      scheduleReconnect();
    }
  }

  async function disconnect(tryReconnect = false) {
    clearReconnectTimer();
    state.connected = false;
    state.connecting = false;

    try { if (state.reader) { await state.reader.cancel(); state.reader = null; } } catch {}
    try { if (state.writer) { await state.writer.close(); state.writer = null; } } catch {}
    try { if (state.port)   { await state.port.close(); } } catch {}

    state.port = null;
    updateDTR(false);
    setStatus('disconnected');

    if (!tryReconnect) appendLog('Disconnected', 'sys');
    if (tryReconnect)  scheduleReconnect();
  }

  function scheduleReconnect() {
    if (state.reconnectAttempts >= state.MAX_RECONNECT) {
      appendLog('Max reconnect attempts reached.', 'err');
      return;
    }
    state.reconnectAttempts++;
    appendLog(`Reconnecting in ${state.RECONNECT_DELAY / 1000}s… (${state.reconnectAttempts}/${state.MAX_RECONNECT})`, 'sys');
    state.reconnectTimer = setTimeout(async () => {
      if (!state.connected) await connect();
    }, state.RECONNECT_DELAY);
  }

  function clearReconnectTimer() {
    if (state.reconnectTimer) { clearTimeout(state.reconnectTimer); state.reconnectTimer = null; }
  }

  // ── Serial events ──────────────────────────────────────────────
  function onSerialConnect(e) {
    appendLog('Serial device plugged in.', 'sys');
    loadPorts();
  }
  function onSerialDisconnect(e) {
    if (state.connected && state.port === e.target) {
      appendLog('Device disconnected!', 'err');
      disconnect(true);
    }
    // Refresh list; active port will be gone so selection resets gracefully
    loadPorts();
  }

  // ── Reading ────────────────────────────────────────────────────
  async function startReading() {
    if (!state.port || !state.port.readable) return;
    const decoder = new TextDecoderStream();
    state.port.readable.pipeTo(decoder.writable).catch(() => {});
    const reader = decoder.readable.getReader();
    state.reader = reader;

    let buffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!state.connected) break;

        state.totalBytes += new Blob([value]).size;
        updateByteCount();

        buffer += value;
        const parts = buffer.split('\n');
        buffer = parts.pop();
        for (const part of parts) {
          const clean = part.replace(/\r$/, '');
          if (clean !== '') appendLog(clean, 'data');
        }
      }
    } catch (e) {
      if (state.connected) {
        appendLog(`Read error: ${e.message}`, 'err');
        await disconnect(true);
      }
    } finally {
      try { reader.releaseLock(); } catch {}
    }

    if (buffer.trim()) appendLog(buffer.trim(), 'data');
  }

  // ── Sending ────────────────────────────────────────────────────
  async function sendData() {
    if (!state.connected || !state.port) { showToast('Not connected'); return; }
    const text = el.sendInput.value;
    if (!text) return;
    const ending = el.lineEndingSelect.value.replace('\\n', '\n').replace('\\r', '\r');
    try {
      const encoder = new TextEncoderStream();
      encoder.readable.pipeTo(state.port.writable).catch(() => {});
      const writer = encoder.writable.getWriter();
      await writer.write(text + ending);
      await writer.close();
      appendLog('> ' + text, 'sent');
      el.sendInput.value = '';
    } catch (e) {
      appendLog(`Send error: ${e.message}`, 'err');
    }
  }

  // ── Terminal output ────────────────────────────────────────────
  function appendLog(text, type = 'data') {
    const now = new Date();
    const ts = now.toTimeString().slice(0, 8) + '.' +
               String(now.getMilliseconds()).padStart(3, '0');

    state.lines.push({ text, type, ts, idx: ++state.lineIndex });

    if (state.lines.length > state.MAX_LINES) {
      state.lines.shift();
      const first = el.terminalContent.firstChild;
      if (first) el.terminalContent.removeChild(first);
    }

    const line = createLineEl(text, type, ts, state.lineIndex);
    el.terminalContent.appendChild(line);
    updateLineCount();
    if (!state.paused) scrollToBottom();
  }

  function createLineEl(text, type, ts, idx) {
    const div = document.createElement('div');
    div.className = `log-line ${type}`;

    const timeEl = document.createElement('span');
    timeEl.className = 'log-time';
    timeEl.textContent = ts;

    const idxEl = document.createElement('span');
    idxEl.className = 'log-index';
    idxEl.textContent = `#${idx}`;

    const textEl = document.createElement('span');
    textEl.className = 'log-text';
    textEl.textContent = text;

    div.appendChild(timeEl);
    div.appendChild(idxEl);
    div.appendChild(textEl);
    return div;
  }

  function clearTerminal() {
    el.terminalContent.innerHTML = '';
    state.lines = [];
    state.lineIndex = 0;
    state.totalBytes = 0;
    updateLineCount();
    updateByteCount();
    showEmptyHint();
    showToast('Terminal cleared');
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      el.terminalInner.scrollTop = el.terminalInner.scrollHeight;
    });
  }

  function onScroll() {
    const el2 = el.terminalInner;
    const atBottom = el2.scrollHeight - el2.scrollTop - el2.clientHeight < 40;
    state.autoScroll = atBottom;
    if (atBottom && state.paused) {
      // don't auto-unpause on scroll bottom; user controls pause
    }
  }

  // ── Pause ──────────────────────────────────────────────────────
  function togglePause() {
    state.paused = !state.paused;
    el.pauseBtn.classList.toggle('paused', state.paused);
    el.pauseBtn.title = state.paused ? 'Resume scroll' : 'Pause scroll';
    const svg = el.pauseBtn.querySelector('svg');
    if (state.paused) {
      svg.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
      el.pauseBtn.querySelector('span').textContent = 'Resume';
    } else {
      svg.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
      el.pauseBtn.querySelector('span').textContent = 'Pause';
      scrollToBottom();
    }
    showToast(state.paused ? 'Paused' : 'Resumed');
  }

  // ── Copy / Save ────────────────────────────────────────────────
  function copyAll() {
    const text = state.lines.map(l => `[${l.ts}] ${l.text}`).join('\n');
    navigator.clipboard.writeText(text).then(() => showToast('Copied!'));
  }

  function saveLog() {
    const text = state.lines.map(l => `[${l.ts}] ${l.text}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `serial_log_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Log saved');
  }

  // ── Status helpers ─────────────────────────────────────────────
  function setStatus(s) {
    el.statusDot.className = `status-dot ${s}`;
    el.connectBtn.classList.toggle('connected',  s === 'connected');
    el.connectBtn.classList.toggle('connecting', s === 'connecting');
    el.connectLabel.textContent =
      s === 'connected'  ? 'Disconnect' :
      s === 'connecting' ? 'Connecting…' : 'Connect';
    el.statusText.textContent =
      s === 'connected'  ? `Connected @ ${el.baudSelect.value} baud` :
      s === 'connecting' ? 'Connecting…' :
      s === 'error'      ? 'Error' : 'Disconnected';
    el.sendInput.disabled = s !== 'connected';
    el.sendBtn.disabled   = s !== 'connected';
  }

  function updateDTR(on) {
    el.dtrIndicator.textContent = `DTR: ${on ? 'ON' : 'OFF'}`;
    el.dtrIndicator.classList.toggle('active', on);
  }

  function updateLineCount() { el.lineCount.textContent = `${state.lines.length} lines`; }

  function updateByteCount() {
    const b = state.totalBytes;
    el.byteCount.textContent = b < 1024 ? `${b} B` :
      b < 1048576 ? `${(b/1024).toFixed(1)} KB` : `${(b/1048576).toFixed(2)} MB`;
  }

  function disableUI(all) {
    if (all) {
      el.connectBtn.disabled = true; el.reloadBtn.disabled = true;
      el.sendBtn.disabled = true;    el.sendInput.disabled = true;
    }
  }

  // ── Empty hint ─────────────────────────────────────────────────
  function showEmptyHint() {
    if (el.terminalContent.querySelector('.empty-hint')) return;
    if (state.lines.length > 0) return;
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.innerHTML = '<div class="icon">📡</div><div>Select a port and click <b>Connect</b></div>';
    el.terminalContent.appendChild(hint);
  }

  function removeEmptyHint() {
    const h = el.terminalContent.querySelector('.empty-hint');
    if (h) h.remove();
  }

  // ── Toast ──────────────────────────────────────────────────────
  let toastTimer;
  function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2000);
  }

  // ── Start ──────────────────────────────────────────────────────
  init();
})();
