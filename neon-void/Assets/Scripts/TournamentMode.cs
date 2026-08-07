using System.Collections.Generic;
using UnityEngine;

// Blitz tournament, ported from Zeal Survivors tournament.js:
// match-code-seeded 5-minute runs on a level playing field. Same match
// code → same pilot, same wave rolls, same level-up drafts for everyone.
// Results go to a local standings table per match code, plus a verify
// code the organizer can check (hash-compatible with the web version).
public static class TournamentMode
{
    public const float Duration = 360f;    // 6:00 blitz clock
    public const float XpBonus = 1.2f;     // +20% XP — level 10 is the perfect-run ceiling

    public static bool Active;
    public static string MatchCode = "", PlayerName = "";
    public static uint Seed;

    public static void Arm(string code, string playerName)
    {
        MatchCode = code.Trim().ToUpperInvariant();
        PlayerName = playerName.Trim();
        if (string.IsNullOrEmpty(MatchCode)) MatchCode = "OPEN";
        if (string.IsNullOrEmpty(PlayerName)) PlayerName = "PILOT";
        Seed = Hash32(MatchCode);
        Active = true;
    }

    public static void Disarm() => Active = false;

    public static int PilotIndex => (int)(Seed % (uint)ZealData.Pilots.Length);

    // deterministic per-level draft stream — play order can't desync it
    public static System.Random DraftRng(int level) =>
        new System.Random(unchecked((int)(Seed ^ (uint)(level * 2654435761))));

    public static System.Random WaveRng(int wave) =>
        new System.Random(unchecked((int)(Seed ^ 0x5EED ^ (uint)(wave * 40503))));

    // ---------- verify code (same algorithm as the web game) ----------
    public static uint Hash32(string str)
    {
        uint h = 1779033703u ^ (uint)str.Length;
        for (int i = 0; i < str.Length; i++)
        {
            h = Mul(h ^ str[i], 3432918353u);
            h = (h << 13) | (h >> 19);
        }
        h = Mul(h ^ (h >> 16), 2246822507u);
        h = Mul(h ^ (h >> 13), 3266489909u);
        return h ^ (h >> 16);
    }

    static uint Mul(uint a, uint b) => unchecked(a * b);

    public static string VerifyCode(int score, int timeSeconds)
    {
        uint h = Hash32($"{MatchCode}|{PlayerName}|{score}|{timeSeconds}|zealblitz");
        return ToBase36(h).ToUpperInvariant().PadLeft(7, '0');
    }

    static string ToBase36(uint v)
    {
        const string digits = "0123456789abcdefghijklmnopqrstuvwxyz";
        if (v == 0) return "0";
        var sb = new System.Text.StringBuilder();
        while (v > 0) { sb.Insert(0, digits[(int)(v % 36)]); v /= 36; }
        return sb.ToString();
    }

    // ---------- local standings per match code ----------
    public class Entry { public string name, verify; public int score, time; }

    static string Key => "nv-tournament-" + MatchCode;

    public static void RecordResult(int score, int timeSeconds)
    {
        var list = LoadStandings();
        list.Add(new Entry { name = PlayerName, score = score, time = timeSeconds, verify = VerifyCode(score, timeSeconds) });
        list.Sort((a, b) => b.score.CompareTo(a.score));
        if (list.Count > 20) list.RemoveRange(20, list.Count - 20);
        var lines = new List<string>();
        foreach (var e in list) lines.Add($"{e.name}\t{e.score}\t{e.time}\t{e.verify}");
        PlayerPrefs.SetString(Key, string.Join("\n", lines));
        PlayerPrefs.Save();
    }

    public static List<Entry> LoadStandings()
    {
        var list = new List<Entry>();
        string raw = PlayerPrefs.GetString(Key, "");
        if (string.IsNullOrEmpty(raw)) return list;
        foreach (var line in raw.Split('\n'))
        {
            var p = line.Split('\t');
            if (p.Length >= 4 && int.TryParse(p[1], out int sc) && int.TryParse(p[2], out int tm))
                list.Add(new Entry { name = p[0], score = sc, time = tm, verify = p[3] });
        }
        return list;
    }
}
