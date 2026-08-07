using System.Collections;
using System.Collections.Generic;
using UnityEngine;

// Per-pilot special attacks on RMB:
//  Ego     — Zeal Bolt: high-dmg laser beam, 2s channel, continuous damage in the beam. 12s CD.
//  Captain — Corsair Cutlass: very-high-dmg whirling sword storm in close radius for 2s. 20s CD.
//  Chef    — Scalding Pie: low-dmg homing pie missile. 2.5s CD.
//  Lunar   — Storm Mark: light bullet; on hit, chain lightning strikes everything nearby
//            for the same damage. 6s CD.
public class SpecialAttack : MonoBehaviour
{
    public string DisplayName { get; private set; }
    public float cooldownLeft;
    public float CooldownTotal => _cooldown;

    ZealData.Pilot _pilot;
    float _cooldown;
    SkillSystem _skills;
    ShipController _ship;
    Coroutine _channel;

    const float BeamDps = 45f, BeamRange = 240f, BeamDuration = 2f;
    const float StormDps = 70f, StormRadius = 26f, StormDuration = 2f;
    const float PieDamage = 18f;
    const float StormMarkDamage = 16f, ChainRadius = 38f;

    void Awake()
    {
        _skills = GetComponent<SkillSystem>();
        _ship = GetComponent<ShipController>();
    }

    public void Init(ZealData.Pilot p)
    {
        _pilot = p;
        cooldownLeft = 0f;
        switch (p.id)
        {
            case "ego": DisplayName = "ZEAL BOLT"; _cooldown = 12f; break;
            case "captain": DisplayName = "CORSAIR CUTLASS"; _cooldown = 20f; break;
            case "chef": DisplayName = "SCALDING PIE"; _cooldown = 2.5f; break;
            default: DisplayName = "STORM MARK"; _cooldown = 6f; break;
        }
    }

    public void CancelChannel()
    {
        if (_channel != null) { StopCoroutine(_channel); _channel = null; }
    }

    float Might => _skills != null ? _skills.DamageMult : 1f;
    Color Accent => _pilot != null ? _pilot.accent : Color.cyan;

    void Update()
    {
        cooldownLeft = Mathf.Max(0f, cooldownLeft - Time.deltaTime);
        if (_pilot == null || !GameManager.I.Running || GameManager.I.Paused) return;
        if (!Input.GetMouseButtonDown(1) || cooldownLeft > 0f) return;

        if (_ship != null) _ship.BreakGuard();   // specials are attacks too
        cooldownLeft = _cooldown;
        switch (_pilot.id)
        {
            case "ego": _channel = StartCoroutine(ZealBeam()); break;
            case "captain": _channel = StartCoroutine(CutlassStorm()); break;
            case "chef": LaunchPie(); break;
            default: FireStormMark(); break;
        }
    }

    // ---------- Ego: 2s laser beam ----------
    IEnumerator ZealBeam()
    {
        var go = new GameObject("zealBeam");
        // white-hot core
        var core = go.AddComponent<LineRenderer>();
        core.material = NVAssets.Additive;
        core.startWidth = 2.2f;
        core.endWidth = 1.4f;
        core.startColor = Color.white;
        core.endColor = new Color(1f, 1f, 1f, 0.9f);
        // wide colored outer glow
        var outerGo = new GameObject("beamOuter");
        outerGo.transform.SetParent(go.transform, false);
        var outer = outerGo.AddComponent<LineRenderer>();
        outer.material = NVAssets.Additive;
        outer.startWidth = 6.5f;
        outer.endWidth = 3.5f;
        outer.startColor = new Color(Accent.r, Accent.g, Accent.b, 0.55f);
        outer.endColor = new Color(Accent.r, Accent.g, Accent.b, 0.15f);
        // muzzle flare + impact tip
        var muzzleGlow = NVAssets.Quad(NVAssets.AdditiveTinted(Accent), 10f);
        muzzleGlow.AddComponent<Billboard>();
        var tip = NVAssets.Quad(NVAssets.AdditiveTinted(Accent), 16f);
        tip.AddComponent<Billboard>();
        var tipLight = new GameObject("tipLight").AddComponent<Light>();
        tipLight.type = LightType.Point;
        tipLight.color = Accent;
        tipLight.intensity = 4f;
        tipLight.range = 30f;

        float t = 0f;
        while (t < BeamDuration && GameManager.I.Running && !GameManager.I.Paused)
        {
            t += Time.deltaTime;
            Vector3 origin = transform.position + transform.forward * 3f;
            Vector3 end = origin + transform.forward * BeamRange;
            // breathing pulse so the beam feels alive
            float pulse = 1f + Mathf.Sin(t * 30f) * 0.15f;
            core.widthMultiplier = pulse;
            outer.widthMultiplier = pulse;
            core.SetPositions(new[] { origin, end });
            outer.SetPositions(new[] { origin, end });
            muzzleGlow.transform.position = origin;
            tip.transform.position = end;
            tipLight.transform.position = end - transform.forward * 4f;

            // continuous damage to every hostile the beam passes through
            foreach (var hit in Physics.SphereCastAll(origin, 2.6f, transform.forward, BeamRange))
            {
                var h = hit.collider.GetComponentInParent<Health>();
                if (h != null && !h.isPlayer)
                {
                    h.TakeDamage(BeamDps * Might * Time.deltaTime);
                    if (Random.value < 14f * Time.deltaTime)
                        ExplosionFactory.Sparks(hit.point, Accent);
                }
            }
            ChaseCamera.Shake(0.03f);
            if (Random.value < 6f * Time.deltaTime) GameManager.I.PlaySfx(SfxSynth.Laser, 0.3f);
            yield return null;
        }
        Destroy(go);
        Destroy(tip);
        Destroy(muzzleGlow);
        Destroy(tipLight.gameObject);
        _channel = null;
    }

