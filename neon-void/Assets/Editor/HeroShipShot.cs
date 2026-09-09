using System.IO;
using UnityEngine;
using UnityEditor;

// Reference renders of the four pilot hulls (front three-quarter, side, rear
// three-quarter) for trailer / loading-screen art generation.
public static class HeroShipShot
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
        var key = new GameObject("key").AddComponent<Light>();
        key.type = LightType.Directional; key.intensity = 1.3f;
        var fill = new GameObject("fill").AddComponent<Light>();
        fill.type = LightType.Directional; fill.intensity = 0.5f; fill.color = new Color(0.7f, 0.8f, 1f);
        fill.transform.rotation = Quaternion.Euler(-20f, 40f, 0f);

        var rt = new RenderTexture(1200, 800, 24);
        cam.targetTexture = rt;

        foreach (var pilot in ZealData.Pilots)
        {
            var prefab = Resources.Load<GameObject>("ships/ship_" + pilot.id);
            if (prefab == null) { Debug.LogWarning("HeroShipShot: no hull for " + pilot.id); continue; }
            var root = new GameObject("hero-" + pilot.id);
            var model = Object.Instantiate(prefab, root.transform);
            var rends = model.GetComponentsInChildren<Renderer>();
            var b = rends[0].bounds;
            foreach (var r in rends) b.Encapsulate(r.bounds);
            if (b.size.x > 0.0001f) model.transform.localScale *= 6f / b.size.x;
            b = rends[0].bounds;
            foreach (var r in rends) b.Encapsulate(r.bounds);
            model.transform.position += root.transform.position - b.center;
            var tex = Resources.Load<Texture2D>("ships/tex/ship_" + pilot.id + "_basecolor");
            foreach (var r in rends)
                foreach (var m in r.sharedMaterials)
                    if (m != null && tex != null) { m.mainTexture = tex; m.color = Color.white; }

            var views = new (string name, Vector3 pos)[] {
                ("front", new Vector3(-4.6f, 2.6f, 7.2f)),   // nose toward camera, three-quarter, from above
                ("side", new Vector3(-8.5f, 1.6f, 0f)),
                ("rear", new Vector3(4f, 2.6f, -7.2f)),
            };
            foreach (var v in views)
            {
                camGo.transform.position = v.pos;
                camGo.transform.LookAt(Vector3.zero);
                key.transform.rotation = Quaternion.LookRotation((Vector3.zero - v.pos).normalized + Vector3.down * 0.8f);
                cam.Render();
                RenderTexture.active = rt;
                var png = new Texture2D(rt.width, rt.height, TextureFormat.RGB24, false);
                png.ReadPixels(new Rect(0, 0, rt.width, rt.height), 0, 0);
                png.Apply();
                RenderTexture.active = null;
                File.WriteAllBytes(Path.Combine(outDir, "hero_" + pilot.id + "_" + v.name + ".png"), png.EncodeToPNG());
            }
            Debug.Log("HeroShipShot: " + pilot.id + " done, size=" + b.size);
            Object.DestroyImmediate(root);
        }
        Debug.Log("HeroShipShot: done");
    }
}
