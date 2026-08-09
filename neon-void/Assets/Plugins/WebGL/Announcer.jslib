// Browser-native announcer (Web Speech API): dramatic wave/boss callouts
// at zero download cost. A new announcement cancels the previous one.
mergeInto(LibraryManager.library, {
  NVSay: function (textPtr, pitch, rate, volume) {
    try {
      if (!window.speechSynthesis) return;
      var u = new SpeechSynthesisUtterance(UTF8ToString(textPtr));
      u.pitch = pitch;
      u.rate = rate;
      u.volume = volume;
      if (window.__nvVoice === undefined) {
        window.__nvVoice = null;
        var pick = function () {
          var vs = window.speechSynthesis.getVoices();
          for (var i = 0; i < vs.length; i++) {
            var n = vs[i].name.toLowerCase();
            if (vs[i].lang.indexOf('en') === 0 &&
                (n.indexOf('david') >= 0 || n.indexOf('daniel') >= 0 || n.indexOf('male') >= 0)) {
              window.__nvVoice = vs[i];
              return;
            }
          }
          for (var j = 0; j < vs.length; j++) {
            if (vs[j].lang.indexOf('en') === 0) { window.__nvVoice = vs[j]; return; }
          }
        };
        pick();
        if (!window.__nvVoice) window.speechSynthesis.addEventListener('voiceschanged', pick, { once: true });
      }
      if (window.__nvVoice) u.voice = window.__nvVoice;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }
});
