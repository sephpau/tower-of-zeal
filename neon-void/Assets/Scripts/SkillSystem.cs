using System.Collections.Generic;
using System.Linq;
using UnityEngine;

// The Zeal Survivors layer: pilot stats, owned auto-weapons, passives.
// Sits on the player ship; each owned weapon fires itself on cooldown.
public class SkillSystem : MonoBehaviour
{
    public class OwnedWeapon
    {
        public ZealData.WeaponDef def;
        public int level = 1;
        public bool evolved;
        public float cooldown;
        // level-derived modifiers, rebuilt by ApplyLevels()
        public int amount, pierce;
        public float dmgMult = 1f, cdMult = 1f, areaMult = 1f, speedMult = 1f;
        public bool sweepBehind;
        public string DisplayName => evolved ? def.evoName : def.name;
        public string DisplayIcon => evolved ? def.evoIcon : def.icon;
    }

    // aggregated stats: pilot perks + passives (multiplicative bonuses as sums)
    public readonly Dictionary<string, float> stats = new Dictionary<string, float> {
        { "might", 0f }, { "cooldown", 0f }, { "speed", 0f }, { "maxhp", 0f },
        { "magnet", 0f }, { "area", 0f }, { "recovery", 0f }, { "greed", 0f }, { "xpgain", 0f },
    };

    public readonly List<OwnedWeapon> weapons = new List<OwnedWeapon>();
    public readonly Dictionary<string, int> passives = new Dictionary<string, int>();
    public ZealData.Pilot pilot;

    readonly List<GameObject> _drakes = new List<GameObject>();
    GameObject _auraRing;
    float _auraTick;

    public float DamageMult => 1f + stats["might"];
    public float CooldownMult => Mathf.Max(0.3f, 1f - stats["cooldown"]);
    public float AreaMult => 1f + stats["area"];
    public float MagnetMult => 1f + stats["magnet"];
    public float SpeedMult => 1f + stats["speed"];
    public float XpMult => 1f + stats["xpgain"];
    public float GreedMult => 1f + stats["greed"];

    float _baseMaxShield;

    public void InitPilot(ZealData.Pilot p)
    {
        pilot = p;
        foreach (var kv in p.perks)
        {
            if (kv.Key == "recovery") { var h = GetComponent<Health>(); h.shieldRegenPerSec += kv.Value * 4f; }
            else if (stats.ContainsKey(kv.Key)) stats[kv.Key] += kv.Value;
        }
        var health = GetComponent<Health>();
        _baseMaxShield = health.maxShield;
        RecalcShield(full: true);
        if (ZealData.AutoWeaponsEnabled) AddWeapon(p.startWeapon);
    }

    // per-pilot Adventure training — only the flown pilot's ranks apply
    public void ApplySurvivorBonuses(MetaBridge.SurvivorBonuses b)
    {
        stats["might"] += b.power;
        stats["maxhp"] += b.vitality;
        stats["cooldown"] += b.tempo;
        RecalcShield(full: true);
    }

    // permanent Adventure (armory/survivors) bonuses, applied after InitPilot
    public void ApplyMetaBonuses(MetaBridge.Bonuses b)
    {
        stats["might"] += b.might;
        stats["maxhp"] += b.maxhp;
        stats["cooldown"] += b.cooldown;
        stats["area"] += b.area;
        stats["speed"] += b.speed;
        stats["magnet"] += b.magnet;
        stats["xpgain"] += b.xpgain;
        stats["greed"] += b.greed;
        if (b.recovery > 0f) GetComponent<Health>().shieldRegenPerSec += b.recovery;
        RecalcShield(full: true);
    }

    void RecalcShield(bool full = false)
    {
        var h = GetComponent<Health>();
        float frac = full || h.maxShield <= 0f ? 1f : h.shield / h.maxShield;
        h.maxShield = _baseMaxShield * (1f + stats["maxhp"]);
        h.shield = h.maxShield * frac;
    }

    public bool HasWeapon(string id) => weapons.Any(w => w.def.id == id);
    public OwnedWeapon GetWeapon(string id) => weapons.FirstOrDefault(w => w.def.id == id);

    public void AddWeapon(string id)
    {
        var ow = new OwnedWeapon { def = ZealData.Weapons[id] };
        ApplyLevels(ow);
        weapons.Add(ow);
        if (id == "fox") RebuildDrakes(ow);
        if (id == "void") RebuildAura(ow);
    }

