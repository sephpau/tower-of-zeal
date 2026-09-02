using System.Collections.Generic;
using UnityEngine;

// Imported music + SFX (Assets/Resources/*.mp3). A missing file resolves to
// null so every caller can fall back to the procedural SfxSynth versions.
public static class GameAudio
{
    static readonly Dictionary<string, AudioClip> _cache = new Dictionary<string, AudioClip>();

    public static AudioClip Clip(string name)
    {
        if (!_cache.TryGetValue(name, out var c))
        {
            c = Resources.Load<AudioClip>(name);
            _cache[name] = c;   // null cached too — missing files stay cheap
        }
        return c;
    }

    // pulse-wave shot for the current sigil level (files: lvl 1-2, 3-4, 5+)
    public static AudioClip PulseShot(int sigilLevel) =>
        Clip(sigilLevel >= 5 ? "1 lvl 5+ pulse wave"
           : sigilLevel >= 3 ? "1 lvl 3 4 pulse wave"
           : "1 lvl 1 2 pulse wave");
}
