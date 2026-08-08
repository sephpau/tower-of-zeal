using UnityEngine;

// Player-facing options, persisted in PlayerPrefs.
public static class GameSettings
{
    const string HitWarnKey = "zsv2-hitwarning";

    // full-screen red border flash when enemy fire will hit within ~1s (off by default)
    public static bool HitWarning
    {
        get => PlayerPrefs.GetInt(HitWarnKey, 0) == 1;
        set { PlayerPrefs.SetInt(HitWarnKey, value ? 1 : 0); PlayerPrefs.Save(); }
    }

    public static float MusicVolume
    {
        get => PlayerPrefs.GetFloat("zsv2-musicvol", 0.7f);
        set { PlayerPrefs.SetFloat("zsv2-musicvol", Mathf.Clamp01(value)); PlayerPrefs.Save(); }
    }

    public static float SfxVolume
    {
        get => PlayerPrefs.GetFloat("zsv2-sfxvol", 1f);
        set { PlayerPrefs.SetFloat("zsv2-sfxvol", Mathf.Clamp01(value)); PlayerPrefs.Save(); }
    }

    // mouse look speed multiplier (1 = the classic feel)
    public static float MouseSensitivity
    {
        get => PlayerPrefs.GetFloat("zsv2-mousesens", 1f);
        set { PlayerPrefs.SetFloat("zsv2-mousesens", Mathf.Clamp(value, 0.2f, 3f)); PlayerPrefs.Save(); }
    }

    // co-op partner voice loudness
    public static float VoiceVolume
    {
        get => PlayerPrefs.GetFloat("zsv2-voicevol", 1f);
        set { PlayerPrefs.SetFloat("zsv2-voicevol", Mathf.Clamp01(value)); PlayerPrefs.Save(); }
    }
}
