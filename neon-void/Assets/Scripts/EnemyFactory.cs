using UnityEngine;

// Enemy hulls, all lathe/wing built. Interceptor (fast drone), Gunship
// (heavy, wave 4+), and the wave-10 boss: the Void Dreadnought.
public static class EnemyFactory
{
    public static GameObject BuildInterceptor(Vector3 pos, int wave)
    {
        var go = new GameObject("interceptor");
        go.transform.position = pos;

        // cute round purple monster with flapping wings
        var bodyMat = NVAssets.Standard(new Color(0.5f, 0.32f, 0.85f), 0.25f, 0.55f);
        bodyMat.EnableKeyword("_EMISSION");
        bodyMat.SetColor("_EmissionColor", new Color(0.16f, 0.06f, 0.32f));
        var wingMat = NVAssets.Standard(new Color(0.32f, 0.18f, 0.6f), 0.3f, 0.5f);
        wingMat.EnableKeyword("_EMISSION");
        wingMat.SetColor("_EmissionColor", new Color(0.1f, 0.04f, 0.24f));
        var whiteMat = NVAssets.Standard(new Color(0.95f, 0.93f, 0.88f), 0.05f, 0.5f);
        var pink = NVAssets.PinkEmissive;

        // round body
        NVMeshes.SpherePart(go, bodyMat, Vector3.zero, new Vector3(2.2f, 2.0f, 2.1f));

        // big eyes with glowing pupils — reads hostile at range
        foreach (float side in new[] { -1f, 1f })
        {
            NVMeshes.SpherePart(go, whiteMat, new Vector3(side * 0.45f, 0.35f, 0.92f), Vector3.one * 0.5f);
            NVMeshes.SpherePart(go, pink, new Vector3(side * 0.42f, 0.35f, 1.16f), Vector3.one * 0.22f);
            // fangs
            var fang = NVMeshes.Part(go, NVMeshes.Wing(0.28f, 0.22f, 0.05f, 0.02f, 0.1f), whiteMat,
                new Vector3(side * 0.32f, -0.42f, 0.95f), new Vector3(90f, 0f, side > 0 ? -80f : -100f), Vector3.one);
            fang.name = "fang";
            // tiny horn nubs
            NVMeshes.SpherePart(go, wingMat, new Vector3(side * 0.5f, 0.95f, 0.1f), new Vector3(0.22f, 0.4f, 0.22f));
        }

        // flapping wings: pivot object at the shoulder, mesh extends outward
        var wingMesh = NVMeshes.Wing(1.9f, 1.1f, 0.35f, 0.7f, 0.1f);
        var flapWings = new Transform[2];
        for (int i = 0; i < 2; i++)
        {
            float side = i == 0 ? -1f : 1f;
            var pivot = new GameObject(i == 0 ? "wing_L" : "wing_R");
            pivot.transform.SetParent(go.transform, false);
            pivot.transform.localPosition = new Vector3(side * 0.95f, 0.25f, -0.1f);
            NVMeshes.Part(pivot, wingMesh, wingMat, Vector3.zero,
                new Vector3(0f, 0f, side > 0 ? 0f : 180f), Vector3.one);
            flapWings[i] = pivot.transform;
        }
        var flap = go.AddComponent<MobFlap>();
        flap.wingL = flapWings[0];
        flap.wingR = flapWings[1];
        flap.body = go.transform.GetChild(0);

        var glow = NVAssets.Quad(NVAssets.AdditiveTinted(new Color(1f, 0.4f, 0.85f)), 1.3f);
        glow.transform.SetParent(go.transform, false);
        glow.transform.localPosition = new Vector3(0f, -0.2f, -1.3f);
        glow.AddComponent<Billboard>();

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

        // burnt orange with an ember glow
        var hull = NVAssets.Standard(new Color(0.55f, 0.24f, 0.06f), 0.7f, 0.35f);
        hull.EnableKeyword("_EMISSION");
        hull.SetColor("_EmissionColor", new Color(0.3f, 0.1f, 0.02f));
        var orange = NVAssets.Emissive(new Color(1f, 0.55f, 0.15f), 3f);

        Vector2[] body = {
            new Vector2(0.001f,  2.6f),
            new Vector2(0.5f,    1.6f),
            new Vector2(0.75f,   0.2f),
            new Vector2(0.7f,   -1.2f),
            new Vector2(0.45f,  -2.0f),
            new Vector2(0.001f, -2.0f),
        };
        NVMeshes.Part(go, NVMeshes.Lathe(body, 20), hull, Vector3.zero, Vector3.zero, Vector3.one);
        NVMeshes.SpherePart(go, orange, new Vector3(0f, 0.3f, 1.1f), new Vector3(0.5f, 0.35f, 0.8f));

        // side weapon pods
        Vector2[] pod = {
            new Vector2(0.001f,  1.0f),
            new Vector2(0.28f,   0.5f),
            new Vector2(0.32f,  -0.5f),
            new Vector2(0.2f,   -0.9f),
            new Vector2(0.001f, -0.9f),
        };
        foreach (float side in new[] { -1f, 1f })
        {
            NVMeshes.Part(go, NVMeshes.Lathe(pod, 14), hull, new Vector3(side * 1.25f, -0.1f, 0.2f), Vector3.zero, Vector3.one);
            var stripe = GameObject.CreatePrimitive(PrimitiveType.Cube);
            Object.Destroy(stripe.GetComponent<Collider>());
            stripe.transform.SetParent(go.transform, false);
            stripe.transform.localPosition = new Vector3(side * 1.25f, 0.25f, 0.2f);
            stripe.transform.localScale = new Vector3(0.08f, 0.08f, 1.6f);
            stripe.GetComponent<MeshRenderer>().sharedMaterial = orange;
        }

        var glow = NVAssets.Quad(NVAssets.AdditiveTinted(new Color(1f, 0.6f, 0.2f)), 2f);
        glow.transform.SetParent(go.transform, false);
        glow.transform.localPosition = new Vector3(0f, 0f, -2.3f);
        glow.AddComponent<Billboard>();

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

        var col = go.AddComponent<BoxCollider>();
        col.size = new Vector3(9f, 5f, 46f);

        var rb = go.AddComponent<Rigidbody>();
        rb.useGravity = false;
        rb.mass = 400f;
        rb.linearDamping = 0f;
        rb.angularDamping = 3f;

        var h = go.AddComponent<Health>();
        h.Configure(400f, 1400f);
        h.shieldRegenPerSec = 10f;

        var boss = go.AddComponent<BossAI>();
        boss.turretMuzzles = turretMuzzles;
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

        var rb = go.GetComponent<Rigidbody>();
        rb.mass = 60f;
        var boss = go.AddComponent<MinibossAI>();
        boss.Configure(def);
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
