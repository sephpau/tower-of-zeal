// Multi-peer WebRTC star + audio edges for Zeal Survivors v2.
// Data: host holds one connection per joiner and relays; joiners dial "host".
// Voice: every connection carries the local mic; extra AUDIO-ONLY edges can
// be dialed between any two peers (teammates, or everyone in open-comms FFA),
// and NVNetVoiceTo gates outgoing audio per link so enemies hear nothing.
// Envelope over the poll functions: "<peerId>\u0001<payload>".
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

    n.makePeer = function (id) {
      var p = { pc: new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }), chan: null, open: false, pendingIce: [], audioSender: null };
      n.peers[id] = p;
      p.pc.onicecandidate = function (e) {
        if (e.candidate) n.sig.push(id + '\u0001' + JSON.stringify({ t: 'ice', d: JSON.stringify(e.candidate) }));
      };
      p.pc.onconnectionstatechange = function () {
        var s = p.pc.connectionState;
        if (s === 'failed' || s === 'disconnected' || s === 'closed') {
          p.open = false;
          if (!n.isHost && id === 'host') n.state = 2;
        }
      };
      p.pc.ondatachannel = function (e) {
        p.chan = e.channel;
        p.chan.onopen = function () { p.open = true; };
        p.chan.onclose = function () { p.open = false; };
        p.chan.onmessage = function (ev) { n.recv.push(id + '\u0001' + ev.data); };
      };
      p.pc.ontrack = function (e) {
        var el = document.createElement('audio');
        el.autoplay = true;
        el.srcObject = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]);
        el.volume = (typeof window.__nvVoiceVol === 'number') ? window.__nvVoiceVol : 1;
        document.body.appendChild(el);
        if (n.voiceEls[id]) { try { n.voiceEls[id].remove(); } catch (err) {} }
        n.voiceEls[id] = el;
        var pr = el.play();
        if (pr && pr.catch) pr.catch(function () {
          var once = function () { el.play(); document.removeEventListener('click', once); };
          document.addEventListener('click', once);
        });
      };
      p.addMic = function () {
        if (n.mic && !p.audioSender) {
          var t = n.mic.getAudioTracks()[0];
          if (t) p.audioSender = p.pc.addTrack(t, n.mic);
        }
      };
      p.dialOffer = function () {
        n.micReady.then(function () {
          p.addMic();
          return p.pc.createOffer();
        }).then(function (o) { return p.pc.setLocalDescription(o); }).then(function () {
          n.sig.push(id + '\u0001' + JSON.stringify({ t: 'sdp', d: JSON.stringify(p.pc.localDescription) }));
        }).catch(function (e) { console.warn('nvnet offer', e); });
      };
      return p;
    };
  },

  NVNetConnect: function () {   // joiner: dial the host with a data channel
    var n = window.__nvnet;
    if (!n || n.isHost || n.peers['host']) return;
    var p = n.makePeer('host');
    p.chan = p.pc.createDataChannel('game');
    p.chan.onopen = function () { p.open = true; if (!n.isHost) n.state = 1; };
    p.chan.onclose = function () { p.open = false; if (!n.isHost) n.state = 2; };
    p.chan.onmessage = function (e) { n.recv.push('host\u0001' + e.data); };
    p.dialOffer();
  },

  NVNetDial: function (idPtr) {   // audio-only edge to another peer
    var n = window.__nvnet;
    if (!n) return;
    var id = UTF8ToString(idPtr);
    if (n.peers[id]) return;   // already linked — gate with NVNetVoiceTo instead
    n.makePeer(id).dialOffer();
  },

  NVNetSignal: function (fromPtr, msgPtr) {
    var n = window.__nvnet;
    if (!n) return;
    var from = UTF8ToString(fromPtr);
    try {
      var m = JSON.parse(UTF8ToString(msgPtr));
      var p = n.peers[from] || n.makePeer(from);   // unknown dialer: data joiner (host) or audio edge (anyone)
      if (m.t === 'sdp') {
        var desc = JSON.parse(m.d);
        n.micReady.then(function () {
          if (desc.type === 'offer') p.addMic();
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

  NVNetPeers: function () {   // only DATA peers (audio edges stay invisible)
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

  NVNetVoiceTo: function (idPtr, on) {   // gate MY outgoing audio on one link
    var n = window.__nvnet;
    if (!n) return;
    var p = n.peers[UTF8ToString(idPtr)];
    if (p && p.audioSender) {
      var t = (on && n.mic) ? n.mic.getAudioTracks()[0] : null;
      try { p.audioSender.replaceTrack(t || null); } catch (e) {}
    }
  },

  NVNetKick: function (idPtr) {
    var n = window.__nvnet;
    if (!n) return;
    var id = UTF8ToString(idPtr);
    var p = n.peers[id];
    if (p) {
      try { if (p.chan) p.chan.close(); } catch (e) {}
      try { p.pc.close(); } catch (e) {}
      delete n.peers[id];
    }
    if (n.voiceEls[id]) { try { n.voiceEls[id].remove(); } catch (e) {} delete n.voiceEls[id]; }
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

  // ---- settings mic test ----
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
