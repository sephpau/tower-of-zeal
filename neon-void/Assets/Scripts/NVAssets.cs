using UnityEngine;

// Procedurally generated shared assets: textures, materials, meshes.
// Everything in Neon Void is built from code — no imported art.
public static class NVAssets
{
    static Texture2D _glowTex;
    static Material _additive, _hull, _cyanEmissive, _pinkEmissive, _rock;

    public static Texture2D GlowTex
    {
        get
        {
            if (_glowTex != null) return _glowTex;
            _glowTex = RadialTex(new Color(1f, 1f, 1f, 1f), new Color(1f, 1f, 1f, 0f));
            return _glowTex;
        }
    }

    public static Texture2D RadialTex(Color center, Color edge, float power = 2f)
    {
        const int S = 128;
        var t = new Texture2D(S, S, TextureFormat.RGBA32, false);
        var px = new Color[S * S];
        for (int y = 0; y < S; y++)
            for (int x = 0; x < S; x++)
            {
                float d = Vector2.Distance(new Vector2(x, y), new Vector2(S / 2f, S / 2f)) / (S / 2f);
                float k = Mathf.Pow(Mathf.Clamp01(1f - d), power);
                px[y * S + x] = Color.Lerp(edge, center, k);
            }
        t.SetPixels(px);
        t.Apply();
        return t;
    }

    public static Material Additive
    {
        get
        {
            if (_additive != null) return _additive;
            _additive = new Material(Shader.Find("Legacy Shaders/Particles/Additive"));
            _additive.mainTexture = GlowTex;
            return _additive;
        }
    }

    public static Material AdditiveTinted(Color c)
    {
        var m = new Material(Shader.Find("Legacy Shaders/Particles/Additive"));
        m.mainTexture = GlowTex;
        m.SetColor("_TintColor", c);
        return m;
    }

    public static Material Hull
    {
        get
        {
            if (_hull != null) return _hull;
            _hull = Standard(new Color(0.14f, 0.14f, 0.30f), 0.7f, 0.35f);
            return _hull;
        }
    }

    public static Material CyanEmissive
    {
        get
        {
            if (_cyanEmissive != null) return _cyanEmissive;
            _cyanEmissive = Emissive(new Color(0.2f, 0.85f, 1f), 3.2f);
            return _cyanEmissive;
        }
    }

    public static Material PinkEmissive
    {
        get
        {
            if (_pinkEmissive != null) return _pinkEmissive;
            _pinkEmissive = Emissive(new Color(1f, 0.3f, 0.8f), 3.2f);
            return _pinkEmissive;
        }
    }

    public static Material Rock
    {
        get
        {
            if (_rock != null) return _rock;
            // neutral grey-brown so hostiles (red/orange) stand apart
            _rock = Standard(new Color(0.36f, 0.33f, 0.3f), 0.05f, 0.9f);
            return _rock;
        }
    }

    public static Material Standard(Color albedo, float metallic, float smoothnessInverse)
    {
        var m = new Material(Shader.Find("Standard"));
        m.color = albedo;
        m.SetFloat("_Metallic", metallic);
        m.SetFloat("_Glossiness", 1f - smoothnessInverse);
        return m;
    }

    // Standard shader switched to Fade mode so color alpha works (cloaking)
    public static Material StandardFade(Color albedo, float metallic, float smoothnessInverse)
    {
        var m = Standard(albedo, metallic, smoothnessInverse);
        m.SetOverrideTag("RenderType", "Transparent");
        m.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
        m.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
        m.SetInt("_ZWrite", 0);
        m.EnableKeyword("_ALPHABLEND_ON");
        m.renderQueue = 3000;
        m.SetFloat("_Mode", 2f);
        return m;
    }

    public static Material Emissive(Color c, float intensity)
    {
        var m = Standard(c * 0.25f, 0.4f, 0.4f);
        m.EnableKeyword("_EMISSION");
        m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
        m.SetColor("_EmissionColor", c * intensity);
        return m;
    }

    // craggy flat-shaded rock: perturbed sphere with per-triangle normals
    public static Mesh RockMesh(int seed)
    {
        var tmp = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        var src = tmp.GetComponent<MeshFilter>().sharedMesh;
        var sv = src.vertices;
        var st = src.triangles;
        Object.Destroy(tmp);

        var rng = new System.Random(seed);
        float ox = (float)rng.NextDouble() * 100f, oy = (float)rng.NextDouble() * 100f;
        var displaced = new Vector3[sv.Length];
        for (int i = 0; i < sv.Length; i++)
        {
            Vector3 v = sv[i];
            float n = Mathf.PerlinNoise(ox + v.x * 1.6f + v.z * 0.9f, oy + v.y * 1.6f - v.z * 0.7f);
            displaced[i] = v * (0.72f + n * 0.55f);
        }

        // split every triangle so normals are flat
        var verts = new Vector3[st.Length];
        var tris = new int[st.Length];
        for (int i = 0; i < st.Length; i++)
        {
            verts[i] = displaced[st[i]];
            tris[i] = i;
        }
        var mesh = new Mesh { vertices = verts, triangles = tris };
        mesh.RecalculateNormals();
        mesh.RecalculateBounds();
        return mesh;
    }

    // flat ring (annulus) used for the planet's rings
    public static Mesh RingMesh(float rIn, float rOut, int segs = 96)
    {
        var verts = new Vector3[segs * 2];
        var uv = new Vector2[segs * 2];
        var tris = new int[segs * 6];
        for (int i = 0; i < segs; i++)
        {
            float a = i / (float)segs * Mathf.PI * 2f;
            float c = Mathf.Cos(a), s = Mathf.Sin(a);
            verts[i * 2] = new Vector3(c * rIn, 0, s * rIn);
            verts[i * 2 + 1] = new Vector3(c * rOut, 0, s * rOut);
            uv[i * 2] = new Vector2(0, 0);
            uv[i * 2 + 1] = new Vector2(1, 0);
            int ni = (i + 1) % segs;
            tris[i * 6 + 0] = i * 2; tris[i * 6 + 1] = ni * 2; tris[i * 6 + 2] = i * 2 + 1;
            tris[i * 6 + 3] = ni * 2; tris[i * 6 + 4] = ni * 2 + 1; tris[i * 6 + 5] = i * 2 + 1;
        }
        var mesh = new Mesh { vertices = verts, uv = uv, triangles = tris };
        mesh.RecalculateNormals();
        return mesh;
    }

    public static GameObject Quad(Material mat, float size)
    {
        var q = GameObject.CreatePrimitive(PrimitiveType.Quad);
        Object.Destroy(q.GetComponent<Collider>());
        q.GetComponent<MeshRenderer>().sharedMaterial = mat;
        q.transform.localScale = Vector3.one * size;
        return q;
    }
}
