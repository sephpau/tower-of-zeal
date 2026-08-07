using System.Collections.Generic;
using UnityEngine;

// Data port of Zeal Survivors (markofthezeal.com/survive) — characters,
// weapons, and passives, retuned for 3D space scale but numerically faithful.
public static class ZealData
{
    // ---------- pilots ----------
    public class Pilot
    {
        public string id, name, title, perkText;
        public string startWeapon;
        public Color accent;
        public Dictionary<string, float> perks = new Dictionary<string, float>();
    }

    public static readonly Pilot[] Pilots = {
        new Pilot { id = "ego", name = "Ego", title = "The Zealot",
            startWeapon = "bolt", accent = new Color(0.5f, 0.95f, 1f),
            perkText = "+5% damage, +5% max HP. The one and only.",
            perks = { { "might", 0.05f }, { "maxhp", 0.05f } } },
        new Pilot { id = "captain", name = "Captain Ego", title = "Scourge of the Seas",
            startWeapon = "cutlass", accent = new Color(1f, 0.75f, 0.3f),
            perkText = "+15% damage, +10% score, -5% speed.",
            perks = { { "might", 0.15f }, { "speed", -0.05f }, { "greed", 0.10f } } },
        new Pilot { id = "chef", name = "Chef Ego", title = "Five-Star Slaughter",
            startWeapon = "pie", accent = new Color(1f, 0.5f, 0.5f),
            perkText = "+20% area, +0.5 shield/s, +5% cooldown.",
            perks = { { "area", 0.20f }, { "recovery", 0.5f }, { "cooldown", 0.05f } } },
        new Pilot { id = "lunar", name = "Lunar Ego", title = "Festival of Ruin",
            startWeapon = "chain", accent = new Color(0.8f, 0.5f, 1f),
            perkText = "-12% cooldown, +10% XP gain. Lights every lantern.",
            perks = { { "cooldown", 0.12f }, { "xpgain", 0.10f } } },
    };

    // ---------- weapons ----------
    public enum Kind { Straight, Orbit, Sweep, Lob, Chain, Boomerang, Spread, Aura }

    public class WeaponDef
    {
        public string id, name, desc, icon;
        public Kind kind;
        public int maxLevel = 8;
        public float dmg, cd;
        public int amount, pierce;
        public float speed, area = 1f, duration;
        public string[] levelUps;
        public string evoName, evoDesc, evoNeeds, evoIcon;
    }

    public static readonly Dictionary<string, WeaponDef> Weapons = new Dictionary<string, WeaponDef>
    {
        { "bolt", new WeaponDef { id = "bolt", name = "Zeal Bolt", icon = "⚡", kind = Kind.Straight,
            desc = "Auto-fires a bolt at the nearest hostile. Pierces 1 extra target.",
            dmg = 14, cd = 1.05f, amount = 1, speed = 130f, pierce = 1,
            levelUps = new[] { "+1 bolt", "+25% damage", "+1 pierce", "+1 bolt", "-15% cooldown", "+30% damage", "+1 bolt & +1 pierce" },
            evoName = "Storm Lance", evoDesc = "A relentless storm of piercing lances.", evoNeeds = "sigil", evoIcon = "🌩" } },
        { "fox", new WeaponDef { id = "fox", name = "Pocket Drake", icon = "🐉", kind = Kind.Orbit,
            desc = "A drake drone circles your ship, shredding everything it touches.",
            dmg = 10, cd = 0.3f, amount = 1, speed = 2.4f, pierce = 999,
            levelUps = new[] { "+1 drake", "+30% damage", "+20% area & speed", "+1 drake", "+15% speed", "+30% damage", "+1 drake & +20% area" },
            evoName = "Drake Cyclone", evoDesc = "The drakes never stop spinning. Ever.", evoNeeds = "chrono", evoIcon = "🌀" } },
        { "cutlass", new WeaponDef { id = "cutlass", name = "Corsair Cutlass", icon = "🗡", kind = Kind.Sweep,
            desc = "A wide energy slash ahead of the ship. Shoves hostiles back.",
            dmg = 20, cd = 1.35f, amount = 1, pierce = 999,
            levelUps = new[] { "Slash behind too", "+30% damage", "+25% area", "+1 slash wave", "-15% cooldown", "+35% damage", "+30% area & +1 wave" },
            evoName = "Tempest Blades", evoDesc = "A hurricane of spectral cutlasses — full 360°.", evoNeeds = "keg", evoIcon = "⚔" } },
        { "cannon", new WeaponDef { id = "cannon", name = "Deck Cannon", icon = "💣", kind = Kind.Lob,
            desc = "Lobs a plasma shell at the nearest target — explodes on arrival.",
            dmg = 26, cd = 2.4f, amount = 1, speed = 90f,
            levelUps = new[] { "+1 shell", "+30% blast area", "+30% damage", "+1 shell", "-20% cooldown", "+35% damage", "+1 shell & +25% area" },
            evoName = "Broadside", evoDesc = "Carpet-bombs the void with burning shot.", evoNeeds = "grog", evoIcon = "☄" } },
        { "chain", new WeaponDef { id = "chain", name = "Storm Mark", icon = "🌩", kind = Kind.Chain,
            desc = "Zaps the nearest hostile, then leaps to 3 more nearby.",
            dmg = 18, cd = 1.9f, amount = 3,
            levelUps = new[] { "+2 jumps", "+25% damage", "+2 jumps", "+30% damage", "-20% cooldown", "+2 jumps", "+40% damage" },
            evoName = "Wrath of Zeal", evoDesc = "The sky itself hunts your enemies.", evoNeeds = "boots", evoIcon = "⛈" } },
        { "pie", new WeaponDef { id = "pie", name = "Scalding Pie", icon = "🥧", kind = Kind.Boomerang,
            desc = "A superheated disc flies out, then boomerangs back through the crowd.",
            dmg = 16, cd = 1.7f, amount = 1, speed = 100f, pierce = 999, area = 1.1f,
            levelUps = new[] { "+1 pie", "+30% damage", "+20% area", "+1 pie", "-15% cooldown", "+35% damage", "+1 pie & +20% area" },
            evoName = "Banquet of Doom", evoDesc = "An endless tasting menu of pain.", evoNeeds = "lode", evoIcon = "🍽" } },
        { "coins", new WeaponDef { id = "coins", name = "Doubloon Toss", icon = "🪙", kind = Kind.Spread,
            desc = "Sprays a fan of coins toward the nearest hostile. Each pierces 2.",
            dmg = 9, cd = 1.2f, amount = 3, speed = 145f, pierce = 2,
            levelUps = new[] { "+2 coins", "+25% damage", "+1 pierce", "+2 coins", "-15% cooldown", "+30% damage", "+2 coins & wider fan" },
            evoName = "Treasury Storm", evoDesc = "Make it rain. Lethally.", evoNeeds = "sigil", evoIcon = "👑" } },
        { "void", new WeaponDef { id = "void", name = "Void Brazier", icon = "🔮", kind = Kind.Aura,
            desc = "A permanent ring of void flame around the ship — burns everything inside.",
            dmg = 7, cd = 0.5f, amount = 1, pierce = 999,
            levelUps = new[] { "+20% area", "+30% damage", "+20% area", "+30% damage", "+25% area", "+35% damage", "+30% area & damage" },
            evoName = "Void Tempest", evoDesc = "A consuming ring of violet fire.", evoNeeds = "chrono", evoIcon = "🟣" } },
    };

