using System.IO;
using UnityEngine;
using UnityEditor;

// Renders the four bosses as the game builds them, each with a bright green
// marker ahead of its +Z nose, so orientation can be checked by eye.
public static class BossShot
{
    public static void Render()
    {
        string outDir = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "booster-shots"));
        Directory.CreateDirectory(outDir);
        var camGo = new GameObject("cam");
        var cam = camGo.AddComponent<Camera>();
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = new Color(0.03f, 0.02f, 0.08f);
        cam.fieldOfView = 45f;
        var lightGo = new GameObject("sun");
        var light = lightGo.AddComponent<Light>();
        light.type = LightType.Directional;
        light.intensity = 1.3f;
        lightGo.transform.rotation = Quaternion.Euler(40f, 200f, 0f);

        var rt = new RenderTexture(1000, 800, 24);
        cam.targetTexture = rt;

        string[] ids = { "doom", "smuggler", "gruyere", "garrison" };
        foreach (string id in ids)
        {
            GameObject go;
            if (id == "doom") go = EnemyFactory.BuildDreadnought(Vector3.zero);
            else go = EnemyFactory.BuildMiniboss(Vector3.zero, System.Array.Find(ZealData.Bosses, b => b.id == id));
            var model = go.transform.Find("bossModel");
            Debug.Log("BossShot " + id + ": model=" + (model != null));
            var rends = model != null ? model.GetComponentsInChildren<Renderer>() : go.GetComponentsInChildren<Renderer>();
            var b = rends[0].bounds;
            foreach (var r in rends) b.Encapsulate(r.bounds);
            int withTex = 0;
            foreach (var r in rends) foreach (var m in r.sharedMaterials) if (m != null && m.mainTexture != null) withTex++;
            Debug.Log("BossShot " + id + ": size=" + b.size + " texturedMats=" + withTex);

            // nose marker: green ball ahead of +Z
            var marker = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            marker.transform.position = new Vector3(0f, 0f, b.max.z + b.size.z * 0.15f + 1f);
            marker.transform.localScale = Vector3.one * Mathf.Max(1f, b.size.z * 0.08f);
            var mm = new Material(Shader.Find("Standard")); mm.color = Color.green;
            mm.EnableKeyword("_EMISSION"); mm.SetColor("_EmissionColor", Color.green * 2f);
            marker.GetComponent<MeshRenderer>().sharedMaterial = mm;

            float big = Mathf.Max(b.size.x, b.size.y, b.size.z);
            camGo.transform.position = new Vector3(-big * 1.1f, big * 0.7f, big * 1.15f);
            camGo.transform.LookAt(new Vector3(0f, 0f, b.size.z * 0.1f));
            cam.Render();
            RenderTexture.active = rt;
            var png = new Texture2D(rt.width, rt.height, TextureFormat.RGB24, false);
            png.ReadPixels(new Rect(0, 0, rt.width, rt.height), 0, 0);
            png.Apply();
            RenderTexture.active = null;
            File.WriteAllBytes(Path.Combine(outDir, "boss_" + id + ".png"), png.EncodeToPNG());
            Object.DestroyImmediate(go);
            Object.DestroyImmediate(marker);
        }
        Debug.Log("BossShot: done");
    }
}
