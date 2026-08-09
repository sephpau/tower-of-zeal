using System.Runtime.InteropServices;
using UnityEngine;

// The voice of the void: wave and boss callouts through the browser's
// speech engine. Follows the SFX volume slider; silent in the editor.
public static class Announcer
{
#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")] static extern void NVSay(string text, float pitch, float rate, float volume);
#else
    static void NVSay(string text, float pitch, float rate, float volume) { }
#endif

    public static void Say(string line, float pitch = 0.6f, float rate = 1.02f)
    {
        float vol = GameSettings.SfxVolume;
        if (vol <= 0.01f || string.IsNullOrEmpty(line)) return;
        NVSay(line, pitch, rate, Mathf.Clamp01(vol));
    }
}
