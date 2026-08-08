using System.Collections.Generic;
using UnityEngine;

// Small self-contained effect actors used by SkillSystem.

// Deck Cannon: plasma shell that flies to a point and explodes in an AoE.
public class CannonShell : MonoBehaviour
{
    Vector3 _target;
    float _speed = 90f, _dmg, _radius;
    GameObject _owner;

    public static void Launch(Vector3 from, Vector3 target, float dmg, float radius, GameObject owner)
    {
        var go = new GameObject("shell");
        go.transform.position = from;
        var s = go.AddComponent<CannonShell>();
        s._target = target;
        s._dmg = dmg;
        s._radius = radius;
        s._owner = owner;
        var c = new Color(1f, 0.6f, 0.2f);
        NVMeshes.SpherePart(go, NVAssets.Emissive(c, 3f), Vector3.zero, Vector3.one * 0.8f);
        var trail = go.AddComponent<TrailRenderer>();
        trail.time = 0.3f;
        trail.startWidth = 0.4f;
        trail.endWidth = 0.02f;
        trail.material = NVAssets.Additive;
        trail.startColor = c;
        trail.endColor = new Color(c.r, c.g, c.b, 0f);
    }

    void Update()
    {
        Vector3 to = _target - transform.position;
        float step = _speed * Time.deltaTime;
        if (to.magnitude <= step) { Detonate(); return; }
        transform.position += to.normalized * step;
    }

    void Detonate()
    {
        ExplosionFactory.Explode(transform.position, new Color(1f, 0.6f, 0.2f), _radius / 8f, _radius > 14f);
        GameManager.I.PlaySfxAt(SfxSynth.Boom, transform.position, 0.6f);
        foreach (var h in SkillSystem.AllHostiles())
            if (Vector3.Distance(transform.position, h.transform.position) < _radius + 5f)
                h.TakeDamage(_dmg);
        Destroy(gameObject);
    }
}

// Scalding Pie: spinning disc that flies out then boomerangs back through everything.
public class BoomerangDisc : MonoBehaviour
{
    Transform _shipRef;
    Vector3 _dir;
    float _speed, _dmg, _radius, _flightTime;
    bool _returning;
    readonly Dictionary<Health, float> _hitCd = new Dictionary<Health, float>();

    public static void Launch(Transform ship, Vector3 dir, float dmg, float speed, float radius)
    {
        var go = new GameObject("disc");
        go.transform.position = ship.position + dir * 3f;
        var d = go.AddComponent<BoomerangDisc>();
        d._shipRef = ship;
        d._dir = dir;
        d._dmg = dmg;
        d._speed = speed;
        d._radius = radius;
        var c = new Color(1f, 0.55f, 0.35f);
        var disc = NVMeshes.SpherePart(go, NVAssets.Emissive(c, 3f), Vector3.zero, new Vector3(radius, 0.25f, radius));
        disc.name = "discMesh";
        var glow = NVAssets.Quad(NVAssets.AdditiveTinted(c), radius * 3f);
        glow.transform.SetParent(go.transform, false);
        glow.AddComponent<Billboard>();
    }

    void Update()
    {
        transform.Rotate(0f, 720f * Time.deltaTime, 0f, Space.Self);
        _flightTime += Time.deltaTime;
        if (!_returning)
        {
            transform.position += _dir * _speed * Time.deltaTime;
            if (_flightTime > 0.55f) _returning = true;
        }
        else
        {
            if (_shipRef == null) { Destroy(gameObject); return; }
            Vector3 to = _shipRef.position - transform.position;
            if (to.magnitude < 3f) { Destroy(gameObject); return; }
            transform.position += to.normalized * _speed * 1.15f * Time.deltaTime;
        }

        foreach (var h in SkillSystem.AllHostiles())
        {
            if (Vector3.Distance(transform.position, h.transform.position) > _radius + 3.5f) continue;
            if (_hitCd.TryGetValue(h, out float until) && Time.time < until) continue;
            _hitCd[h] = Time.time + 0.4f;
            h.TakeDamage(_dmg);
            ExplosionFactory.Sparks(h.transform.position, new Color(1f, 0.55f, 0.35f));
        }
    }
}

// Storm Mark: a fading multi-segment lightning arc.
public class LightningArc : MonoBehaviour
{
    LineRenderer _lr;
    float _life;

    public static void Show(List<Vector3> points, float life)
    {
        var go = new GameObject("arc");
        var arc = go.AddComponent<LightningArc>();
        arc._life = life;
        var lr = go.AddComponent<LineRenderer>();
        arc._lr = lr;
        // jittered midpoints for the lightning look
        var jag = new List<Vector3>();
        for (int i = 0; i < points.Count - 1; i++)
        {
            jag.Add(points[i]);
            Vector3 mid = (points[i] + points[i + 1]) * 0.5f + Random.insideUnitSphere * 2f;
            jag.Add(mid);
        }
        jag.Add(points[points.Count - 1]);
        lr.positionCount = jag.Count;
        lr.SetPositions(jag.ToArray());
        lr.startWidth = 0.5f;
        lr.endWidth = 0.15f;
        lr.material = NVAssets.Additive;
        lr.startColor = new Color(0.7f, 0.8f, 1f);
        lr.endColor = new Color(0.5f, 0.6f, 1f);
        Destroy(go, life + 0.05f);
    }