    public void LevelWeapon(string id)
    {
        var ow = GetWeapon(id);
        if (ow == null || ow.level >= ow.def.maxLevel) return;
        ow.level++;
        ApplyLevels(ow);
        if (id == "fox") RebuildDrakes(ow);
        if (id == "void") RebuildAura(ow);
    }

    public void Evolve(string id)
    {
        var ow = GetWeapon(id);
        if (ow == null || ow.evolved) return;
        ow.evolved = true;
        RunStats.evolved++;
        ApplyLevels(ow);
        if (id == "fox") RebuildDrakes(ow);
        if (id == "void") RebuildAura(ow);
        ExplosionFactory.Explode(transform.position, new Color(1f, 0.9f, 0.4f), 1.5f);
    }

    // tiered passives: totals per level, mastery bundle at level 3
    public void AddPassive(string id)
    {
        var def = ZealData.Passives.First(p => p.id == id);
        int cur = passives.TryGetValue(id, out int v) ? v : 0;
        if (cur >= ZealData.PassiveMaxLevel) return;
        passives[id] = cur + 1;

        float prevTotal = cur > 0 ? def.totals[cur - 1] : 0f;
        float delta = def.totals[cur] - prevTotal;
        stats[def.stat] += delta;

        if (passives[id] >= ZealData.PassiveMaxLevel)
        {
            // MASTERY: +10% xp, damage, hp, movement speed
            stats["xpgain"] += ZealData.MasteryBonus;
            stats["might"] += ZealData.MasteryBonus;
            stats["maxhp"] += ZealData.MasteryBonus;
            stats["speed"] += ZealData.MasteryBonus;
            GameManager.I.PlaySfx(SfxSynth.WaveUp, 0.9f);
        }
        if (def.stat == "maxhp" || passives[id] >= ZealData.PassiveMaxLevel)
            RecalcShield();
    }

    public int PassiveLevel(string id) => passives.TryGetValue(id, out int v) ? v : 0;

    // interpret the ported levelUps arrays (each entry = effect at that level-up)
    void ApplyLevels(OwnedWeapon ow)
    {
        var d = ow.def;
        ow.amount = d.amount;
        ow.pierce = d.pierce;
        ow.dmgMult = 1f; ow.cdMult = 1f; ow.areaMult = 1f; ow.speedMult = 1f;
        ow.sweepBehind = false;
        for (int i = 0; i < ow.level - 1 && i < d.levelUps.Length; i++)
        {
            string fx = d.levelUps[i].ToLowerInvariant();
            if (fx.Contains("behind")) ow.sweepBehind = true;
            if (fx.Contains("+1 bolt") || fx.Contains("+1 drake") || fx.Contains("+1 slash") || fx.Contains("+1 shell") ||
                fx.Contains("+1 cannonball") || fx.Contains("+1 pie") || fx.Contains("+1 wave") || fx.Contains("+1 ball")) ow.amount += 1;
            if (fx.Contains("+2 coins")) ow.amount += 2;
            if (fx.Contains("+2 jumps")) ow.amount += 2;
            if (fx.Contains("+1 pierce")) ow.pierce += 1;
            foreach (var (needle, apply) in new (string, System.Action<float>)[] {
                ("% damage", v => ow.dmgMult *= 1f + v),
                ("% cooldown", v => ow.cdMult *= 1f - v),
                ("% area", v => ow.areaMult *= 1f + v),
                ("% speed", v => ow.speedMult *= 1f + v),
                ("% blast area", v => ow.areaMult *= 1f + v),
            })
            {
                int idx = fx.IndexOf(needle);
                if (idx > 0)
                {
                    int start = fx.LastIndexOfAny(new[] { '+', '-' }, idx);
                    if (start >= 0 && float.TryParse(fx.Substring(start + 1, idx - start - 1), out float pct))
                        apply(pct / 100f);
                }
            }
        }

        if (ow.evolved) ApplyEvolution(ow);
    }

