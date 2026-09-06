using UnityEngine;

// Enemy hulls, all lathe/wing built. Interceptor (fast drone), Gunship
// (heavy, wave 4+), and the wave-10 boss: the Void Dreadnought.
public static class EnemyFactory
{

    // Shared cute-monster builder: round body, glowing pupils, fangs,
    // flapping wings. Angry variant gets brows and back spikes.
    static void RoundMonster(GameObject go, Color bodyCol, Color wingCol, Color pupilCol,
        float scale, float flapHz, float flapDeg, bool angry)
    {
        var bodyMat = NVAssets.Standard(bodyCol, 0.25f, 0.55f);
        bodyMat.EnableKeyword("_EMISSION");
        bodyMat.SetColor("_EmissionColor", bodyCol * 0.35f);
        var wingMat = NVAssets.Standard(wingCol, 0.3f, 0.5f);
        wingMat.EnableKeyword("_EMISSION");
        wingMat.SetColor("_EmissionColor", wingCol * 0.35f);
        var whiteMat = NVAssets.Standard(new Color(0.95f, 0.93f, 0.88f), 0.05f, 0.5f);
        var pupilMat = NVAssets.Emissive(pupilCol, 3.2f);
        var darkMat = NVAssets.Standard(bodyCol * 0.35f, 0.2f, 0.6f);

        NVMeshes.SpherePart(go, bodyMat, Vector3.zero, new Vector3(2.2f, 2.0f, 2.1f) * scale);

        foreach (float side in new[] { -1f, 1f })
        {
            NVMeshes.SpherePart(go, whiteMat, new Vector3(side * 0.45f, 0.35f, 0.92f) * scale, Vector3.one * 0.5f * scale);
            NVMeshes.SpherePart(go, pupilMat, new Vector3(side * 0.42f, 0.35f, 1.16f) * scale, Vector3.one * 0.22f * scale);
            var fang = NVMeshes.Part(go, NVMeshes.Wing(0.28f * scale, 0.22f * scale, 0.05f, 0.02f, 0.1f), whiteMat,
                new Vector3(side * 0.32f, -0.42f, 0.95f) * scale, new Vector3(90f, 0f, side > 0 ? -80f : -100f), Vector3.one);
            fang.name = "fang";
            if (angry)
            {
                // slanted brow over each eye
                var brow = GameObject.CreatePrimitive(PrimitiveType.Cube);
                Object.Destroy(brow.GetComponent<Collider>());
                brow.transform.SetParent(go.transform, false);
                brow.transform.localPosition = new Vector3(side * 0.45f, 0.62f, 0.98f) * scale;
                brow.transform.localRotation = Quaternion.Euler(0f, 0f, side * -22f);
                brow.transform.localScale = new Vector3(0.55f, 0.12f, 0.18f) * scale;
                brow.GetComponent<MeshRenderer>().sharedMaterial = darkMat;
            }
            else
                NVMeshes.SpherePart(go, wingMat, new Vector3(side * 0.5f, 0.95f, 0.1f) * scale, new Vector3(0.22f, 0.4f, 0.22f) * scale);
        }
        if (angry)
            for (int i = 0; i < 3; i++)   // back spikes
                NVMeshes.SpherePart(go, darkMat,
                    new Vector3((i - 1) * 0.4f, 0.9f, -0.35f) * scale, new Vector3(0.2f, 0.55f, 0.2f) * scale);

        var wingMesh = NVMeshes.Wing(1.9f * scale, 1.1f * scale, 0.35f * scale, 0.7f * scale, 0.1f);
        var flapWings = new Transform[2];
        for (int i = 0; i < 2; i++)
        {
            float side = i == 0 ? -1f : 1f;
            var pivot = new GameObject(i == 0 ? "wing_L" : "wing_R");
            pivot.transform.SetParent(go.transform, false);
            pivot.transform.localPosition = new Vector3(side * 0.95f, 0.25f, -0.1f) * scale;
            NVMeshes.Part(pivot, wingMesh, wingMat, Vector3.zero,
                new Vector3(0f, 0f, side > 0 ? 0f : 180f), Vector3.one);
            flapWings[i] = pivot.transform;
        }
        var flap = go.AddComponent<MobFlap>();
        flap.wingL = flapWings[0];
        flap.wingR = flapWings[1];
        flap.body = go.transform.GetChild(0);
        flap.flapHz = flapHz;
        flap.flapDeg = flapDeg;

        var glow = NVAssets.Quad(NVAssets.AdditiveTinted(pupilCol), 1.3f * scale);
        glow.transform.SetParent(go.transform, false);
        glow.transform.localPosition = new Vector3(0f, -0.2f, -1.3f) * scale;
        glow.AddComponent<Billboard>();

        NVOutline.Add(go, NVOutline.Hostile);
    }

