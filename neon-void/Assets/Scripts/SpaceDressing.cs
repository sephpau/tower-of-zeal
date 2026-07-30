using UnityEngine;

// The sky: starfield, nebula sprites, a huge ringed planet and a neon sun.
// Everything lives under a rig that copies the camera's position each frame,
// so the backdrop stays at infinity (classic skybox-object trick).
public class SpaceDressing : MonoBehaviour
{
    Transform _rig;
    Transform _cam;

    public void Build(Transform cam)
    {
        _cam = cam;
        _rig = new GameObject("SkyRig").transform;

        RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
        RenderSettings.ambientLight = new Color(0.28f, 0.2f, 0.42f);
        RenderSettings.fog = false;

        BuildStars();
        BuildNebula();
        BuildSolarSystem();
        BuildSun();
    }

    void BuildStars()
    {
        var go = new GameObject("stars");
        go.transform.SetParent(_rig, false);
        var ps = go.AddComponent<ParticleSystem>();
        var main = ps.main;
        main.loop = false;
        main.startLifetime = float.MaxValue;
        main.startSpeed = 0f;
        main.startSize = new ParticleSystem.MinMaxCurve(2.2f, 7f);
        main.startColor = new ParticleSystem.MinMaxGradient(new Color(1f, 1f, 1f, 0.9f), new Color(0.65f, 0.85f, 1f, 0.8f));
        main.maxParticles = 3200;
        main.simulationSpace = ParticleSystemSimulationSpace.Local;

        var emission = ps.emission;
        emission.enabled = false;

        var particles = new ParticleSystem.Particle[3000];
        for (int i = 0; i < particles.Length; i++)
        {
            particles[i].position = Random.onUnitSphere * Random.Range(1800f, 2400f);
            particles[i].startSize = Random.Range(2.2f, 7f);
            particles[i].startColor = Random.value > 0.75f
                ? new Color(0.65f, 0.85f, 1f, 0.85f)
                : new Color(1f, 1f, 1f, Random.Range(0.4f, 0.95f));
            particles[i].remainingLifetime = float.MaxValue;
        }
        ps.SetParticles(particles, particles.Length);

        var r = go.GetComponent<ParticleSystemRenderer>();
        r.material = NVAssets.Additive;
        r.renderMode = ParticleSystemRenderMode.Billboard;
    }

    void BuildNebula()
    {
        Color[] tints = {
            new Color(0.45f, 0.2f, 0.9f, 0.16f),
            new Color(1f, 0.3f, 0.8f, 0.10f),
            new Color(0.2f, 0.7f, 1f, 0.09f),
            new Color(1f, 0.55f, 0.25f, 0.07f),
        };
        for (int i = 0; i < 14; i++)
        {
            var tint = tints[i % tints.Length];
            var mat = new Material(Shader.Find("Legacy Shaders/Particles/Alpha Blended"));
            mat.mainTexture = NVAssets.RadialTex(tint, new Color(tint.r, tint.g, tint.b, 0f), 1.6f);
            mat.SetColor("_TintColor", Color.white);
            var q = NVAssets.Quad(mat, Random.Range(1200f, 2600f));
            q.name = "nebula";
            q.transform.SetParent(_rig, false);
            Vector3 dir = Random.onUnitSphere;
            dir.y = Mathf.Abs(dir.y) * (Random.value > 0.5f ? 0.6f : -0.6f);
            q.transform.localPosition = dir.normalized * 3000f;
            q.transform.LookAt(_rig, Vector3.up);
            q.AddComponent<Billboard>();
        }
    }