    static void ApplyEvolution(OwnedWeapon ow)
    {
        switch (ow.def.id)
        {
            case "bolt": ow.dmgMult *= 2f; ow.cdMult *= 0.5f; ow.pierce += 3; ow.speedMult *= 1.4f; ow.amount += 1; break;
            case "fox": ow.amount += 2; ow.speedMult *= 1.6f; ow.dmgMult *= 1.8f; break;
            case "cutlass": ow.dmgMult *= 1.8f; ow.areaMult *= 1.3f; break;   // full 360° handled in FireSweep
            case "cannon": ow.amount += 3; ow.areaMult *= 1.4f; ow.dmgMult *= 1.5f; break;
            case "chain": ow.amount += 6; ow.dmgMult *= 1.7f; ow.cdMult *= 0.7f; break;
            case "pie": ow.amount += 2; ow.dmgMult *= 1.6f; ow.speedMult *= 1.2f; break;
            case "coins": ow.amount += 4; ow.pierce += 2; ow.dmgMult *= 1.5f; break;
            case "void": ow.areaMult *= 1.5f; ow.dmgMult *= 1.8f; break;
        }
    }

    bool Guarding()
    {
        var sc = GetComponent<ShipController>();
        return sc != null && sc.guarding;
    }

    void Update()
    {
        if (!GameManager.I.Running || GameManager.I.Paused) return;
        bool guarding = Guarding();   // guard mode: no attacking, weapons hold
        if (!guarding)
        {
            foreach (var ow in weapons)
            {
                ow.cooldown -= Time.deltaTime;
                if (ow.cooldown > 0f) continue;
                if (Fire(ow))
                    ow.cooldown = ow.def.cd * ow.cdMult * CooldownMult;
                else
                    ow.cooldown = 0.25f;   // nothing in range, retry soon
            }
        }
        TickDrakes(guarding);
        TickAura(guarding);
    }

    // ---------- firing ----------
    bool Fire(OwnedWeapon ow)
    {
        switch (ow.def.kind)
        {
            case ZealData.Kind.Straight: return FireBolts(ow);
            case ZealData.Kind.Lob: return FireCannon(ow);
            case ZealData.Kind.Chain: return FireChain(ow);
            case ZealData.Kind.Boomerang: return FirePie(ow);
            case ZealData.Kind.Spread: return FireCoins(ow);
            case ZealData.Kind.Sweep: return FireSweep(ow);
            default: return true;   // orbit + aura are continuous, handled in Tick*
        }
    }

    // every damageable hostile: fighters, the three Zeal bosses, the dreadnought
    public static List<Health> AllHostiles()
    {
        var list = new List<Health>();
        foreach (var ai in Object.FindObjectsByType<EnemyAI>()) { var h = ai.GetComponent<Health>(); if (h != null) list.Add(h); }
        foreach (var mb in Object.FindObjectsByType<MinibossAI>()) { var h = mb.GetComponent<Health>(); if (h != null) list.Add(h); }
        var boss = Object.FindAnyObjectByType<BossAI>();
        if (boss != null) { var h = boss.GetComponent<Health>(); if (h != null) list.Add(h); }
        if (CoopSync.IsGuest)   // guest enemies are AI-less puppets, found by their net tag
            foreach (var tag in Object.FindObjectsByType<NetTag>(FindObjectsSortMode.None))
            {
                var h = tag.GetComponent<Health>();
                if (h != null && !list.Contains(h)) list.Add(h);
            }
        return list;
    }

    Transform Nearest(float range)
    {
        Transform best = null;
        float bd = range;
        foreach (var h in AllHostiles())
        {
            float d = Vector3.Distance(transform.position, h.transform.position);
            if (d < bd) { bd = d; best = h.transform; }
        }
        return best;
    }

    bool FireBolts(OwnedWeapon ow)
    {
        var t = Nearest(200f);
        if (t == null) return false;
        Vector3 dir = (t.position - transform.position).normalized;
        for (int i = 0; i < ow.amount; i++)
        {
            Vector3 d = Quaternion.AngleAxis((i - (ow.amount - 1) * 0.5f) * 4f, transform.up) * dir;
            Projectile.Spawn(transform.position + d * 3f, d * ow.def.speed * ow.speedMult,
                ow.def.dmg * ow.dmgMult * DamageMult, new Color(1f, 0.95f, 0.4f), gameObject, true, ow.pierce);
        }
        GameManager.I.PlaySfx(SfxSynth.Laser, 0.25f);
        return true;
    }

    bool FireCoins(OwnedWeapon ow)
    {
        var t = Nearest(160f);
        if (t == null) return false;
        Vector3 dir = (t.position - transform.position).normalized;
        float fan = ow.level >= 8 ? 34f : 24f;
        for (int i = 0; i < ow.amount; i++)
        {
            float a = ow.amount == 1 ? 0f : (i / (float)(ow.amount - 1) - 0.5f) * fan;
            Vector3 d = Quaternion.AngleAxis(a, transform.up) * dir;
            Projectile.Spawn(transform.position + d * 3f, d * ow.def.speed,
                ow.def.dmg * ow.dmgMult * DamageMult, new Color(1f, 0.85f, 0.3f), gameObject, true, ow.pierce);
        }
        GameManager.I.PlaySfx(SfxSynth.Pickup, 0.2f);
        return true;
    }