    public static GameObject BuildInterceptor(Vector3 pos, int wave)
    {
        var go = new GameObject("interceptor");
        go.transform.position = pos;

        RoundMonster(go,
            new Color(0.5f, 0.32f, 0.85f),    // purple body
            new Color(0.32f, 0.18f, 0.6f),
            new Color(1f, 0.3f, 0.8f),        // pink pupils
            1f, 5f, 38f, angry: false);

        Rig(go, 1.7f, 26f + wave * 4f);
        Armament(go, 0.14f, 70f, Mathf.Min(16f, 8f + wave), new Color(1f, 0.35f, 0.8f), new Vector3(0f, 0f, 2.4f), 3);

        var ai = go.AddComponent<EnemyAI>();
        ai.speed = Mathf.Min(30f, 20f + wave * 1.2f);
        ai.scoreValue = 100 + wave * 10;
        return go;
    }

    public static GameObject BuildGunship(Vector3 pos, int wave)
    {
        var go = new GameObject("gunship");
        go.transform.position = pos;

        RoundMonster(go,
            new Color(0.82f, 0.14f, 0.12f),   // red body
            new Color(0.5f, 0.08f, 0.08f),
            new Color(1f, 0.72f, 0.15f),      // burning amber pupils
            1.45f, 3.2f, 30f, angry: true);

        Rig(go, 2.4f, 90f + wave * 10f);
        Armament(go, 0.16f, 60f, Mathf.Min(20f, 12f + wave), new Color(1f, 0.6f, 0.2f), new Vector3(0f, -0.1f, 3f), 5);

        var ai = go.AddComponent<EnemyAI>();
        ai.speed = 15f;
        ai.turnDegPerSec = 55f;
        ai.orbitDistance = 75f;
        ai.fireRange = 160f;
        ai.scoreValue = 300 + wave * 15;
        return go;
    }

    // Elite Hunter: v1's elite ported — a huge angry blue monster that
    // roams in every 90 seconds. Tanky, hits hard, drops a hoard.
    public static GameObject BuildElite(Vector3 pos, int wave)
    {
        var go = new GameObject("elite");
        go.transform.position = pos;

        RoundMonster(go,
            new Color(0.16f, 0.42f, 0.95f),   // deep blue body
            new Color(0.08f, 0.22f, 0.6f),
            new Color(0.55f, 0.95f, 1f),      // icy glowing pupils
            1.9f, 2.6f, 46f, angry: true);

        Rig(go, 3.4f, (26f + wave * 4f) * 10f);
        Armament(go, 0.15f, 78f, Mathf.Min(26f, (8f + wave) * 1.6f), new Color(0.45f, 0.8f, 1f), new Vector3(0f, 0f, 4.2f), 4);

        var ai = go.AddComponent<EnemyAI>();
        ai.speed = 23f;
        ai.turnDegPerSec = 70f;
        ai.orbitDistance = 60f;
        ai.fireRange = 150f;
        ai.scoreValue = 500 + wave * 40;
        go.AddComponent<EliteMark>();
        go.AddComponent<EliteJuke>();   // takes enough hits, dashes out of your aim
        return go;
    }