    void Update()
    {
        _life -= Time.deltaTime;
        if (_lr != null)
        {
            var c = _lr.startColor; c.a = Mathf.Clamp01(_life / 0.18f);
            _lr.startColor = c; _lr.endColor = c;
        }
    }
}

// Corsair Cutlass: an expanding arc flash in the slash direction.
public class SweepVisual : MonoBehaviour
{
    float _life = 0.25f, _range;
    MeshRenderer _mr;

    public static void Show(Transform ship, Vector3 dir, float range, float halfAngle = 55f)
    {
        var go = new GameObject("sweep");
        go.transform.position = ship.position;
        go.transform.rotation = Quaternion.LookRotation(dir, ship.up);
        var sv = go.AddComponent<SweepVisual>();
        sv._range = range;
        var mf = go.AddComponent<MeshFilter>();
        mf.sharedMesh = ArcMesh(Mathf.Min(halfAngle, 180f));
        sv._mr = go.AddComponent<MeshRenderer>();
        var mat = new Material(Shader.Find("Legacy Shaders/Particles/Additive"));
        mat.mainTexture = NVAssets.GlowTex;
        mat.SetColor("_TintColor", new Color(0.4f, 0.9f, 1f, 0.6f));
        sv._mr.sharedMaterial = mat;
        go.transform.localScale = Vector3.one * 2f;
    }

    static Mesh ArcMesh(float halfAngleDeg)
    {
        const int SEGS = 20;
        var verts = new Vector3[SEGS + 2];
        var tris = new int[SEGS * 3];
        verts[0] = Vector3.zero;
        for (int i = 0; i <= SEGS; i++)
        {
            float a = Mathf.Lerp(-halfAngleDeg, halfAngleDeg, i / (float)SEGS) * Mathf.Deg2Rad;
            verts[i + 1] = new Vector3(Mathf.Sin(a), 0f, Mathf.Cos(a));
        }
        for (int i = 0; i < SEGS; i++)
        {
            tris[i * 3] = 0; tris[i * 3 + 1] = i + 1; tris[i * 3 + 2] = i + 2;
        }
        var m = new Mesh { vertices = verts, triangles = tris };
        m.RecalculateNormals();
        return m;
    }

    void Update()
    {
        _life -= Time.deltaTime;
        if (_life <= 0f) { Destroy(gameObject); return; }
        float k = 1f - _life / 0.25f;
        transform.localScale = Vector3.one * Mathf.Lerp(2f, _range, k);
        var c = _mr.sharedMaterial.GetColor("_TintColor");
        c.a = 0.6f * (1f - k);
        _mr.sharedMaterial.SetColor("_TintColor", c);
    }
}

// XP shard dropped by kills — magnets to the player.
public class XpOrb : MonoBehaviour
{
    public int xp = 1;
    float _life = 30f;
    Transform _player;

    public static void Drop(Vector3 pos, int xp)
    {
        if (CoopSync.HostActive) CoopSync.I.QueueOrb(pos, xp);   // mirror to the co-op partner
        var go = new GameObject("xp");
        go.transform.position = pos + Random.insideUnitSphere * 2f;
        var o = go.AddComponent<XpOrb>();
        o.xp = xp;
        var c = new Color(0.4f, 0.95f, 1f);
        NVMeshes.SpherePart(go, NVAssets.Emissive(c, 3f), Vector3.zero, new Vector3(0.35f, 0.7f, 0.35f));
        var glow = NVAssets.Quad(NVAssets.AdditiveTinted(c), 2f);
        glow.transform.SetParent(go.transform, false);
        glow.AddComponent<Billboard>();
    }

    void Start()
    {
        var ship = FindAnyObjectByType<ShipController>();
        if (ship != null) _player = ship.transform;
    }

    void Update()
    {
        _life -= Time.deltaTime;
        if (_life <= 0f) { Destroy(gameObject); return; }
        transform.Rotate(0f, 200f * Time.deltaTime, 0f, Space.World);
        if (_player == null || !GameManager.I.Running) return;

        float magnetRange = 26f;
        var skills = _player.GetComponent<SkillSystem>();
        if (skills != null) magnetRange *= skills.MagnetMult;

        Vector3 to = _player.position - transform.position;
        float d = to.magnitude;
        if (d < magnetRange)
            transform.position += to.normalized * Mathf.Lerp(45f, 10f, d / magnetRange) * Time.deltaTime;
        if (d < 3.5f)
        {
            GameManager.I.GainXp(xp);
            Destroy(gameObject);
        }
    }
}