    bool FireCannon(OwnedWeapon ow)
    {
        var t = Nearest(180f);
        if (t == null) return false;
        for (int i = 0; i < ow.amount; i++)
        {
            Vector3 jitter = Random.insideUnitSphere * 6f * i;
            CannonShell.Launch(transform.position, t.position + jitter,
                ow.def.dmg * ow.dmgMult * DamageMult,
                10f * ow.areaMult * AreaMult, gameObject);
        }
        GameManager.I.PlaySfx(SfxSynth.Boom, 0.25f);
        return true;
    }

    bool FireChain(OwnedWeapon ow)
    {
        var first = Nearest(140f);
        if (first == null) return false;
        float dmg = ow.def.dmg * ow.dmgMult * DamageMult;
        var hitSet = new HashSet<Transform>();
        Vector3 from = transform.position;
        Transform cur = first;
        var points = new List<Vector3> { from };
        for (int jump = 0; jump <= ow.amount && cur != null; jump++)
        {
            points.Add(cur.position);
            var h = cur.GetComponent<Health>();
            if (h != null) h.TakeDamage(dmg);
            ExplosionFactory.Sparks(cur.position, new Color(0.6f, 0.7f, 1f));
            hitSet.Add(cur);
            Transform next = null;
            float bd = 45f;
            foreach (var hh in AllHostiles())
            {
                if (hitSet.Contains(hh.transform)) continue;
                float d = Vector3.Distance(cur.position, hh.transform.position);
                if (d < bd) { bd = d; next = hh.transform; }
            }
            cur = next;
        }
        LightningArc.Show(points, 0.18f);
        GameManager.I.PlaySfx(SfxSynth.Hit, 0.3f);
        return true;
    }

    bool FirePie(OwnedWeapon ow)
    {
        var t = Nearest(150f);
        Vector3 dir = t != null ? (t.position - transform.position).normalized : transform.forward;
        for (int i = 0; i < ow.amount; i++)
        {
            Vector3 d = Quaternion.AngleAxis(i * (360f / Mathf.Max(1, ow.amount)), transform.up) * dir;
            BoomerangDisc.Launch(transform, d, ow.def.dmg * ow.dmgMult * DamageMult,
                ow.def.speed, 2.2f * ow.areaMult * AreaMult);
        }
        GameManager.I.PlaySfx(SfxSynth.Laser, 0.2f);
        return true;
    }

    bool FireSweep(OwnedWeapon ow)
    {
        float range = 30f * ow.areaMult * AreaMult;
        float dmg = ow.def.dmg * ow.dmgMult * DamageMult;
        int waves = ow.amount;
        bool hitAny;
        if (ow.evolved)   // Tempest Blades: the full hurricane
            hitAny = SweepArc(transform.forward, range * 1.1f, dmg, waves, 180f);
        else
        {
            hitAny = SweepArc(transform.forward, range, dmg, waves, 55f);
            if (ow.sweepBehind) hitAny |= SweepArc(-transform.forward, range * 0.8f, dmg, 1, 55f);
        }
        if (hitAny) GameManager.I.PlaySfx(SfxSynth.Hit, 0.35f);
        return true;   // sweep always cycles, hit or not
    }

    bool SweepArc(Vector3 dir, float range, float dmg, int waves, float halfAngle)
    {
        SweepVisual.Show(transform, dir, range, halfAngle);
        bool any = false;
        foreach (var ai in Object.FindObjectsByType<EnemyAI>())
        {
            Vector3 to = ai.transform.position - transform.position;
            if (to.magnitude > range) continue;
            if (Vector3.Angle(dir, to) > halfAngle) continue;
            var h = ai.GetComponent<Health>();
            if (h != null) h.TakeDamage(dmg * waves);
            var rb = ai.GetComponent<Rigidbody>();
            if (rb != null) rb.AddForce(to.normalized * 900f, ForceMode.Impulse);
            any = true;
        }
        foreach (var mb in Object.FindObjectsByType<MinibossAI>())
        {
            Vector3 to = mb.transform.position - transform.position;
            if (to.magnitude < range && Vector3.Angle(dir, to) < halfAngle)
            {
                mb.GetComponent<Health>().TakeDamage(dmg * waves);
                any = true;
            }
        }
        var boss = Object.FindAnyObjectByType<BossAI>();
        if (boss != null)
        {
            Vector3 to = boss.transform.position - transform.position;
            if (to.magnitude < range && Vector3.Angle(dir, to) < halfAngle)
            {
                boss.GetComponent<Health>().TakeDamage(dmg * waves);
                any = true;
            }
        }
        return any;
    }

