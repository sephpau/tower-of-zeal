// Multi-peer WebRTC star for Zeal Survivors v2 (co-op, duels, battle royale).
// The host holds one RTCPeerConnection per joiner and relays game state;
// joiners hold exactly one connection (to "host"). Strings returned to C#
// are malloc'd and freed via NVNetFree. Envelope format over the poll
// functions: "<peerId>\u0001<payload>".
// Voice: every connection carries the local mic (denied mic = silent);
// audio is hub-and-spoke — peers hear the host, the host hears everyone.
mergeInto(LibraryManager.library, {

  NVNetInit: function (isHost, wantMic) {
    var n = window.__nvnet = {
      isHost: !!isHost, peers: {}, sig: [], recv: [],
      mic: null, voiceEls: {}, state: isHost ? 1 : 0
    };
    n.micReady = (wantMic ? navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    }) : Promise.resolve(null)).then(function (stream) {
      n.mic = stream;
      return null;
    }).catch(function () { return null; });
  },

  NVNetConnect: function () {   // joiner only: dial the host
    var n = window.__nvnet;
    if (!n || n.isHost || n.peers['host']) return;
    var makePeer = function (id) {
      var p = { pc: new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }), chan: null, open: false, pendingIce: [] };
      n.peers[id] = p;
      p.pc.onicecandidate = function (e) {
        if (e.candidate) n.sig.push(id + '\u0001' + JSON.stringify({ t: 'ice', d: JSON.stringify(e.candidate) }));
      };
      p.pc.onconnectionstatechange = function () {
        var s = p.pc.connectionState;
        if (s === 'failed' || s === 'disconnected' || s === 'closed') { p.open = false; if (!n.isHost) n.state = 2; }
      };
      p.pc.ontrack = function (e) {
        var el = document.createElement('audio');
        el.autoplay = true;
        el.srcObject = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]);
        el.volume = (typeof window.__nvVoiceVol === 'number') ? window.__nvVoiceVol : 1;
        document.body.appendChild(el);
        n.voiceEls[id] = el;
        var pr = el.play();
        if (pr && pr.catch) pr.catch(function () {
          var once = function () { el.play(); document.removeEventListener('click', once); };
          document.addEventListener('click', once);
        });
      };
      return p;
    };
    window.__nvMakePeer = window.__nvMakePeer || makePeer;
    var p = makePeer('host');
    var hook = function (ch) {
      p.chan = ch;
      ch.onopen = function () { p.open = true; if (!n.isHost) n.state = 1; };
      ch.onclose = function () { p.open = false; if (!n.isHost) n.state = 2; };
      ch.onmessage = function (e) { n.recv.push('host\u0001' + e.data); };
    };
    hook(p.pc.createDataChannel('game'));
    n.micReady.then(function () {
      if (n.mic) n.mic.getTracks().forEach(function (t) { p.pc.addTrack(t, n.mic); });
      return p.pc.createOffer();
    }).then(function (o) { return p.pc.setLocalDescription(o); }).then(function () {
      n.sig.push('host\u0001' + JSON.stringify({ t: 'sdp', d: JSON.stringify(p.pc.localDescription) }));
    }).catch(function (e) { console.warn('nvnet offer', e); });
  },

  NVNetSignal: function (fromPtr, msgPtr) {
    var n = window.__nvnet;
    if (!n) return;
    var from = UTF8ToString(fromPtr);
    try {
      var m = JSON.parse(UTF8ToString(msgPtr));
      var p = n.peers[from];
      if (!p && n.isHost) {
        // a new joiner is dialing in — build a connection for them
        p = { pc: new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }), chan: null, open: false, pendingIce: [] };
        n.peers[from] = p;
        p.pc.onicecandidate = function (e) {
          if (e.candidate) n.sig.push(from + '\u0001' + JSON.stringify({ t: 'ice', d: JSON.stringify(e.candidate) }));
        };
        p.pc.onconnectionstatechange = function () {
          var s = p.pc.connectionState;
          if (s === 'failed' || s === 'disconnected' || s === 'closed') p.open = false;
        };
        p.pc.ondatachannel = function (e) {
          p.chan = e.channel;
          p.chan.onopen = function () { p.open = true; };
          p.chan.onclose = function () { p.open = false; };
          p.chan.onmessage = function (ev) { n.recv.push(from + '\u0001' + ev.data); };
        };
        p.pc.ontrack = function (e) {
          var el = document.createElement('audio');
          el.autoplay = true;
          el.srcObject = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]);
          el.volume = (typeof window.__nvVoiceVol === 'number') ? window.__nvVoiceVol : 1;
          document.body.appendChild(el);
          n.voiceEls[from] = el;
          var pr = el.play();
          if (pr && pr.catch) pr.catch(function () {
            var once = function () { el.play(); document.removeEventListener('click', once); };
            document.addEventListener('click', once);
          });
        };
      }
      if (!p) return;
      if (m.t === 'sdp') {
        var desc = JSON.parse(m.d);
        n.micReady.then(function () {
          if (desc.type === 'offer' && n.mic)
            n.mic.getTracks().forEach(function (t) { try { p.pc.addTrack(t, n.mic); } catch (e) {} });
          return p.pc.setRemoteDescription(desc);
        }).then(function () {
          while (p.pendingIce.length) p.pc.addIceCandidate(p.pendingIce.shift()).catch(function () {});
          if (desc.type === 'offer') {
            p.pc.createAnswer()
              .then(function (a) { return p.pc.setLocalDescription(a); })
              .then(function () { n.sig.push(from + '\u0001' + JSON.stringify({ t: 'sdp', d: JSON.stringify(p.pc.localDescription) })); })
              .catch(function (e) { console.warn('nvnet answer', e); });
          }
        }).catch(function (e) { console.warn('nvnet sdp', e); });
      } else if (m.t === 'ice') {
        var cand = JSON.parse(m.d);
        if (p.pc.remoteDescription) p.pc.addIceCandidate(cand).catch(function () {});
        else p.pendingIce.push(cand);
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

  NVNetSend: function (toPtr, msgPtr) {
    var n = window.__nvnet;
    if (!n) return;
    var to = UTF8ToString(toPtr);
    var msg = UTF8ToString(msgPtr);
    if (to === '*') {
      for (var id in n.peers) {
        var p = n.peers[id];
        if (p.open && p.chan && p.chan.readyState === 'open') { try { p.chan.send(msg); } catch (e) {} }
      }
    } else {
      var q = n.peers[to];
      if (q && q.open && q.chan && q.chan.readyState === 'open') { try { q.chan.send(msg); } catch (e) {} }
    }
  },

  NVNetPeers: function () {
    var n = window.__nvnet;
    var ids = [];
    if (n) for (var id in n.peers) if (n.peers[id].open) ids.push(id);
    var s = ids.join(',');
    var len = lengthBytesUTF8(s) + 1;
    var buf = _malloc(len);
    stringToUTF8(s, buf, len);
    return buf;
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
    if (n) for (var id in n.voiceEls) n.voiceEls[id].volume = v;
  },

  NVNetClose: function () {
    var n = window.__nvnet;
    if (n) {
      for (var id in n.peers) {
        try { if (n.peers[id].chan) n.peers[id].chan.close(); } catch (e) {}
        try { n.peers[id].pc.close(); } catch (e) {}
      }
      try { if (n.mic) n.mic.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      for (var vid in n.voiceEls) { try { n.voiceEls[vid].remove(); } catch (e) {} }
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
              : -1;
      console.warn('nvmic', name, e);
    });
  },

  NVMicLevel: function () {
    var m = window.__nvmic;
    if (!m) return -2;
    if (!m.an) return m.level;
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
