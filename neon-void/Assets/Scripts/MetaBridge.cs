using System.Runtime.InteropServices;
using UnityEngine;

// Adventure meta progression: the page hosts the classic Zeal Survivors
// SURV.Meta/SURV.Net layer (same profile format, same cloud saves, same
// season) and Unity drives it through this bridge. Guests play too —
// identity comes from the shared motz wallet/guest pid.
public static class MetaBridge
{
#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")] static extern int NVMetaJsReady();
    [DllImport("__Internal")] static extern string NVMetaJsSummary();
    [DllImport("__Internal")] static extern string NVMetaJsBuy(string id);
    [DllImport("__Internal")] static extern string NVMetaJsClaimQuest(string id);
    [DllImport("__Internal")] static extern string NVMetaJsClaimRewards();
    [DllImport("__Internal")] static extern string NVMetaJsBonuses();
    [DllImport("__Internal")] static extern string NVMetaJsAbsorbRun(string json);
    [DllImport("__Internal")] static extern void NVMetaJsRunStart();
    [DllImport("__Internal")] static extern void NVMetaJsRunSubmit(string json);
    [DllImport("__Internal")] static extern void NVMetaJsBoardFetch(string period);
    [DllImport("__Internal")] static extern string NVMetaJsBoardTake();
    [DllImport("__Internal")] static extern void NVMetaJsPassBuy();
    [DllImport("__Internal")] static extern string NVMetaJsPassStatus();
    [DllImport("__Internal")] static extern string NVMetaJsSurvivors(string pilot);
    [DllImport("__Internal")] static extern string NVMetaJsBuySurvivor(string pilot, string track);
    [DllImport("__Internal")] static extern string NVMetaJsSurvivorBonuses(string pilot);
    [DllImport("__Internal")] static extern string NVMetaJsShip(string pilot);
    [DllImport("__Internal")] static extern string NVMetaJsBuyShip(string pilot, string id);
    [DllImport("__Internal")] static extern string NVMetaJsShipBonuses(string pilot);
    [DllImport("__Internal")] static extern string NVMetaJsCrewBonuses();
#else
    static int NVMetaJsReady() => 0;
    static string NVMetaJsSummary() => "";
    static string NVMetaJsBuy(string id) => "{}";
    static string NVMetaJsClaimQuest(string id) => "{}";
    static string NVMetaJsClaimRewards() => "{}";
    static string NVMetaJsBonuses() => "{}";
    static string NVMetaJsAbsorbRun(string json) => "{}";
    static void NVMetaJsRunStart() { }
    static void NVMetaJsRunSubmit(string json) { }
    static void NVMetaJsBoardFetch(string period) { }
    static string NVMetaJsBoardTake() => "";
    static void NVMetaJsPassBuy() { }
    static string NVMetaJsPassStatus() => "";
    static string NVMetaJsSurvivors(string pilot) => "";
    static string NVMetaJsBuySurvivor(string pilot, string track) => "{}";
    static string NVMetaJsSurvivorBonuses(string pilot) => "{}";
    static string NVMetaJsShip(string pilot) => "";
    static string NVMetaJsBuyShip(string pilot, string id) => "{}";
    static string NVMetaJsShipBonuses(string pilot) => "{}";
    static string NVMetaJsCrewBonuses() => "{}";
#endif

    [System.Serializable] public class Upgrade { public string id, name, desc; public int rank, maxRank, cost; }
    [System.Serializable] public class Quest { public string id, desc; public int gold, xp; public bool done, claimed; }
    [System.Serializable]
    public class Summary
    {
        public int gold, passXp, passTier, passTiers, xpPerTier, priceRon, claimable;
        public int lifetimeKills, lifetimeRuns, bestScore;
        public bool premium;
        public string name, seasonName, seasonId;
        public Upgrade[] upgrades;
        public Quest[] quests;
    }
    [System.Serializable] public class Bonuses { public float might, maxhp, armor, recovery, cooldown, area, speed, magnet, xpgain, greed; }
    [System.Serializable] public class BuyResult { public bool ok; public string err; }
    [System.Serializable] public class ClaimAll { public bool ok; public int count; }
    [System.Serializable] public class Absorb { public bool ok; public int passXp, gold; public string[] quests; }
    [System.Serializable] public class BoardRow { public string name, character; public int score, level; public bool premium; }
    [System.Serializable] public class BoardMe { public int rank, score; }
    [System.Serializable] public class Board { public bool ok; public string period, week, reason; public BoardRow[] rows; public BoardMe me; }
    [System.Serializable] public class PassStatus { public bool busy, ok; public string status, reason; }

