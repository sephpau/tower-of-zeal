// Browser-native WebRTC for Zeal Survivors v2 co-op: one data channel for
// game state plus a live microphone track for voice chat. Unity polls:
// outgoing signaling (NVNetPollSignal), received game messages (NVNetPoll).
// Returned strings are malloc'd — C# frees them via NVNetFree.
// The mic is requested BEFORE the offer/answer is produced so audio rides
// the single negotiation; a denied mic just means a silent (data-only) link.
mergeInto(LibraryManager.library, {

  NVNetInit: function (isHost, wantMic) {
    var n = window.__nvnet = { sig: [], recv: [], pendingIce: [], chan: null, pc: null, state: 0, voiceEl: null, mic: null };
    var pc = n.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    pc.onicecandidate = function (e) {
      if (e.candidate) n.sig.push(JSON.stringify({ t: 'ice', d: JSON.stringify(e.candidate) }));
    };
    pc.onconnectionstatechange = function () {
      var s = pc.connectionState;
      if (s === 'failed' || s === 'disconnected' || s === 'closed') n.state = 2;
    };
    pc.ontrack = function (e) {
      var el = document.createElement('audio');
      el.autoplay = true;
      el.srcObject = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]);
      el.volume = (typeof window.__nvVoiceVol === 'number') ? window.__nvVoiceVol : 1;
      document.body.appendChild(el);
      n.voiceEl = el;
      var p = el.play();
      if (p && p.catch) p.catch(function () {
        var once = function () { el.play(); document.removeEventListener('click', once); };
        document.addEventListener('click', once);
      });
    };
    var hook = function (ch) {
      n.chan = ch;
      ch.onopen = function () { n.state = 1; };
      ch.onclose = function () { n.state = 2; };
      ch.onmessage = function (e) { n.recv.push(e.data); };
    };
    // grab the mic first so the audio track is part of the one offer/answer
    n.micReady = (wantMic ? navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    }) : Promise.resolve(null)).then(function (stream) {
      if (stream) {
        n.mic = stream;
        stream.getTracks().forEach(function (t) { pc.addTrack(t, stream); });
      }
      return null;
    }).catch(function () { return null; });

    if (isHost) {
      hook(pc.createDataChannel('game'));
      n.micReady
        .then(function () { return pc.createOffer(); })
        .then(function (o) { return pc.setLocalDescription(o); })
        .then(function () { n.sig.push(JSON.stringify({ t: 'sdp', d: JSON.stringify(pc.localDescription) })); })
        .catch(function (e) { console.warn('nvnet offer', e); });
    } else {
      pc.ondatachannel = function (e) { hook(e.channel); };
    }
  },

  NVNetSignal: function (ptr) {
    var n = window.__nvnet;
    if (!n || !n.pc) return;
    try {
      var m = JSON.parse(UTF8ToString(ptr));
      if (m.t === 'sdp') {
        var desc = JSON.parse(m.d);
        // the guest must have its mic track added before answering
        n.micReady.then(function () {
          return n.pc.setRemoteDescription(desc);
        }).then(function () {
          while (n.pendingIce.length) n.pc.addIceCandidate(n.pendingIce.shift()).catch(function () {});
          if (desc.type === 'offer') {
            n.pc.createAnswer()
              .then(function (a) { return n.pc.setLocalDescription(a); })
              .then(function () { n.sig.push(JSON.stringify({ t: 'sdp', d: JSON.stringify(n.pc.localDescription) })); })
              .catch(function (e) { console.warn('nvnet answer', e); });
          }
        }).catch(function (e) { console.warn('nvnet sdp', e); });
      } else if (m.t === 'ice') {
        var cand = JSON.parse(m.d);
        if (n.pc.remoteDescription) n.pc.addIceCandidate(cand).catch(function () {});
        else n.pendingIce.push(cand);
      }
    } catch (e) { console.warn('nvnet signal', e); }
  },

  NVNetPollSignal: function () {
    var n = window.__nvnet;
    if (!n || n.sig.length === 0) return 0;
    var s = n.sig.shift();
    var len = lengthBytesUTF8(s) + 1;
    var buf = _malloc(len);
    stringToUTF8(s, buf, len);
    return buf;
  },

  NVNetPoll: function () {
    var n = window.__nvnet;
    if (!n || n.recv.length === 0) return 0;
    var s = n.recv.shift();
    var len = lengthBytesUTF8(s) + 1;
    var buf = _malloc(len);
    stringToUTF8(s, buf, len);
    return buf;
  },

  NVNetSend: function (ptr) {
    var n = window.__nvnet;
    if (n && n.chan && n.chan.readyState === 'open') {
      try { n.chan.send(UTF8ToString(ptr)); } catch (e) {}
    }
  },

  NVNetState: function () {
    var n = window.__nvnet;
    return n ? n.state : 0;
  },

  NVNetMicOn: function (on) {
    var n = window.__nvnet;
    if (n && n.mic) n.mic.getTracks().forEach(function (t) { t.enabled = !!on; });
  },

  NVNetVoiceVolume: function (v) {
    window.__nvVoiceVol = v;
    var n = window.__nvnet;
    if (n && n.voiceEl) n.voiceEl.volume = v;
  },

  NVNetClose: function () {
    var n = window.__nvnet;
    if (n) {
      try { if (n.chan) n.chan.close(); } catch (e) {}
      try { if (n.pc) n.pc.close(); } catch (e) {}
      try { if (n.mic) n.mic.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      try { if (n.voiceEl) n.voiceEl.remove(); } catch (e) {}
      n.state = 2;
      window.__nvnet = null;
    }
  },

  NVNetFree: function (ptr) { _free(ptr); },

  // ---- settings mic test: level meter without any connection ----
  NVMicStart: function () {
    var m = window.__nvmic = { level: -2 };
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      m.stream = stream;
      var Ctx = window.AudioContext || window.webkitAudioContext;
      m.ctx = new Ctx();
      var src = m.ctx.createMediaStreamSource(stream);
      m.an = m.ctx.createAnalyser();
      m.an.fftSize = 512;
      src.connect(m.an);
      m.buf = new Uint8Array(m.an.fftSize);
      m.level = 0;
    }).catch(function (e) {
      var name = e && e.name ? e.name : '';
      m.level = (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') ? -3
              : (name === 'NotReadableError' || name === 'TrackStartError') ? -4
              : -1;   // NotAllowedError and everything else: blocked by browser or OS
      console.warn('nvmic', name, e);
    });
  },

  NVMicLevel: function () {
    var m = window.__nvmic;
    if (!m) return -2;
    if (!m.an) return m.level;   // -2 pending permission, -1 blocked
    m.an.getByteTimeDomainData(m.buf);
    var sum = 0;
    for (var i = 0; i < m.buf.length; i++) {
      var d = (m.buf[i] - 128) / 128;
      sum += d * d;
    }
    var rms = Math.sqrt(sum / m.buf.length);
    return Math.min(100, Math.round(rms * 300));
  },

  NVMicStop: function () {
    var m = window.__nvmic;
    if (m) {
      try { if (m.stream) m.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      try { if (m.ctx) m.ctx.close(); } catch (e) {}
      window.__nvmic = null;
    }
  }
});
