using System.Collections;
using System.Collections.Generic;
using UnityEngine;

// Learned active skills, bound to keys 1-4 in learn order (max 4).
//  chrono   — refund 75% of every other skill's cooldown
//  boots    — +100% move speed for 5s
//  doubloon — horizontal wall of 25 golden pulses at 3x pulse damage
//  cannon   — homing missile at the crosshair target (must aim at an enemy)
//  drake    — absorb shield: 25% of max HP for 5s, breaks if exceeded
//  brazier  — 10s: +20% all damage, enemies slowed 40%
public class ActiveSkills : MonoBehaviour
{
    public class Slot
    {
        public ZealData.ActiveDef def;
        public float cdLeft;
    }

    public readonly List<Slot> slots = new List<Slot>();

    // buffs consumed by other systems
    public float SpeedBuffMult { get; private set; } = 1f;
    public float DamageBuffMult { get; private set; } = 1f;
    public static float EnemySlow = 1f;   // 0.6 while a brazier is burning

    SkillSystem _skills;
    Weapon _weapon;
    Health _health;
    ShipController _ship;
    GameObject _drakeVisual;
    float _bootsTimer, _brazierTimer, _drakeTimer;

    static readonly KeyCode[] Keys = { KeyCode.Alpha1, KeyCode.Alpha2, KeyCode.Alpha3, KeyCode.Alpha4 };

    void Awake()
    {
        _skills = GetComponent<SkillSystem>();
        _weapon = GetComponent<Weapon>();
        _health = GetComponent<Health>();
        _ship = GetComponent<ShipController>();
        EnemySlow = 1f;
    }

    public void ResetAll()
    {
        slots.Clear();
        SpeedBuffMult = 1f;
        DamageBuffMult = 1f;
        EnemySlow = 1f;
    }

    public bool Knows(string id) => slots.Exists(s => s.def.id == id);

    public void Learn(string id)
    {
        if (slots.Count >= ZealData.MaxActives || Knows(id)) return;
        var def = System.Array.Find(ZealData.Actives, a => a.id == id);
        if (def != null) slots.Add(new Slot { def = def });
    }

    void Update()
    {
        foreach (var s in slots)
            s.cdLeft = Mathf.Max(0f, s.cdLeft - Time.deltaTime);

        // buff timers
        if (_bootsTimer > 0f)
        {
            _bootsTimer -= Time.deltaTime;
            if (_bootsTimer <= 0f) SpeedBuffMult = 1f;
        }
        if (_brazierTimer > 0f)
        {
            _brazierTimer -= Time.deltaTime;
            if (_brazierTimer <= 0f) { DamageBuffMult = 1f; EnemySlow = 1f; }
        }
        if (_drakeTimer > 0f)
        {
            _drakeTimer -= Time.deltaTime;
            if (_drakeTimer <= 0f) EndDrake();
        }
        if (_drakeVisual != null)
        {
            float a = Time.time * 2.4f;
            _drakeVisual.transform.position = transform.position
                + transform.rotation * new Vector3(Mathf.Cos(a) * 5f, 1.5f, Mathf.Sin(a) * 5f + 2f);
            _drakeVisual.transform.rotation = Quaternion.LookRotation(transform.forward);
        }

        if (!GameManager.I.Running || GameManager.I.Paused) return;
        for (int i = 0; i < slots.Count && i < Keys.Length; i++)
            if ((Input.GetKeyDown(Keys[i]) || TouchInput.ConsumeSkill(i)) && slots[i].cdLeft <= 0f)
                Cast(slots[i]);
    }

    static string CastLine(string id) => id switch
    {
        "chrono" => "Cooldowns, reset!",
        "boots" => "Speed up!",
        "doubloon" => "Doubloon toss!",
        "cannon" => "Deck cannon!",
        "drake" => "Pocket drake!",
        "brazier" => "Void brazier!",
        _ => null,
    };