    // All eight planets, procedurally textured, spread around the sky.
    // Sizes/positions are theatrical, not to scale — this is a stage set.
    void BuildSolarSystem()
    {
        // Mercury — cratered gray
        Planet("Mercury", Blotchy(new Color(0.45f, 0.42f, 0.4f), new Color(0.3f, 0.28f, 0.27f), 7f, 0.5f),
            new Vector3(-1800f, 500f, 2800f), 90f);
        // Venus — creamy swirl
        Planet("Venus", Banded(new[] { new Color(0.93f, 0.83f, 0.6f), new Color(0.85f, 0.7f, 0.45f), new Color(0.95f, 0.88f, 0.7f) }, 5f, 0.3f),
            new Vector3(-2600f, -200f, 1400f), 200f);
        // Earth — oceans, continents, clouds
        Planet("Earth", EarthTex(), new Vector3(2400f, 700f, -1500f), 260f);
        // Mars — rust with darker maria
        Planet("Mars", Blotchy(new Color(0.78f, 0.4f, 0.22f), new Color(0.55f, 0.26f, 0.15f), 5f, 0.45f),
            new Vector3(2900f, -400f, 800f), 150f);
        // Jupiter — big banded giant with a red spot
        var jup = Planet("Jupiter", JupiterTex(), new Vector3(-900f, 900f, -3100f), 850f);
        // Saturn — the showpiece, with rings, roughly where the old planet was
        var sat = Planet("Saturn", Banded(new[] { new Color(0.9f, 0.8f, 0.6f), new Color(0.8f, 0.68f, 0.48f), new Color(0.95f, 0.87f, 0.68f), new Color(0.75f, 0.62f, 0.45f) }, 9f, 0.25f),
            new Vector3(1600f, 300f, 2600f), 700f);
        AddRing(sat, 0.75f, 1.4f, new Color(0.95f, 0.82f, 0.6f, 0.55f), 24f, 21f);
        // Uranus — pale cyan, thin vertical ring (it really is tilted ~98°)
        var ura = Planet("Uranus", Banded(new[] { new Color(0.62f, 0.85f, 0.9f), new Color(0.55f, 0.8f, 0.88f) }, 3f, 0.15f),
            new Vector3(-3100f, 100f, -900f), 320f);
        AddRing(ura, 0.85f, 1.15f, new Color(0.7f, 0.9f, 1f, 0.3f), 88f, 0f);
        // Neptune — deep blue with streaks
        Planet("Neptune", Banded(new[] { new Color(0.2f, 0.35f, 0.85f), new Color(0.15f, 0.28f, 0.7f), new Color(0.3f, 0.5f, 0.95f) }, 6f, 0.35f),
            new Vector3(600f, -900f, -3300f), 300f);
    }

    GameObject Planet(string name, Texture2D tex, Vector3 pos, float diameter)
    {
        var planet = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        Object.Destroy(planet.GetComponent<Collider>());
        planet.name = name;
        planet.transform.SetParent(_rig, false);
        planet.transform.localPosition = pos;
        planet.transform.localScale = Vector3.one * diameter;
        var mat = NVAssets.Standard(Color.white, 0f, 0.95f);
        mat.mainTexture = tex;
        mat.EnableKeyword("_EMISSION");
        mat.SetColor("_EmissionColor", new Color(0.22f, 0.2f, 0.24f));   // readable night side
        mat.SetTexture("_EmissionMap", tex);
        planet.GetComponent<MeshRenderer>().sharedMaterial = mat;
        planet.AddComponent<SlowSpin>();
        return planet;
    }

    void AddRing(GameObject planet, float rIn, float rOut, Color tint, float tiltX, float tiltZ)
    {
        var ringGo = new GameObject("rings");
        ringGo.transform.SetParent(planet.transform, false);
        ringGo.transform.localRotation = Quaternion.Euler(tiltX, 0f, tiltZ);
        ringGo.AddComponent<MeshFilter>().sharedMesh = NVAssets.RingMesh(rIn, rOut);
        var mr = ringGo.AddComponent<MeshRenderer>();
        var ringMat = new Material(Shader.Find("Legacy Shaders/Particles/Alpha Blended"));
        var tex = new Texture2D(64, 1, TextureFormat.RGBA32, false);
        for (int x = 0; x < 64; x++)
        {
            float u = x / 63f;
            float band = 0.45f + 0.55f * Mathf.Abs(Mathf.Sin(u * 21f));
            float fade = Mathf.Sin(u * Mathf.PI);
            tex.SetPixel(x, 0, new Color(tint.r, tint.g, tint.b, tint.a * band * fade));
        }
        tex.Apply();
        ringMat.mainTexture = tex;
        mr.sharedMaterial = ringMat;
    }

    // ---------- planet textures ----------
    static Texture2D Banded(Color[] bands, float freq, float turbulence)
    {
        const int W = 256, H = 128;
        var t = new Texture2D(W, H, TextureFormat.RGBA32, false);
        for (int y = 0; y < H; y++)
        {
            float v = y / (float)H;
            for (int x = 0; x < W; x++)
            {
                float n = Mathf.PerlinNoise(x / 22f, y / 9f) * turbulence;
                float band = (v + n) * freq;
                Color a = bands[Mathf.FloorToInt(band) % bands.Length];
                Color b = bands[(Mathf.FloorToInt(band) + 1) % bands.Length];
                t.SetPixel(x, y, Color.Lerp(a, b, Mathf.SmoothStep(0f, 1f, band % 1f)));
            }
        }
        t.wrapMode = TextureWrapMode.Repeat;
        t.Apply();
        return t;
    }

