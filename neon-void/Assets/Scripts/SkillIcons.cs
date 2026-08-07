using System.Collections.Generic;
using UnityEngine;

// Loads the hand-made skill icon art from Resources/icons (drawn for
// Zeal Survivors v2). Falls back to null (callers keep procedural look).
public static class SkillIcons
{
    static readonly Dictionary<string, Sprite> Cache = new Dictionary<string, Sprite>();

    static readonly Dictionary<string, string> ActiveFiles = new Dictionary<string, string> {
        { "chrono", "Storm Chronometer" },
        { "boots", "Galewin Boots" },
        { "doubloon", "Doubloon Toss" },
        { "cannon", "Deck Cannon" },
        { "drake", "Pocket Drake" },
        { "brazier", "Void Braizer" },
    };

    public static Sprite Active(string id) =>
        ActiveFiles.TryGetValue(id, out var file) ? Load(file) : null;

    // passive icons are per-level; fall back to the highest level that has art
    public static Sprite Passive(string id, int level)
    {
        string baseName = id == "keg" ? "Powder Keg" : id == "grog" ? "Hearty Grog" : "Lodestone Charm";
        for (int l = Mathf.Clamp(level, 1, 3); l >= 1; l--)
        {
            var s = Load(baseName + " lvl " + l);
            if (s != null) return s;
        }
        return null;
    }

    static Sprite Load(string name)
    {
        if (Cache.TryGetValue(name, out var cached)) return cached;
        var tex = Resources.Load<Texture2D>("icons/" + name);
        Sprite s = tex != null
            ? Sprite.Create(tex, new Rect(0, 0, tex.width, tex.height), new Vector2(0.5f, 0.5f))
            : null;
        Cache[name] = s;
        return s;
    }
}
