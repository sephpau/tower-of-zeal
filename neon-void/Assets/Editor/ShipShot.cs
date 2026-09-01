using System.IO;
using UnityEditor;
using UnityEngine;

// Headless visual check for Ego's ship model: attaches Resources/egoship.fbx
// the same way PlayerShipFactory does (EgoShipModel.Attach + material remap)
// and renders front-3/4 and rear-3/4 instances into one PNG. Verifies
// orientation, scale normalization, and material remapping without a build.
public static class ShipShot
{
    public static void Shot()
    {
        UnityEditor.SceneManagement.EditorSceneManager.NewScene(
            UnityEditor.SceneManagement.NewSceneSetup.EmptyScene,
            UnityEditor.SceneManagement.NewSceneMode.Single);

        var camGo = new GameObject("cam");
        var cam = camGo.AddComponent<Camera>();
        cam.transform.SetPositionAndRotation(Vector3.zero, Quaternion.identity);
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = new Color(0.045f, 0.02f, 0.13f);
        cam.fieldOfView = 60f;

        Spawn(new Vector3(-3.4f, 0f, 9f), Quaternion.Euler(15f, 155f, 0f));   // front 3/4
        Spawn(new Vector3(3.4f, 0f, 9f), Quaternion.Euler(-12f, 35f, 0f));    // rear 3/4

        var sun = new GameObject("sun").AddComponent<Light>();
        sun.type = LightType.Directional;
        sun.transform.rotation = Quaternion.Euler(35f, -25f, 0f);
        sun.intensity = 1.4f;
        var fill = new GameObject("fill").AddComponent<Light>();
        fill.type = LightType.Point;
        fill.transform.position = new Vector3(0f, 2f, 3f);
        fill.intensity = 2f;
        fill.range = 20f;

        var rt = new RenderTexture(1280, 720, 24);
        cam.targetTexture = rt;
        cam.Render();
        RenderTexture.active = rt;
        var tex = new Texture2D(1280, 720, TextureFormat.RGB24, false);
        tex.ReadPixels(new Rect(0, 0, 1280, 720), 0, 0);
        tex.Apply();
        File.WriteAllBytes(@"D:\Claude files\neon-void\ship-shot.png", tex.EncodeToPNG());
        Debug.Log("ShipShot written");
        EditorApplication.Exit(0);
    }

    static void Spawn(Vector3 pos, Quaternion rot)
    {
        var holder = new GameObject("shipHolder");
        holder.transform.SetPositionAndRotation(pos, rot);
        var tint = holder.AddComponent<ShipTint>();
        var model = EgoShipModel.Attach(holder, tint);
        if (model == null) Debug.LogError("ShipShot: Resources/egoship not found");
    }
}
