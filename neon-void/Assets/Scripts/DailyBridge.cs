using System.Runtime.InteropServices;
using UnityEngine;

// Daily on-chain check-in reward (Ronin tx via the classic meta layer).
// Start() kicks off the wallet flow in the page; Poll() reads its progress.
public static class DailyBridge
{
#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")] static extern void NVMetaJsDailyStart();
    [DllImport("__Internal")] static extern string NVMetaJsDailyStatus();
#else
    static void NVMetaJsDailyStart() { }
    static string NVMetaJsDailyStatus() => "";
#endif

    [System.Serializable]
    public class Status
    {
        public bool busy, ok, claimed;
        public string status, reason;
        public int gold, xp, streak;
    }

    public static void Start() => NVMetaJsDailyStart();

    public static Status Poll()
    {
        string s = NVMetaJsDailyStatus();
        if (string.IsNullOrEmpty(s)) return null;
        try { return JsonUtility.FromJson<Status>(s); } catch { return null; }
    }
}