    // ---------- passives ----------
    public class PassiveDef
    {
        public string id, name, stat, desc, icon;
        public float per;
        public int maxLevel = 5;
    }

    public static readonly PassiveDef[] Passives = {
        new PassiveDef { id = "sigil", name = "Zeal Sigil", icon = "🔥", stat = "might", per = 0.10f, desc = "+10% damage per rank" },
        new PassiveDef { id = "chrono", name = "Storm Chronometer", icon = "⏱", stat = "cooldown", per = 0.07f, desc = "-7% weapon cooldown per rank" },
        new PassiveDef { id = "boots", name = "Galewind Boots", icon = "👢", stat = "speed", per = 0.06f, desc = "+6% ship speed per rank" },
        new PassiveDef { id = "grog", name = "Hearty Grog", icon = "🍺", stat = "maxhp", per = 0.10f, desc = "+10% max shield per rank" },
        new PassiveDef { id = "lode", name = "Lodestone Charm", icon = "🧲", stat = "magnet", per = 0.25f, desc = "+25% pickup range per rank" },
        new PassiveDef { id = "keg", name = "Powder Keg", icon = "🛢", stat = "area", per = 0.10f, desc = "+10% attack area per rank" },
    };

    // Zeal auto-weapons disabled: combat is the straight LMB pulser only.
    // The system stays wired so new special attacks can slot in later.
    public static readonly bool AutoWeaponsEnabled = false;

    public const int MaxWeaponSlots = 4;
    public const int MaxPassiveSlots = 4;

    public static int XpToNext(int level) => 5 + level * 4 + level * level / 2;

    // ---------- Zeal bosses (minibosses at waves 3 / 6 / 9) ----------
    public class BossDef
    {
        public string id, name, taunt, behavior;
        public int wave;
        public float hp, dmg;
        public int score, xp;
        public Color tint;
    }

    public static readonly BossDef[] Bosses = {
        new BossDef { id = "smuggler", name = "The Shadow Smuggler", wave = 3,
            behavior = "blink", hp = 480f, dmg = 12f, score = 1500, xp = 20,
            taunt = "Your loot is MY loot now!", tint = new Color(0.55f, 0.3f, 0.9f) },
        new BossDef { id = "gruyere", name = "Gruyere the Ringmaster", wave = 6,
            behavior = "summon", hp = 900f, dmg = 16f, score = 4000, xp = 40,
            taunt = "Step right up... and DIE!", tint = new Color(1f, 0.72f, 0.2f) },
        new BossDef { id = "garrison", name = "Garrison, Void Warden", wave = 9,
            behavior = "gravity", hp = 1400f, dmg = 22f, score = 10000, xp = 80,
            taunt = "The void hungers, little zealot.", tint = new Color(0.7f, 0.15f, 0.4f) },
    };
}