    // ---------- drakes (orbit) ----------
    void RebuildDrakes(OwnedWeapon ow)
    {
        foreach (var d in _drakes) if (d != null) Destroy(d);
        _drakes.Clear();
        for (int i = 0; i < ow.amount; i++)
        {
            var drake = new GameObject("drake");
            var c = new Color(0.4f, 1f, 0.6f);
            NVMeshes.SpherePart(drake, NVAssets.Emissive(c, 3f), Vector3.zero, new Vector3(0.9f, 0.7f, 1.4f));
            NVMeshes.SpherePart(drake, NVAssets.Emissive(c, 2f), new Vector3(0f, 0.25f, 0.55f), Vector3.one * 0.4f);
            var glow = NVAssets.Quad(NVAssets.AdditiveTinted(c), 2.6f);
            glow.transform.SetParent(drake.transform, false);
            glow.AddComponent<Billboard>();
            _drakes.Add(drake);
        }
    }

    void TickDrakes(bool guarding = false)
    {
        var ow = GetWeapon("fox");
        if (ow == null || _drakes.Count == 0) return;
        float radius = 9f * ow.areaMult * AreaMult;
        float angSpeed = ow.def.speed * ow.speedMult;
        float baseAng = Time.time * angSpeed;
        float dmg = ow.def.dmg * ow.dmgMult * DamageMult;
        for (int i = 0; i < _drakes.Count; i++)
        {
            if (_drakes[i] == null) continue;
            float a = baseAng + i * Mathf.PI * 2f / _drakes.Count;
            Vector3 offset = transform.rotation * new Vector3(Mathf.Cos(a) * radius, Mathf.Sin(a * 0.7f) * 2.5f, Mathf.Sin(a) * radius);
            Vector3 pos = transform.position + offset;
            _drakes[i].transform.position = pos;
            _drakes[i].transform.rotation = Quaternion.LookRotation(Vector3.Cross(offset.normalized, transform.up) + transform.forward * 0.3f);
            if (!guarding)
                foreach (var h in AllHostiles())
                    if (Vector3.Distance(pos, h.transform.position) < 4.5f)
                        h.TakeDamage(dmg * Time.deltaTime * 3f);
        }
    }

    // ---------- void aura ----------
    void RebuildAura(OwnedWeapon ow)
    {
        if (_auraRing == null)
        {
            _auraRing = new GameObject("voidAura");
            _auraRing.transform.SetParent(transform, false);
            var mf = _auraRing.AddComponent<MeshFilter>();
            mf.sharedMesh = NVAssets.RingMesh(0.88f, 1f, 64);
            var mr = _auraRing.AddComponent<MeshRenderer>();
            var mat = new Material(Shader.Find("Legacy Shaders/Particles/Additive"));
            mat.mainTexture = NVAssets.GlowTex;
            mat.SetColor("_TintColor", new Color(0.55f, 0.2f, 0.9f, 0.5f));
            mr.sharedMaterial = mat;
        }
        float r = AuraRadius(ow);
        _auraRing.transform.localScale = new Vector3(r, r, r);
    }

    float AuraRadius(OwnedWeapon ow) => 13f * ow.areaMult * AreaMult;

    void TickAura(bool guarding = false)
    {
        var ow = GetWeapon("void");
        if (ow == null) return;
        if (_auraRing != null)
            _auraRing.transform.rotation = Quaternion.Euler(90f, Time.time * 30f, 0f);
        if (guarding) return;
        _auraTick -= Time.deltaTime;
        if (_auraTick > 0f) return;
        _auraTick = ow.def.cd * CooldownMult;
        float r = AuraRadius(ow);
        float dmg = ow.def.dmg * ow.dmgMult * DamageMult;
        foreach (var h in AllHostiles())
            if (Vector3.Distance(transform.position, h.transform.position) < r + 5f)
                h.TakeDamage(dmg);
    }
}
