using System.IO;
using UnityEngine;
using UnityEditor;

// Headless verification renders: mounts each pilot ship on a factory-built
// player and photographs the rear so booster glow seating can be checked
// without a WebGL build. Output: <project>/../booster-shots/<pilot>.png
public static class BoosterShot
{
    public static void Render()
    {
        string outDir = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "booster-shots"));
        Directory.CreateDirectory(outDir);

        var camGo = new GameObject("shotCam");
        var cam = camGo.AddComponent<Camera>();
        cam.backgroundColor = new Color(0.03f, 0.02f, 0.08f);
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.fieldOfView = 45f;

        var lightGo = new GameObject("shotLight");
        var light = lightGo.AddComponent<Light>();
        light.type = LightType.Directional;
        light.intensity = 1.1f;
        lightGo.transform.rotation = Quaternion.Euler(40f, 200f, 0f);

        var rt = new RenderTexture(1600, 1000, 24);

        foreach (string id in new[] { "ego", "captain", "chef", "lunar" })
        {
            var ship = PlayerShipFactory.Build(Vector3.zero);
            PilotShipModel.Swap(ship, id);

            // Swap uses Object.Destroy (deferred) — old models linger in
            // edit mode, so hard-remove anything it marked for death
            var parent = ship.transform.Find("visual");
            if (parent == null) parent = ship.transform;
            foreach (string old in new[] { "egoshipModel" })
            {
                var t = parent.Find(old);
                if (t != null) Object.DestroyImmediate(t.gameObject);
            }

            // straight-on rear at hull height — the booster orbs must be visible here
            camGo.transform.position = new Vector3(0f, 0.9f, -9.5f);
            camGo.transform.LookAt(new Vector3(0f, 0.2f, 0f));

            cam.targetTexture = rt;
            cam.Render();
            RenderTexture.active = rt;
            var tex = new Texture2D(rt.width, rt.height, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, rt.width, rt.height), 0, 0);
            tex.Apply();
            RenderTexture.active = null;
            cam.targetTexture = null;

            File.WriteAllBytes(Path.Combine(outDir, id + ".png"), tex.EncodeToPNG());
            Object.DestroyImmediate(tex);
            Object.DestroyImmediate(ship);
            Debug.Log("BoosterShot: wrote " + id + ".png");
        }

        Object.DestroyImmediate(rt);
        Object.DestroyImmediate(camGo);
        Object.DestroyImmediate(lightGo);
        Debug.Log("BoosterShot: done -> " + outDir);
    }
}