    void Cast(Slot s)
    {
        Announcer.Say(CastLine(s.def.id), 0.7f, 1.12f);
        switch (s.def.id)
        {
            case "chrono":
                foreach (var other in slots)
                    if (other != s) other.cdLeft *= 0.25f;
                var spc = GetComponent<SpecialAttack>();
                if (spc != null) spc.cooldownLeft *= 0.25f;
                ExplosionFactory.Sparks(transform.position, new Color(0.6f, 0.8f, 1f));
                GameManager.I.PlaySfx(SfxSynth.Pickup, 0.8f);
                break;

            case "boots":
                SpeedBuffMult = 2f;
                _bootsTimer = 5f;
                GameManager.I.PlaySfx(SfxSynth.Pickup, 0.7f);
                break;

            case "doubloon":
            {
                // X formation: two shallow diagonals crossing at the center
                float dmg = _weapon.damage * 3f;
                Vector3 fwd = transform.forward;
                Vector3 origin = transform.position + fwd * 3f;
                for (int i = 0; i <= 12; i++)
                {
                    float t = (i - 6) / 6f;   // -1 .. 1 along each stroke
                    Vector3 across = transform.right * t * 17f;
                    Vector3 rise = transform.up * t * 5f;
                    Projectile.Spawn(origin + across + rise, fwd * 200f, dmg, new Color(1f, 0.85f, 0.25f), gameObject, true);
                    if (i != 6)   // don't double the shared center bolt
                        Projectile.Spawn(origin + across - rise, fwd * 200f, dmg, new Color(1f, 0.85f, 0.25f), gameObject, true);
                }
                GameManager.I.PlaySfx(SfxSynth.Laser, 0.8f);
                ChaseCamera.Shake(0.2f);
                break;
            }

            case "cannon":
            {
                var target = CrosshairTarget();
                if (target == null)
                {
                    GameManager.I.PlaySfx(SfxSynth.Hit, 0.25f);   // no lock — no cast, no cooldown
                    return;
                }
                Missile.Launch(transform.position + transform.forward * 3f, transform.forward, target, gameObject, 140f);
                GameManager.I.PlaySfx(SfxSynth.Boom, 0.5f);
                break;
            }

            case "drake":
            {
                float pool = 0.25f * (_health.maxShield + _health.maxHull);
                _health.absorb = pool;
                _health.OnAbsorbBroken += DrakeBroken;
                _drakeTimer = 5f;
                BuildDrakeVisual();
                GameManager.I.PlaySfx(SfxSynth.WaveUp, 0.6f);
                break;
            }

            default:   // brazier
                DamageBuffMult = 1.2f;
                EnemySlow = 0.6f;
                _brazierTimer = 10f;
                ExplosionFactory.Explode(transform.position, new Color(0.55f, 0.2f, 0.9f), 1.2f);
                GameManager.I.PlaySfx(SfxSynth.WaveUp, 0.8f);
                break;
        }
        s.cdLeft = s.def.cooldown;
    }

    Transform CrosshairTarget()
    {
        Transform best = null;
        float bestAngle = 6f;
        foreach (var h in SkillSystem.AllHostiles())
        {
            Vector3 to = h.transform.position - transform.position;
            if (to.magnitude > 350f) continue;
            float ang = Vector3.Angle(transform.forward, to);
            if (ang < bestAngle) { bestAngle = ang; best = h.transform; }
        }
        return best;
    }

    void BuildDrakeVisual()
    {
        if (_drakeVisual != null) Destroy(_drakeVisual);
        _drakeVisual = new GameObject("pocketDrake");
        var c = new Color(0.4f, 1f, 0.6f);
        NVMeshes.SpherePart(_drakeVisual, NVAssets.Emissive(c, 3f), Vector3.zero, new Vector3(1.1f, 0.85f, 1.7f));
        NVMeshes.SpherePart(_drakeVisual, NVAssets.Emissive(c, 2f), new Vector3(0f, 0.3f, 0.7f), Vector3.one * 0.5f);
        var glow = NVAssets.Quad(NVAssets.AdditiveTinted(c), 3.2f);
        glow.transform.SetParent(_drakeVisual.transform, false);
        glow.AddComponent<Billboard>();
    }

    void DrakeBroken()
    {
        if (_drakeVisual != null)
            ExplosionFactory.Explode(_drakeVisual.transform.position, new Color(0.4f, 1f, 0.6f), 1f);
        EndDrake();
        GameManager.I.PlaySfx(SfxSynth.Boom, 0.5f);
    }

    void EndDrake()
    {
        _drakeTimer = 0f;
        _health.absorb = 0f;
        _health.OnAbsorbBroken -= DrakeBroken;
        if (_drakeVisual != null) { Destroy(_drakeVisual); _drakeVisual = null; }
    }
}