    // ---------- Captain: 2s whirling sword storm ----------
    IEnumerator CutlassStorm()
    {
        var blades = new List<Transform>();
        var bladeMesh = NVMeshes.Wing(2.6f, 0.7f, 0.15f, 0.5f, 0.1f);
        var mat = NVAssets.Emissive(Accent, 3.5f);
        for (int i = 0; i < 7; i++)
        {
            var b = new GameObject("cutlass");
            b.AddComponent<MeshFilter>().sharedMesh = bladeMesh;
            b.AddComponent<MeshRenderer>().sharedMaterial = mat;
            blades.Add(b.transform);
        }
        GameManager.I.PlaySfx(SfxSynth.WaveUp, 0.7f);

        float t = 0f, tick = 0f;
        while (t < StormDuration && GameManager.I.Running && !GameManager.I.Paused)
        {
            t += Time.deltaTime;
            for (int i = 0; i < blades.Count; i++)
            {
                float a = t * 9f + i * Mathf.PI * 2f / blades.Count;
                float r = Mathf.Lerp(6f, StormRadius * 0.85f, Mathf.PingPong(t * 1.4f + i * 0.3f, 1f));
                Vector3 pos = transform.position + new Vector3(Mathf.Cos(a) * r, Mathf.Sin(a * 0.7f + i) * r * 0.4f, Mathf.Sin(a) * r);
                blades[i].position = pos;
                blades[i].rotation = Quaternion.LookRotation(pos - transform.position) * Quaternion.Euler(0f, 0f, a * Mathf.Rad2Deg * 2f);
            }
            tick -= Time.deltaTime;
            if (tick <= 0f)
            {
                tick = 0.2f;
                foreach (var h in SkillSystem.AllHostiles())
                    if (Vector3.Distance(transform.position, h.transform.position) < StormRadius + 4f)
                    {
                        h.TakeDamage(StormDps * 0.2f * Might);
                        ExplosionFactory.Sparks(h.transform.position, Accent);
                    }
            }
            yield return null;
        }
        foreach (var b in blades) if (b != null) Destroy(b.gameObject);
        _channel = null;
    }

    // ---------- Chef: homing pie ----------
    void LaunchPie()
    {
        var target = Missile.FindTarget(transform.position, 300f);
        var go = new GameObject("scaldingPie");
        go.transform.position = transform.position + transform.forward * 3f;
        var pie = go.AddComponent<HomingPie>();
        pie.Setup(transform.forward, target, PieDamage * Might, Accent);
        GameManager.I.PlaySfx(SfxSynth.Pickup, 0.5f);
    }

    // ---------- Lunar: light bullet + chain lightning on hit ----------
    void FireStormMark()
    {
        var go = new GameObject("stormMark");
        go.transform.position = transform.position + transform.forward * 3f;
        var bolt = go.AddComponent<StormMarkBolt>();
        bolt.Setup(transform.forward, StormMarkDamage * Might, ChainRadius, Accent, gameObject);
        GameManager.I.PlaySfx(SfxSynth.Laser, 0.6f);
    }
}

// Chef's pie: slow homing disc, single low-damage hit.
public class HomingPie : MonoBehaviour
{
    Vector3 _velocity;
    Transform _target;
    float _dmg, _life = 7f;
    Color _tint;