    public static GameObject BuildDreadnought(Vector3 pos)
    {
        var go = new GameObject("dreadnought");
        go.transform.position = pos;

        var hull = NVAssets.Standard(new Color(0.13f, 0.1f, 0.16f), 0.8f, 0.3f);
        var red = NVAssets.Emissive(new Color(1f, 0.15f, 0.25f), 3.5f);

        // 45-unit capital hull
        Vector2[] body = {
            new Vector2(0.001f,  23f),
            new Vector2(2.2f,    17f),
            new Vector2(3.6f,     8f),
            new Vector2(4.2f,    -2f),
            new Vector2(3.8f,   -12f),
            new Vector2(2.8f,   -19f),
            new Vector2(1.8f,   -22f),
            new Vector2(0.001f, -22f),
        };
        NVMeshes.Part(go, NVMeshes.Lathe(body, 28), hull, Vector3.zero, Vector3.zero, new Vector3(1f, 0.55f, 1f));

        // bridge tower + red spine strips
        NVMeshes.SpherePart(go, hull, new Vector3(0f, 2.4f, -8f), new Vector3(3f, 2f, 6f));
        NVMeshes.SpherePart(go, red, new Vector3(0f, 3.4f, -8f), new Vector3(1.4f, 0.6f, 2.6f));
        for (int i = 0; i < 3; i++)
        {
            var strip = GameObject.CreatePrimitive(PrimitiveType.Cube);
            Object.Destroy(strip.GetComponent<Collider>());
            strip.transform.SetParent(go.transform, false);
            strip.transform.localPosition = new Vector3(0f, 1.5f, 12f - i * 11f);
            strip.transform.localScale = new Vector3(0.35f, 0.12f, 7f);
            strip.GetComponent<MeshRenderer>().sharedMaterial = red;
        }

        // engine block
        foreach (float side in new[] { -1.6f, 0f, 1.6f })
        {
            var glow = NVAssets.Quad(NVAssets.AdditiveTinted(new Color(1f, 0.25f, 0.35f)), 3.4f);
            glow.transform.SetParent(go.transform, false);
            glow.transform.localPosition = new Vector3(side, 0f, -23.5f);
            glow.AddComponent<Billboard>();
        }

        // four turrets with muzzles — BossAI aims these
        var turretMuzzles = new Transform[4];
        Vector3[] tPos = {
            new Vector3(-2.4f, 1.6f,  6f), new Vector3(2.4f, 1.6f,  6f),
            new Vector3(-2.6f, 1.4f, -3f), new Vector3(2.6f, 1.4f, -3f),
        };
        for (int i = 0; i < 4; i++)
        {
            var turret = NVMeshes.SpherePart(go, hull, tPos[i], Vector3.one * 1.6f);
            NVMeshes.SpherePart(turret.gameObject, red, new Vector3(0f, 0f, 0.45f), new Vector3(0.4f, 0.4f, 0.5f));
            var m = new GameObject("tmuzzle").transform;
            m.SetParent(turret.transform, false);
            m.localPosition = new Vector3(0f, 0f, 0.8f);
            turretMuzzles[i] = m;
        }

        // Doom's own hull (Tripo export faces -Z, hence the half turn)
        BossShipModel.Mount(go, "doom", 46f, 180f, false);

        var col = go.AddComponent<BoxCollider>();
        col.size = new Vector3(9f, 5f, 46f);

        var rb = go.AddComponent<Rigidbody>();
        rb.useGravity = false;
        rb.mass = 400f;
        rb.linearDamping = 0f;
        rb.angularDamping = 3f;

        var h = go.AddComponent<Health>();
        h.Configure(1500f, 8000f);
        h.shieldRegenPerSec = 22f;

        var boss = go.AddComponent<BossAI>();
        boss.turretMuzzles = turretMuzzles;
        NVOutline.Add(go, NVOutline.Hostile);
        return go;
    }

