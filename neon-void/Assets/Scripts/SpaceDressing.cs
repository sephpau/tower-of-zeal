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
        BuildPlanet();
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

    void BuildPlanet()
    {
        var planet = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        Object.Destroy(planet.GetComponent<Collider>());
        planet.name = "planet";
        planet.transform.SetParent(_rig, false);
        planet.transform.localPosition = new Vector3(1600f, 300f, 2600f);
        planet.transform.localScale = Vector3.one * 1500f;
        var pm = NVAssets.Standard(new Color(0.95f, 0.72f, 0.55f), 0f, 0.9f);
        pm.EnableKeyword("_EMISSION");
        pm.SetColor("_EmissionColor", new Color(0.35f, 0.2f, 0.18f));
        planet.GetComponent<MeshRenderer>().sharedMaterial = pm;

        var ringGo = new GameObject("rings");
        ringGo.transform.SetParent(planet.transform, false);
        ringGo.transform.localScale = Vector3.one;   // ring mesh radii are in planet-local units
        ringGo.transform.localRotation = Quaternion.Euler(24f, 0f, 12f);
        var mf = ringGo.AddComponent<MeshFilter>();
        mf.sharedMesh = NVAssets.RingMesh(0.75f, 1.35f);
        var mr = ringGo.AddComponent<MeshRenderer>();
        var ringMat = new Material(Shader.Find("Legacy Shaders/Particles/Alpha Blended"));
        var ringTint = new Color(0.95f, 0.82f, 0.6f, 0.55f);
        var tex = new Texture2D(64, 1, TextureFormat.RGBA32, false);
        for (int x = 0; x < 64; x++)
        {
            float u = x / 63f;
            float band = 0.45f + 0.55f * Mathf.Abs(Mathf.Sin(u * 21f));
            float fade = Mathf.Sin(u * Mathf.PI);
            tex.SetPixel(x, 0, new Color(ringTint.r, ringTint.g, ringTint.b, ringTint.a * band * fade));
        }
        tex.Apply();
        ringMat.mainTexture = tex;
        mr.sharedMaterial = ringMat;
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