    [System.Serializable] public class Survivors { public string pilot; public int gold; public Upgrade[] tracks; }
    [System.Serializable] public class SurvivorBonuses { public float power, vitality, tempo; }
    [System.Serializable] public class ShipBonuses { public float might, maxhp, armor, recovery, cooldown, area, speed; }
    [System.Serializable] public class CrewBonuses { public float magnet, xpgain, greed; }

    public static bool Ready => NVMetaJsReady() != 0;

    static T Parse<T>(string json) where T : class
    {
        if (string.IsNullOrEmpty(json)) return null;
        try { return JsonUtility.FromJson<T>(json); } catch { return null; }
    }

    public static Summary GetSummary() => Parse<Summary>(NVMetaJsSummary());
    public static BuyResult Buy(string id) => Parse<BuyResult>(NVMetaJsBuy(id)) ?? new BuyResult();
    public static bool ClaimQuest(string id) { var r = Parse<ClaimAll>(NVMetaJsClaimQuest(id)); return r != null && r.ok; }
    public static int ClaimAllRewards() { var r = Parse<ClaimAll>(NVMetaJsClaimRewards()); return r != null ? r.count : 0; }
    public static Bonuses GetBonuses() => Parse<Bonuses>(NVMetaJsBonuses()) ?? new Bonuses();
    public static Absorb AbsorbRun(string statsJson) => Parse<Absorb>(NVMetaJsAbsorbRun(statsJson));
    public static void RunStart() => NVMetaJsRunStart();
    public static void RunSubmit(string resultsJson) => NVMetaJsRunSubmit(resultsJson);
    public static void BoardFetch(string period) => NVMetaJsBoardFetch(period);
    public static Board BoardTake() => Parse<Board>(NVMetaJsBoardTake());
    public static void PassBuy() => NVMetaJsPassBuy();
    public static PassStatus GetPassStatus() => Parse<PassStatus>(NVMetaJsPassStatus());
    public static Survivors GetSurvivors(string pilot) => Parse<Survivors>(NVMetaJsSurvivors(pilot));
    public static BuyResult BuySurvivor(string pilot, string track) => Parse<BuyResult>(NVMetaJsBuySurvivor(pilot, track)) ?? new BuyResult();
    public static SurvivorBonuses GetSurvivorBonuses(string pilot) => Parse<SurvivorBonuses>(NVMetaJsSurvivorBonuses(pilot)) ?? new SurvivorBonuses();
    public static Survivors GetShip(string pilot) => Parse<Survivors>(NVMetaJsShip(pilot));
    public static BuyResult BuyShip(string pilot, string id) => Parse<BuyResult>(NVMetaJsBuyShip(pilot, id)) ?? new BuyResult();
    public static ShipBonuses GetShipBonuses(string pilot) => Parse<ShipBonuses>(NVMetaJsShipBonuses(pilot)) ?? new ShipBonuses();
    public static CrewBonuses GetCrewBonuses() => Parse<CrewBonuses>(NVMetaJsCrewBonuses()) ?? new CrewBonuses();
}

// Per-run stat counters feeding quests, achievements and the leaderboard.
public static class RunStats
{
    public static int kills, elites, bosses, gems, evolved, chests;

    public static void Reset() { kills = elites = bosses = gems = evolved = chests = 0; }

    public static string ResultsJson(int score, int timeSec, int level, string character)
    {
        return "{\"score\":" + score + ",\"time\":" + timeSec + ",\"level\":" + level +
            ",\"kills\":" + kills + ",\"elites\":" + elites + ",\"bosses\":" + bosses +
            ",\"gems\":" + gems + ",\"evolved\":" + evolved + ",\"chests\":" + chests +
            ",\"gold\":0,\"weapons\":0,\"character\":\"" + character + "\"}";
    }
}
