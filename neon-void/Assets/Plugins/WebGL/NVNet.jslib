// Browser-native WebRTC data channel for Zeal Survivors v2 co-op.
// Unity polls: outgoing signaling (NVNetPollSignal), received game
// messages (NVNetPoll). Returned strings are malloc'd — C# frees them
// via NVNetFree after marshalling.
mergeInto(LibraryManager.library, {

  NVNetInit: function (isHost) {
    var n = window.__nvnet = { sig: [], recv: [], pendingIce: [], chan: null, pc: null, state: 0 };
    var pc = n.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    pc.onicecandidate = function (e) {
      if (e.candidate) n.sig.push(JSON.stringify({ t: 'ice', d: JSON.stringify(e.candidate) }));
    };
    pc.onconnectionstatechange = function () {
      var s = pc.connectionState;
      if (s === 'failed' || s === 'disconnected' || s === 'closed') n.state = 2;
    };
    var hook = function (ch) {
      n.chan = ch;
      ch.onopen = function () { n.state = 1; };
      ch.onclose = function () { n.state = 2; };
      ch.onmessage = function (e) { n.recv.push(e.data); };
    };
    if (isHost) {
      hook(pc.createDataChannel('game'));
      pc.createOffer()
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
        n.pc.setRemoteDescription(desc).then(function () {
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

  NVNetClose: function () {
    var n = window.__nvnet;
    if (n) {
      try { if (n.chan) n.chan.close(); } catch (e) {}
      try { if (n.pc) n.pc.close(); } catch (e) {}
      n.state = 2;
      window.__nvnet = null;
    }
  },

  NVNetFree: function (ptr) { _free(ptr); }
});