    // The three Zeal bosses — distinct silhouettes per legend.
    public static GameObject BuildMiniboss(Vector3 pos, ZealData.BossDef def)
    {
        var go = new GameObject("boss-" + def.id);
        go.transform.position = pos;
        var accent = NVAssets.Emissive(def.tint, 3.5f);

        if (def.id == "smuggler")
        {
            // long stealth dart — fade-capable hull for the cloak
            var hull = NVAssets.StandardFade(new Color(0.16f, 0.1f, 0.26f, 1f), 0.8f, 0.25f);
            Vector2[] body = {
                new Vector2(0.001f, 5.5f), new Vector2(0.5f, 2.5f), new Vector2(0.9f, 0f),
                new Vector2(0.7f, -2.5f), new Vector2(0.4f, -3.6f), new Vector2(0.001f, -3.6f) };
            NVMeshes.Part(go, NVMeshes.Lathe(body, 20), hull, Vector3.zero, Vector3.zero, new Vector3(1.6f, 0.7f, 1.6f));
            var wing = NVMeshes.Wing(4.5f, 3f, 0.8f, 3f, 0.18f);
            NVMeshes.Part(go, wing, hull, new Vector3(0.6f, 0f, -0.5f), new Vector3(0f, 0f, -8f), Vector3.one);
            NVMeshes.Part(go, wing, hull, new Vector3(-0.6f, 0f, -0.5f), new Vector3(0f, 0f, 188f), Vector3.one);
            NVMeshes.SpherePart(go, accent, new Vector3(0f, 0.5f, 1.5f), new Vector3(0.9f, 0.5f, 1.6f));
            Rig(go, 5f, def.hp);
        }
        else if (def.id == "gruyere")
        {
            // carnival wheel: hub + spinning ring + spoke lights
            var hull = NVAssets.Standard(new Color(0.3f, 0.18f, 0.08f), 0.6f, 0.35f);
            NVMeshes.SpherePart(go, hull, Vector3.zero, new Vector3(4f, 4f, 3f));
            NVMeshes.SpherePart(go, accent, new Vector3(0f, 0f, 1.8f), Vector3.one * 1.6f);
            var ringGo = new GameObject("wheel");
            ringGo.transform.SetParent(go.transform, false);
            ringGo.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
            ringGo.AddComponent<MeshFilter>().sharedMesh = NVAssets.RingMesh(6.5f, 8.5f, 48);
            ringGo.AddComponent<MeshRenderer>().sharedMaterial = accent;
            for (int i = 0; i < 8; i++)
            {
                float a = i / 8f * Mathf.PI * 2f;
                NVMeshes.SpherePart(go, accent, new Vector3(Mathf.Cos(a) * 7.5f, Mathf.Sin(a) * 7.5f, 0f), Vector3.one * 1.1f);
            }
            Rig(go, 8f, def.hp);
        }
        else
        {
            // Garrison: brutalist void hulk with a burning core
            var hull = NVAssets.Standard(new Color(0.1f, 0.07f, 0.14f), 0.85f, 0.3f);
            Vector2[] body = {
                new Vector2(0.001f, 6f), new Vector2(2.2f, 3f), new Vector2(3.2f, -1f),
                new Vector2(2.6f, -4.5f), new Vector2(1.5f, -6f), new Vector2(0.001f, -6f) };
            NVMeshes.Part(go, NVMeshes.Lathe(body, 10), hull, Vector3.zero, Vector3.zero, Vector3.one);  // low segs = brutalist facets
            NVMeshes.SpherePart(go, accent, Vector3.zero, Vector3.one * 2.6f);
            for (int i = 0; i < 4; i++)
            {
                float a = i / 4f * Mathf.PI * 2f + 0.4f;
                var spike = GameObject.CreatePrimitive(PrimitiveType.Cube);
                Object.Destroy(spike.GetComponent<Collider>());
                spike.transform.SetParent(go.transform, false);
                spike.transform.localPosition = new Vector3(Mathf.Cos(a) * 3.4f, Mathf.Sin(a) * 3.4f, -1f);
                spike.transform.localRotation = Quaternion.Euler(0f, 0f, a * Mathf.Rad2Deg);
                spike.transform.localScale = new Vector3(3.5f, 0.6f, 0.6f);
                spike.GetComponent<MeshRenderer>().sharedMaterial = hull;
            }
            var glow = NVAssets.Quad(NVAssets.AdditiveTinted(def.tint), 10f);
            glow.transform.SetParent(go.transform, false);
            glow.AddComponent<Billboard>();
            Rig(go, 7f, def.hp);
        }

        // each legend's own hull replaces the placeholder silhouette when it ships
        BossShipModel.Mount(go, def.id, def.id == "gruyere" ? 16f : (def.id == "smuggler" ? 15f : 13f), 0f, def.id == "smuggler");

        var rb = go.GetComponent<Rigidbody>();
        rb.mass = 60f;
        var boss = go.AddComponent<MinibossAI>();
        boss.Configure(def);
        if (def.id != "smuggler")   // the cloaking boss keeps its vanishing act
            NVOutline.Add(go, NVOutline.Hostile);
        return go;
    }

    // shared: collider + rigidbody + health
    static void Rig(GameObject go, float radius, float hp)
    {
        var col = go.AddComponent<SphereCollider>();
        col.radius = radius;
        var rb = go.AddComponent<Rigidbody>();
        rb.useGravity = false;
        rb.linearDamping = 0f;
        rb.angularDamping = 2f;
        var h = go.AddComponent<Health>();
        h.Configure(0f, hp);
    }

    static void Armament(GameObject go, float interval, float speed, float damage, Color color, Vector3 muzzlePos, int burst)
    {
        var w = go.AddComponent<Weapon>();
        w.isPlayerWeapon = false;
        w.fireInterval = interval;
        w.projectileSpeed = speed;
        w.damage = damage;
        w.boltColor = color;
        var muzzle = new GameObject("muzzle").transform;
        muzzle.SetParent(go.transform, false);
        muzzle.localPosition = muzzlePos;
        w.muzzles = new[] { muzzle };
        // burst size is read by EnemyAI when it's added right after this
        go.AddComponent<BurstConfig>().burstSize = burst;
    }
}