    static Texture2D Blotchy(Color baseCol, Color spotCol, float scale, float threshold)
    {
        const int W = 256, H = 128;
        var t = new Texture2D(W, H, TextureFormat.RGBA32, false);
        for (int y = 0; y < H; y++)
            for (int x = 0; x < W; x++)
            {
                float n = Mathf.PerlinNoise(x / (W / scale), y / (H / scale) + 40f);
                t.SetPixel(x, y, Color.Lerp(baseCol, spotCol, Mathf.SmoothStep(threshold - 0.15f, threshold + 0.15f, n)));
            }
        t.wrapMode = TextureWrapMode.Repeat;
        t.Apply();
        return t;
    }

    static Texture2D EarthTex()
    {
        const int W = 256, H = 128;
        var t = new Texture2D(W, H, TextureFormat.RGBA32, false);
        var ocean = new Color(0.12f, 0.3f, 0.65f);
        var land = new Color(0.25f, 0.5f, 0.2f);
        var desert = new Color(0.7f, 0.6f, 0.35f);
        for (int y = 0; y < H; y++)
        {
            float lat = Mathf.Abs(y / (float)H - 0.5f) * 2f;
            for (int x = 0; x < W; x++)
            {
                float cont = Mathf.PerlinNoise(x / 38f, y / 22f + 7f);
                Color c = cont > 0.55f
                    ? Color.Lerp(land, desert, Mathf.PerlinNoise(x / 15f, y / 15f))
                    : ocean;
                if (lat > 0.82f) c = Color.Lerp(c, Color.white, (lat - 0.82f) / 0.18f * 1.4f);   // ice caps
                float cloud = Mathf.PerlinNoise(x / 20f + 99f, y / 10f);
                if (cloud > 0.62f) c = Color.Lerp(c, Color.white, (cloud - 0.62f) * 2f);
                t.SetPixel(x, y, c);
            }
        }
        t.wrapMode = TextureWrapMode.Repeat;
        t.Apply();
        return t;
    }

    static Texture2D JupiterTex()
    {
        var t = Banded(new[] {
            new Color(0.85f, 0.75f, 0.6f), new Color(0.7f, 0.5f, 0.35f),
            new Color(0.9f, 0.85f, 0.75f), new Color(0.6f, 0.42f, 0.3f),
            new Color(0.8f, 0.68f, 0.55f),
        }, 11f, 0.35f);
        // great red spot
        for (int y = 0; y < 128; y++)
            for (int x = 0; x < 256; x++)
            {
                float dx = (x - 70f) / 20f, dy = (y - 42f) / 11f;
                float d = dx * dx + dy * dy;
                if (d < 1f)
                    t.SetPixel(x, y, Color.Lerp(new Color(0.75f, 0.28f, 0.16f), t.GetPixel(x, y), Mathf.SmoothStep(0.55f, 1f, d)));
            }
        t.Apply();
        return t;
    }

    void BuildSun()
    {
        var mat = new Material(Shader.Find("Legacy Shaders/Particles/Additive"));
        mat.mainTexture = NVAssets.RadialTex(new Color(1f, 0.85f, 0.55f, 1f), new Color(1f, 0.25f, 0.55f, 0f), 1.3f);
        var q = NVAssets.Quad(mat, 2200f);
        q.name = "sun";
        q.transform.SetParent(_rig, false);
        q.transform.localPosition = new Vector3(-2400f, -400f, 2200f);
        q.AddComponent<Billboard>();

        var lightGo = new GameObject("sunlight");
        var l = lightGo.AddComponent<Light>();
        l.type = LightType.Directional;
        l.color = new Color(1f, 0.85f, 0.75f);
        l.intensity = 1.25f;
        lightGo.transform.rotation = Quaternion.LookRotation(new Vector3(0.55f, 0.12f, -0.5f));

        var rim = new GameObject("rimlight").AddComponent<Light>();
        rim.type = LightType.Directional;
        rim.color = new Color(0.7f, 0.3f, 1f);
        rim.intensity = 0.5f;
        rim.transform.rotation = Quaternion.LookRotation(new Vector3(-0.4f, -0.3f, 0.6f));
    }

    void LateUpdate()
    {
        if (_cam != null && _rig != null)
            _rig.position = _cam.position;
    }
}

public class SlowSpin : MonoBehaviour
{
    void Update() { transform.Rotate(0f, 0.35f * Time.deltaTime, 0f, Space.Self); }
}
