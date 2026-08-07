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
}