public class BurstConfig : MonoBehaviour
{
    public int burstSize = 3;
}

// Team-color rims: clones each mesh with the inverted-hull outline shader.
// Red marks hostiles, blue marks allies.
public static class NVOutline
{
    public static readonly Color Hostile = new Color(1f, 0.15f, 0.15f);
    public static readonly Color Ally = new Color(0.25f, 0.6f, 1f);

    static Shader _shader;

    public static void Add(GameObject root, Color color, float width = 0.035f)
    {
        if (_shader == null) _shader = Resources.Load<Shader>("NVOutline");
        if (_shader == null) return;
        var mat = new Material(_shader);
        mat.SetColor("_Color", color);
        mat.SetFloat("_Width", width);
        // the shader extrudes in object space, so imported hulls (tiny meshes under a
        // big scale) need the width divided by their world scale to keep the same rim
        var byScale = new System.Collections.Generic.Dictionary<int, Material>();
        foreach (var mf in root.GetComponentsInChildren<MeshFilter>())
        {
            if (mf.sharedMesh == null || mf.name == "outline" || mf.name == "guardBubble") continue;
            var mr = mf.GetComponent<MeshRenderer>();
            if (mr == null || !mr.enabled) continue;   // hidden placeholder geometry gets no rim
            if (mf.GetComponent<Billboard>() != null) continue;   // glow quads stay clean
            float s = Mathf.Max(0.0001f, mf.transform.lossyScale.x);
            Material use = mat;
            if (Mathf.Abs(s - 1f) > 0.01f)
            {
                int key = Mathf.RoundToInt(s * 1000f);
                if (!byScale.TryGetValue(key, out use))
                {
                    use = new Material(_shader);
                    use.SetColor("_Color", color);
                    use.SetFloat("_Width", width / s);
                    byScale[key] = use;
                }
            }
            var o = new GameObject("outline");
            o.transform.SetParent(mf.transform, false);
            o.AddComponent<MeshFilter>().sharedMesh = mf.sharedMesh;
            o.AddComponent<MeshRenderer>().sharedMaterial = use;
        }
    }
}

// tags the elite so its death pays out v1-style rewards
public class EliteMark : MonoBehaviour { }

// the elite's signature move: rack up hits on it and it snap-dashes
// sideways out of your aim with a spark flash and a whoosh
public class EliteJuke : MonoBehaviour
{
    EnemyAI _ai;
    float _cooldown;
    int _hits;

    void Awake()
    {
        _ai = GetComponent<EnemyAI>();
        var h = GetComponent<Health>();
        if (h != null) h.OnDamaged += OnHit;
    }

    void Update() => _cooldown -= Time.deltaTime;

    void OnHit(Health h, float amount)
    {
        if (_ai == null || _cooldown > 0f) return;
        if (++_hits < 4) return;   // the fourth hit in a window triggers the juke
        _hits = 0;
        _cooldown = 2.2f;
        Vector3 side = Vector3.Cross(transform.forward, Vector3.up).normalized;
        if (side.sqrMagnitude < 0.01f) side = transform.right;
        side *= UnityEngine.Random.value < 0.5f ? -1f : 1f;
        _ai.jukeVelocity = side * 85f + transform.forward * 10f;
        _ai.jukeTimer = 0.35f;
        ExplosionFactory.Sparks(transform.position, new Color(0.55f, 0.95f, 1f));
        GameManager.I.PlaySfxAt(SfxSynth.Dash, transform.position, 0.9f);
    }
}

// Wing flapping + body bob for the round monster mobs.
// Each instance gets its own phase so a swarm doesn't flap in unison.
public class MobFlap : MonoBehaviour
{
    public Transform wingL, wingR, body;
    public float flapDeg = 38f;
    public float flapHz = 5f;

    float _phase;
    Vector3 _bodyBase;

    void Start()
    {
        _phase = Random.value * Mathf.PI * 2f;
        if (body != null) _bodyBase = body.localPosition;
    }

    void Update()
    {
        float s = Mathf.Sin((Time.time * flapHz + _phase) * Mathf.PI * 2f);
        float a = s * flapDeg;
        if (wingL != null) wingL.localRotation = Quaternion.Euler(0f, 0f, -a);
        if (wingR != null) wingR.localRotation = Quaternion.Euler(0f, 0f, a);
        if (body != null)
            body.localPosition = _bodyBase + Vector3.up * Mathf.Sin((Time.time * flapHz * 0.5f + _phase) * Mathf.PI * 2f) * 0.08f;
    }
}
