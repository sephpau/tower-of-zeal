using System.IO;
using UnityEngine;
using UnityEditor;

// Headless proof that the Doom Totem renders with its textures through the
// same lookup the game uses at runtime (Resources.LoadAll on decimation/tex).
public static class TotemShot
{
    public static void Render()
    {
        string outDir = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "booster-shots"));
        Directory.CreateDirectory(outDir);
        var camGo = new GameObject("cam");
        var cam = camGo.AddComponent<Camera>();
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = new Color(0.03f, 0.02f, 0.08f);
        cam.fieldOfView = 40f;
        var lightGo = new GameObject("sun");
        var light = lightGo.AddComponent<Light>();
        light.type = LightType.Directional;
        light.intensity = 1.2f;
        lightGo.transform.rotation = Quaternion.Euler(35f, 160f, 0f);

        var prefab = Resources.Load<GameObject>("decimation/doom_totem");
        if (prefab == null) { Debug.LogError("TotemShot: prefab missing"); return; }
        var root = new GameObject("totem");
        var model = Object.Instantiate(prefab, root.transform);
        var rends = model.GetComponentsInChildren<Renderer>();
        var b = rends[0].bounds;
        foreach (var r in rends) b.Encapsulate(r.bounds);
        float tall = Mathf.Max(b.size.x, b.size.y, b.size.z);
        model.transform.localScale *= 10f / tall;
        b = rends[0].bounds;
        foreach (var r in rends) b.Encapsulate(r.bounds);
        model.transform.position += root.transform.position - b.center;

        Texture2D tex = null;
        foreach (var t in Resources.LoadAll<Texture2D>("decimation/tex"))
        {
            string n = t.name.ToLowerInvariant();
            if (tex == null || n.Contains("base") || n.Contains("color") || n.Contains("albedo") || n.Contains("diffuse")) tex = t;
        }
        int already = 0, applied = 0;
        foreach (var r in rends)
            foreach (var m in r.sharedMaterials)
            {
                if (m == null) continue;
                if (m.mainTexture != null) { already++; continue; }
                if (tex != null) { m.mainTexture = tex; m.color = Color.white; applied++; }
            }
        Debug.Log("TotemShot: textures found=" + Resources.LoadAll<Texture2D>("decimation/tex").Length + " picked=" + (tex != null ? tex.name : "none") + " materialsWithTex=" + already + " appliedNow=" + applied);

        camGo.transform.position = new Vector3(0f, 1.5f, -16f);
        camGo.transform.LookAt(new Vector3(0f, 0f, 0f));
        var rt = new RenderTexture(900, 1100, 24);
        cam.targetTexture = rt;
        cam.Render();
        RenderTexture.active = rt;
        var png = new Texture2D(rt.width, rt.height, TextureFormat.RGB24, false);
        png.ReadPixels(new Rect(0, 0, rt.width, rt.height), 0, 0);
        png.Apply();
        RenderTexture.active = null;
        File.WriteAllBytes(Path.Combine(outDir, "totem.png"), png.EncodeToPNG());
        Debug.Log("TotemShot: wrote totem.png");
    }
}
