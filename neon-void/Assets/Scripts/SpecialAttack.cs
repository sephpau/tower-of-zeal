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
    // anime-style beam: charge ball with halo rings, then a blinding
    // three-layer torrent wrapped in crackling lightning
    IEnumerator ZealBeam()
    {
        var rig = new GameObject("zealBeam");

        LineRenderer MakeLayer(float w0, float w1, Color c0, Color c1)
        {
            var lgo = new GameObject("layer");
            lgo.transform.SetParent(rig.transform, false);
            var l = lgo.AddComponent<LineRenderer>();
            l.material = NVAssets.Additive;
            l.startWidth = w0; l.endWidth = w1;
            l.startColor = c0; l.endColor = c1;
            l.enabled = false;
            return l;
        }
        var inner = MakeLayer(3.0f, 2.0f, Color.white, Color.white);
        var mid = MakeLayer(7f, 4.5f, new Color(0.8f, 0.95f, 1f, 0.8f), new Color(0.8f, 0.95f, 1f, 0.4f));
        var outer = MakeLayer(12f, 6f, new Color(Accent.r, Accent.g, Accent.b, 0.5f), new Color(Accent.r, Accent.g, Accent.b, 0.1f));

        // charge ball + halo rings at the muzzle
        var ball = NVAssets.Quad(NVAssets.AdditiveTinted(Color.white), 1f);
        ball.transform.SetParent(rig.transform, false);
        ball.AddComponent<Billboard>();
        var ballTint = NVAssets.Quad(NVAssets.AdditiveTinted(Accent), 1f);
        ballTint.transform.SetParent(rig.transform, false);
        ballTint.AddComponent<Billboard>();
        var rings = new List<Transform>();
        var ringMat = new Material(Shader.Find("Legacy Shaders/Particles/Additive"));
        ringMat.mainTexture = NVAssets.GlowTex;
        ringMat.SetColor("_TintColor", new Color(Accent.r, Accent.g, Accent.b, 0.7f));
        for (int i = 0; i < 3; i++)
        {
            var r = new GameObject("halo");
            r.transform.SetParent(rig.transform, false);
            r.AddComponent<MeshFilter>().sharedMesh = NVAssets.RingMesh(0.82f, 1f, 48);
            r.AddComponent<MeshRenderer>().sharedMaterial = ringMat;
            rings.Add(r.transform);
        }
        var tip = NVAssets.Quad(NVAssets.AdditiveTinted(Accent), 20f);
        tip.AddComponent<Billboard>();
        tip.SetActive(false);
        var tipLight = new GameObject("tipLight").AddComponent<Light>();
        tipLight.type = LightType.Point;
        tipLight.color = Accent;
        tipLight.intensity = 5f;
        tipLight.range = 36f;
        tipLight.enabled = false;

        void PlaceMuzzle(float ballSize, float ringScale, float t)
        {
            Vector3 origin = transform.position + transform.forward * 3.5f;
            ball.transform.position = origin;
            ball.transform.localScale = Vector3.one * ballSize;
            ballTint.transform.position = origin;
            ballTint.transform.localScale = Vector3.one * ballSize * 1.8f;
            for (int i = 0; i < rings.Count; i++)
            {
                rings[i].position = origin + transform.forward * (i - 1) * 1.2f;
                rings[i].rotation = Quaternion.LookRotation(transform.forward)
                    * Quaternion.Euler(90f + Mathf.Sin(t * 3f + i * 2f) * 28f, 0f, t * (140f + i * 60f));
                rings[i].localScale = Vector3.one * ringScale * (1f + i * 0.45f + Mathf.Sin(t * 8f + i) * 0.12f);
            }
        }

        // ---- charge-up (0.35s): the ball swells, halos tighten ----
        GameManager.I.PlaySfx(SfxSynth.WaveUp, 0.9f);
        float ct = 0f;
        while (ct < 0.35f && GameManager.I.Running && !GameManager.I.Paused)
        {
            ct += Time.deltaTime;
            float k = ct / 0.35f;
            PlaceMuzzle(Mathf.Lerp(2f, 11f, k * k), Mathf.Lerp(14f, 7f, k), ct * 6f);
            yield return null;
        }

        // ---- fire ----
        inner.enabled = mid.enabled = outer.enabled = true;
        tip.SetActive(true);
        tipLight.enabled = true;
        GameManager.I.PlaySfx(SfxSynth.BigBoom, 0.5f);

        float t2 = 0f, arcTimer = 0f;
        while (t2 < BeamDuration && GameManager.I.Running && !GameManager.I.Paused)
        {
            t2 += Time.deltaTime;
            Vector3 origin = transform.position + transform.forward * 3.5f;
            Vector3 end = origin + transform.forward * BeamRange;
            float pulse = 1f + Mathf.Sin(t2 * 26f) * 0.13f;
            foreach (var l in new[] { inner, mid, outer })
            {
                l.widthMultiplier = pulse;
                l.SetPositions(new[] { origin, end });
            }
            PlaceMuzzle(11f * pulse, 7f, 2f + t2 * 6f);
            tip.transform.position = end;
            tipLight.transform.position = end - transform.forward * 5f;

            // lightning crackle spiraling around the beam
            arcTimer -= Time.deltaTime;
            if (arcTimer <= 0f)
            {
                arcTimer = 0.09f;
                var pts = new List<Vector3>();
                float z = Random.Range(4f, 20f);
                float ang = Random.value * Mathf.PI * 2f;
                for (int i = 0; i < 6; i++)
                {
                    float rr = Random.Range(3f, 7f);
                    pts.Add(origin + transform.forward * z
                        + (transform.right * Mathf.Cos(ang) + transform.up * Mathf.Sin(ang)) * rr);
                    z += Random.Range(6f, 16f);
                    ang += Random.Range(0.5f, 1.4f);
                }
                LightningArc.Show(pts, 0.16f);
            }

            foreach (var hit in Physics.SphereCastAll(origin, 3.2f, transform.forward, BeamRange))
            {
                var h = hit.collider.GetComponentInParent<Health>();
                if (h != null && !h.isPlayer)
                {
                    h.TakeDamage(BeamDps * Might * Time.deltaTime);
                    if (Random.value < 14f * Time.deltaTime)
                        ExplosionFactory.Sparks(hit.point, Accent);
                }
            }
            ChaseCamera.Shake(0.04f);
            if (Random.value < 6f * Time.deltaTime) GameManager.I.PlaySfx(SfxSynth.Laser, 0.3f);
            yield return null;
        }
        Destroy(rig);
        Destroy(tip);
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