    public void Setup(Vector3 dir, Transform target, float dmg, Color tint)
    {
        _velocity = dir * 35f;
        _target = target;
        _dmg = dmg;
        _tint = tint;
        var disc = NVMeshes.SpherePart(gameObject, NVAssets.Emissive(new Color(1f, 0.6f, 0.3f), 3f), Vector3.zero, new Vector3(1.4f, 0.3f, 1.4f));
        disc.name = "pieDisc";
        var glow = NVAssets.Quad(NVAssets.AdditiveTinted(tint), 3.5f);
        glow.transform.SetParent(transform, false);
        glow.AddComponent<Billboard>();
        var trail = gameObject.AddComponent<TrailRenderer>();
        trail.time = 0.3f;
        trail.startWidth = 0.4f;
        trail.endWidth = 0.02f;
        trail.material = NVAssets.Additive;
        trail.startColor = tint;
        trail.endColor = new Color(tint.r, tint.g, tint.b, 0f);
    }

    void Update()
    {
        _life -= Time.deltaTime;
        if (_life <= 0f) { Destroy(gameObject); return; }
        transform.Rotate(0f, 640f * Time.deltaTime, 0f, Space.World);

        float speed = Mathf.Min(75f, _velocity.magnitude + 60f * Time.deltaTime);
        Vector3 dir = _velocity.normalized;
        if (_target != null)
            dir = Vector3.RotateTowards(dir, (_target.position - transform.position).normalized, 220f * Mathf.Deg2Rad * Time.deltaTime, 0f);
        _velocity = dir * speed;

        Vector3 step = _velocity * Time.deltaTime;
        if (Physics.Raycast(transform.position, step.normalized, out RaycastHit hit, step.magnitude + 0.5f))
        {
            var h = hit.collider.GetComponentInParent<Health>();
            if (h != null && !h.isPlayer) h.TakeDamage(_dmg);
            ExplosionFactory.Explode(hit.point, _tint, 0.7f);
            GameManager.I.PlaySfxAt(SfxSynth.Boom, hit.point, 0.4f);
            Destroy(gameObject);
            return;
        }
        transform.position += step;
    }
}

// Lunar's light bullet: on hitting a hostile, chain lightning strikes
// every enemy near the impact for the same damage.
public class StormMarkBolt : MonoBehaviour
{
    Vector3 _velocity;
    float _dmg, _chainRadius, _life = 3f;
    Color _tint;
    GameObject _owner;

    public void Setup(Vector3 dir, float dmg, float chainRadius, Color tint, GameObject owner)
    {
        _velocity = dir * 170f;
        _dmg = dmg;
        _chainRadius = chainRadius;
        _tint = tint;
        _owner = owner;
        var core = NVMeshes.SpherePart(gameObject, NVAssets.Emissive(Color.white, 4f), Vector3.zero, Vector3.one * 0.5f);
        core.name = "boltCore";
        var glow = NVAssets.Quad(NVAssets.AdditiveTinted(tint), 3f);
        glow.transform.SetParent(transform, false);
        glow.AddComponent<Billboard>();
        var trail = gameObject.AddComponent<TrailRenderer>();
        trail.time = 0.2f;
        trail.startWidth = 0.5f;
        trail.endWidth = 0.05f;
        trail.material = NVAssets.Additive;
        trail.startColor = tint;
        trail.endColor = new Color(tint.r, tint.g, tint.b, 0f);
    }

    void Update()
    {
        _life -= Time.deltaTime;
        if (_life <= 0f) { Destroy(gameObject); return; }

        Vector3 step = _velocity * Time.deltaTime;
        if (Physics.Raycast(transform.position, step.normalized, out RaycastHit hit, step.magnitude + 0.4f))
        {
            if (hit.collider.attachedRigidbody == null || hit.collider.attachedRigidbody.gameObject != _owner)
            {
                var direct = hit.collider.GetComponentInParent<Health>();
                if (direct != null && !direct.isPlayer)
                {
                    direct.TakeDamage(_dmg);
                    // the mark detonates: chain to everything nearby, same damage
                    foreach (var h in SkillSystem.AllHostiles())
                    {
                        if (h == direct) continue;
                        if (Vector3.Distance(hit.point, h.transform.position) > _chainRadius) continue;
                        h.TakeDamage(_dmg);
                        LightningArc.Show(new List<Vector3> { hit.point, h.transform.position }, 0.22f);
                        ExplosionFactory.Sparks(h.transform.position, _tint);
                    }
                    ExplosionFactory.Explode(hit.point, _tint, 0.9f);
                    GameManager.I.PlaySfxAt(SfxSynth.Hit, hit.point, 0.7f);
                }
                else
                    ExplosionFactory.Sparks(hit.point, _tint);
                Destroy(gameObject);
                return;
            }
        }
        transform.position += step;
    }
}
